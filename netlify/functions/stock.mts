import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { actorName, guard } from "../lib/auth.mts";
import { db, fail, json, readBody } from "../lib/http.mts";

type StockRow = { sku: string; name: string; warehouse: string; quantity: number; reorder_level: number; unit_cost_kobo: number | null; product_slug: string | null; updated_at: string };
type UploadRow = { id: number; filename: string; rows_total: number; rows_applied: number; rows_failed: number; status: string; errors: unknown; uploaded_by: string; created_at: string };

const COLUMNS = ["sku", "name", "quantity", "warehouse", "reorder_level", "unit_cost_naira", "product"];
const TEMPLATE = COLUMNS.join(",") + "\nLITLI-WM,ENA LIT LI - wall-mounted,175,abuja-hq,40,,ena-lit-li\n";
const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2000;

const shape = (s: StockRow) => ({
  sku: s.sku, name: s.name, warehouse: s.warehouse, quantity: s.quantity, reorderLevel: s.reorder_level,
  unitCostKobo: s.unit_cost_kobo, product: s.product_slug, updatedAt: s.updated_at,
});

/** RFC 4180-style CSV: quoted fields, doubled quotes, CRLF or LF line endings. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = input.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

async function list() {
  const sql = db().sql;
  const rows = await sql<StockRow>`
    SELECT s.sku, s.name, s.warehouse, s.quantity, s.reorder_level, s.unit_cost_kobo, s.updated_at, p.slug AS product_slug
    FROM stock_items s LEFT JOIN products p ON p.id = s.product_id ORDER BY s.warehouse, s.sku`;
  return json({
    summary: {
      skus: rows.length,
      units: rows.reduce((n, s) => n + s.quantity, 0),
      belowReorder: rows.filter((s) => s.quantity <= s.reorder_level).length,
    },
    stock: rows.map(shape),
  });
}

async function uploads() {
  const rows = await db().sql<UploadRow>`SELECT * FROM stock_uploads ORDER BY created_at DESC LIMIT 50`;
  return json({
    uploads: rows.map((u) => ({
      id: u.id, filename: u.filename, rowsTotal: u.rows_total, rowsApplied: u.rows_applied, rowsFailed: u.rows_failed,
      status: u.status, errors: u.errors, uploadedBy: u.uploaded_by, createdAt: u.created_at,
    })),
  });
}

async function adjust(req: Request, sku: string) {
  const body = await readBody(req);
  const sql = db().sql;
  let rows: unknown[];
  if (body && body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10_000_000) return fail("The quantity should be a whole number of zero or more.");
    rows = await sql`UPDATE stock_items SET quantity = ${quantity}, updated_at = now() WHERE sku = ${sku} RETURNING sku`;
  } else if (body && body.delta !== undefined) {
    const delta = Number(body.delta);
    if (!Number.isInteger(delta) || Math.abs(delta) > 10_000_000) return fail("The adjustment should be a whole number.");
    rows = await sql`UPDATE stock_items SET quantity = GREATEST(quantity + ${delta}, 0), updated_at = now() WHERE sku = ${sku} RETURNING sku`;
  } else {
    return fail('Send either {"quantity": n} or {"delta": n}.');
  }
  if (!rows.length) return fail("No stock item with that SKU.", 404);
  const [row] = await sql<StockRow>`
    SELECT s.*, p.slug AS product_slug FROM stock_items s LEFT JOIN products p ON p.id = s.product_id WHERE s.sku = ${sku}`;
  return json({ item: shape(row) });
}

async function upload(req: Request, uploadedBy: string) {
  const mode = new URL(req.url).searchParams.get("mode") === "add" ? "add" : "set";
  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return fail("Send the CSV as a multipart form with a field called file.");
  }
  if (!file) return fail("Choose a CSV file to upload.");
  if (file.size > MAX_BYTES) return fail("That file is over 1 MB. Split it into smaller files.", 413);
  const filename = (file.name || "stock.csv").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const raw = await file.text();

  const table = parseCsv(raw);
  if (!table.length) return fail("That file is empty.");
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!header.includes("sku")) return fail(`The first row must be a header that includes sku. Expected columns: ${COLUMNS.join(", ")}.`);
  const data = table.slice(1);
  if (!data.length) return fail("The file has a header but no rows.");
  if (data.length > MAX_ROWS) return fail(`Upload at most ${MAX_ROWS} rows at a time.`, 413);

  // Keep the original file alongside the result, so any upload can be audited later.
  const blobKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${filename}`;
  await getStore("stock-uploads").set(blobKey, raw, { metadata: { filename, mode, uploadedBy } });

  const sql = db().sql;
  const products = new Map((await sql<{ id: number; slug: string }>`SELECT id, slug FROM products`).map((p) => [p.slug, p.id]));
  const errors: { row: number; sku: string; reason: string }[] = [];
  let applied = 0;

  for (let i = 0; i < data.length; i++) {
    const rowNumber = i + 2;
    const get = (col: string) => {
      const index = header.indexOf(col);
      return index >= 0 ? (data[i][index] ?? "").trim() : "";
    };
    const sku = get("sku").toUpperCase();
    const reject = (reason: string) => errors.push({ row: rowNumber, sku: sku || "(blank)", reason });
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku)) { reject("SKU missing or has characters other than letters, digits, . _ -"); continue; }

    const qtyText = get("quantity");
    const quantity = qtyText === "" ? null : Number(qtyText.replace(/,/g, ""));
    if (quantity !== null && (!Number.isInteger(quantity) || (mode === "set" && quantity < 0))) { reject("quantity must be a whole number"); continue; }
    const reorderText = get("reorder_level");
    const reorder = reorderText === "" ? null : Number(reorderText.replace(/,/g, ""));
    if (reorder !== null && (!Number.isInteger(reorder) || reorder < 0)) { reject("reorder_level must be a whole number"); continue; }
    const costText = get("unit_cost_naira").replace(/[₦,\s]/g, "");
    const cost = costText === "" ? null : Math.round(Number(costText) * 100);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) { reject("unit_cost_naira must be a number"); continue; }
    const slug = get("product").toLowerCase();
    const productId = slug ? products.get(slug) : null;
    if (slug && !productId) { reject(`unknown product "${slug}"`); continue; }
    const name = get("name").slice(0, 200);
    const warehouse = get("warehouse").toLowerCase().slice(0, 60);

    const [existing] = await sql<{ quantity: number }>`SELECT quantity FROM stock_items WHERE sku = ${sku}`;
    if (!existing) {
      if (!name) { reject("new SKU needs a name"); continue; }
      if (quantity !== null && quantity < 0) { reject("a new SKU can't start below zero"); continue; }
      await sql`
        INSERT INTO stock_items (sku, product_id, name, warehouse, quantity, reorder_level, unit_cost_kobo)
        VALUES (${sku}, ${productId ?? null}, ${name}, ${warehouse || "abuja-hq"}, ${quantity ?? 0}, ${reorder ?? 0}, ${cost})`;
    } else {
      const next = quantity === null ? existing.quantity : mode === "add" ? existing.quantity + quantity : quantity;
      if (next < 0) { reject(`would take stock below zero (on hand ${existing.quantity})`); continue; }
      await sql`
        UPDATE stock_items SET quantity = ${next},
          name = COALESCE(${name || null}, name), warehouse = COALESCE(${warehouse || null}, warehouse),
          reorder_level = COALESCE(${reorder}::int, reorder_level), unit_cost_kobo = COALESCE(${cost}::int, unit_cost_kobo),
          product_id = COALESCE(${productId ?? null}::int, product_id), updated_at = now()
        WHERE sku = ${sku}`;
    }
    applied++;
  }

  const status = errors.length === 0 ? "processed" : applied > 0 ? "partial" : "failed";
  await sql`
    INSERT INTO stock_uploads (filename, blob_key, rows_total, rows_applied, rows_failed, status, errors, uploaded_by)
    VALUES (${filename}, ${blobKey}, ${data.length}, ${applied}, ${errors.length}, ${status},
            ${JSON.stringify(errors.slice(0, 200))}::jsonb, ${uploadedBy})`;
  return json({ applied, failed: errors.length, status, errors: errors.slice(0, 50) }, applied ? 200 : 422);
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/^\/api(\/v1)?\/stock/, "");

  // The template is a blank form, so anyone may download it.
  if (path === "/upload" && req.method === "GET") {
    return new Response(TEMPLATE, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="ena-stock-template.csv"' },
    });
  }

  const actor = await guard(req, req.method === "GET" ? "read" : "write");
  if (actor instanceof Response) return actor;

  if (path === "/upload") return req.method === "POST" ? upload(req, actorName(actor)) : fail("Use POST to upload.", 405);
  if (path === "/uploads") return req.method === "GET" ? uploads() : fail("Upload history is read-only.", 405);
  if (path === "" || path === "/") return req.method === "GET" ? list() : fail("Use PATCH /api/stock/:sku to change a row.", 405);
  if (req.method !== "PATCH") return fail("Use PATCH to change a stock row.", 405);
  return adjust(req, decodeURIComponent(context.params?.sku || path.slice(1)).toUpperCase());
};

export const config: Config = {
  path: [
    "/api/stock", "/api/v1/stock", "/api/stock/upload", "/api/v1/stock/upload",
    "/api/stock/uploads", "/api/v1/stock/uploads", "/api/stock/:sku", "/api/v1/stock/:sku",
  ],
  method: ["GET", "POST", "PATCH"],
};
