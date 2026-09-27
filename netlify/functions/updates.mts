import type { Config, Context } from "@netlify/functions";
import { guard, identify } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";

type UpdateRow = {
  id: number; title: string; body: string; kind: string; published: boolean; published_at: string;
  product_name: string | null; product_slug: string | null;
};

const KINDS = new Set(["release", "notice", "firmware", "pricing"]);

const shape = (u: UpdateRow) => ({
  id: u.id, title: u.title, body: u.body, kind: u.kind, published: u.published, publishedAt: u.published_at,
  productName: u.product_name, productSlug: u.product_slug,
});

async function list(req: Request) {
  const params = new URL(req.url).searchParams;
  const product = params.get("product");
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 50);
  // Drafts are only listed for staff and API keys; the public site sees published updates.
  const drafts = Boolean(await identify(req));
  const rows = await db().sql<UpdateRow>`
    SELECT u.id, u.title, u.body, u.kind, u.published, u.published_at, p.name AS product_name, p.slug AS product_slug
    FROM product_updates u LEFT JOIN products p ON p.id = u.product_id
    WHERE (u.published OR ${drafts}::boolean) AND (${product}::text IS NULL OR p.slug = ${product}::text)
    ORDER BY u.published_at DESC LIMIT ${limit}`;
  return json({ updates: rows.map(shape) });
}

async function one(id: number) {
  const [row] = await db().sql<UpdateRow>`
    SELECT u.id, u.title, u.body, u.kind, u.published, u.published_at, p.name AS product_name, p.slug AS product_slug
    FROM product_updates u LEFT JOIN products p ON p.id = u.product_id WHERE u.id = ${id}`;
  return row;
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET") return list(req);
  const actor = await guard(req, "write");
  if (actor instanceof Response) return actor;
  const sql = db().sql;
  const id = context.params?.id ? Number(context.params.id) : null;

  if (req.method === "POST") {
    if (id) return fail("Use PATCH to change an existing update.", 405);
    const body = await readBody(req);
    const title = text(body?.title, 200);
    if (!title) return fail("Please give the update a title.");
    const kind = KINDS.has(text(body?.kind)) ? text(body?.kind) : "release";
    let productId: number | null = null;
    const slug = text(body?.product, 80);
    if (slug) {
      const [p] = await sql<{ id: number }>`SELECT id FROM products WHERE slug = ${slug} LIMIT 1`;
      if (!p) return fail("That product doesn't exist.", 404);
      productId = p.id;
    }
    const published = body?.published !== false;
    const [row] = await sql<{ id: number }>`
      INSERT INTO product_updates (product_id, title, body, kind, published)
      VALUES (${productId}, ${title}, ${text(body?.body, 5000)}, ${kind}, ${published}) RETURNING id`;
    return json({ update: shape(await one(row.id)) }, 201);
  }

  if (!id || !Number.isInteger(id)) return fail("Say which update: /api/updates/:id.", 405);
  if (req.method === "DELETE") {
    const gone = await sql`DELETE FROM product_updates WHERE id = ${id} RETURNING id`;
    return gone.length ? json({ ok: true }) : fail("Update not found.", 404);
  }

  // PATCH: publish/unpublish, or edit the text. Publishing moves it to the top of the feed.
  const body = await readBody(req);
  if (!body) return fail("Send the changes as JSON.");
  const current = await one(id);
  if (!current) return fail("Update not found.", 404);
  const published = typeof body.published === "boolean" ? body.published : current.published;
  const title = body.title === undefined ? current.title : text(body.title, 200);
  if (!title) return fail("The title can't be empty.");
  const kind = KINDS.has(text(body.kind)) ? text(body.kind) : current.kind;
  const bodyText = body.body === undefined ? current.body : text(body.body, 5000);
  await sql`
    UPDATE product_updates SET published = ${published}, title = ${title}, kind = ${kind}, body = ${bodyText},
      published_at = CASE WHEN ${published}::boolean AND NOT published THEN now() ELSE published_at END
    WHERE id = ${id}`;
  return json({ update: shape(await one(id)) });
};

export const config: Config = {
  path: ["/api/updates", "/api/v1/updates", "/api/updates/:id", "/api/v1/updates/:id"],
  method: ["GET", "POST", "PATCH", "DELETE"],
};
