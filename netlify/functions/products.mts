import type { Config, Context } from "@netlify/functions";
import { guard } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";

type ProductRow = {
  slug: string; name: string; category: string; tagline: string; description: string;
  price_kobo: number | null; price_note: string; status: string; specs: unknown;
};

const STATUSES = new Set(["available", "in-production", "pre-order", "discontinued"]);

function shape(p: ProductRow) {
  return {
    slug: p.slug, name: p.name, category: p.category, tagline: p.tagline, description: p.description,
    priceKobo: p.price_kobo, priceNote: p.price_note, status: p.status, specs: p.specs ?? [],
  };
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
}

/** Validates the editable fields; returns an error message or the clean values. */
function fields(body: Record<string, unknown>) {
  const name = text(body.name, 120);
  const category = text(body.category, 40).toLowerCase();
  const status = text(body.status, 40) || "available";
  const price = body.priceKobo === null || body.priceKobo === undefined || body.priceKobo === "" ? null : Math.round(Number(body.priceKobo));
  if (!name) return "Please give the product a name.";
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(category)) return "The category should be a single lowercase word, such as solar or storage.";
  if (!STATUSES.has(status)) return "Choose a status: available, in-production, pre-order or discontinued.";
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 2_000_000_000)) return "The price doesn't look right.";
  return {
    name, category, status, priceKobo: price,
    tagline: text(body.tagline, 200), description: text(body.description, 5000), priceNote: text(body.priceNote, 120),
  };
}

async function write(req: Request, slug: string | undefined) {
  const actor = await guard(req, "write");
  if (actor instanceof Response) return actor;
  const body = await readBody(req);
  if (!body) return fail("Send the product details as JSON.");
  const f = fields(body);
  if (typeof f === "string") return fail(f);
  const sql = db().sql;

  if (slug) {
    const [row] = await sql<ProductRow>`
      UPDATE products SET name = ${f.name}, category = ${f.category}, tagline = ${f.tagline}, description = ${f.description},
        price_kobo = ${f.priceKobo}, price_note = ${f.priceNote}, status = ${f.status}, updated_at = now()
      WHERE slug = ${slug} RETURNING *`;
    return row ? json({ product: shape(row) }) : fail("Product not found.", 404);
  }

  // New products take a slug from their name, with a number added if it's taken.
  const base = slugify(text(body.slug, 60) || f.name);
  const taken = await sql<{ slug: string }>`SELECT slug FROM products WHERE slug = ${base} OR slug LIKE ${base + "-%"}`;
  const used = new Set(taken.map((t) => t.slug));
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
  const [row] = await sql<ProductRow>`
    INSERT INTO products (slug, name, category, tagline, description, price_kobo, price_note, status)
    VALUES (${candidate}, ${f.name}, ${f.category}, ${f.tagline}, ${f.description}, ${f.priceKobo}, ${f.priceNote}, ${f.status})
    RETURNING *`;
  return json({ product: shape(row) }, 201);
}

export default async (req: Request, context: Context) => {
  const slug = context.params?.slug;
  if (req.method === "POST") return slug ? fail("Use PATCH to change an existing product.", 405) : write(req, undefined);
  if (req.method === "PATCH") return slug ? write(req, slug) : fail("Say which product to change: PATCH /api/products/:slug.", 405);

  const sql = db().sql;
  if (slug) {
    const [row] = await sql<ProductRow>`SELECT * FROM products WHERE slug = ${slug} LIMIT 1`;
    return row ? json({ product: shape(row) }) : fail("Product not found.", 404);
  }
  const category = new URL(req.url).searchParams.get("category");
  const rows = category
    ? await sql<ProductRow>`SELECT * FROM products WHERE category = ${category} ORDER BY sort_order, name`
    : await sql<ProductRow>`SELECT * FROM products ORDER BY sort_order, name`;
  return json({ products: rows.map(shape) });
};

export const config: Config = {
  path: ["/api/products", "/api/v1/products", "/api/products/:slug", "/api/v1/products/:slug"],
  method: ["GET", "POST", "PATCH"],
};
