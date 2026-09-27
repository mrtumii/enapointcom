import type { Config } from "@netlify/functions";
import { db, json } from "../lib/http.mts";

type UpdateRow = { id: number; title: string; body: string; kind: string; published_at: string; product_name: string | null; product_slug: string | null };

export default async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const product = params.get("product");
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 50);
  const sql = db().sql;
  const rows = product
    ? await sql<UpdateRow>`
        SELECT u.id, u.title, u.body, u.kind, u.published_at, p.name AS product_name, p.slug AS product_slug
        FROM product_updates u LEFT JOIN products p ON p.id = u.product_id
        WHERE u.published AND p.slug = ${product}
        ORDER BY u.published_at DESC LIMIT ${limit}`
    : await sql<UpdateRow>`
        SELECT u.id, u.title, u.body, u.kind, u.published_at, p.name AS product_name, p.slug AS product_slug
        FROM product_updates u LEFT JOIN products p ON p.id = u.product_id
        WHERE u.published
        ORDER BY u.published_at DESC LIMIT ${limit}`;
  return json({
    updates: rows.map((u) => ({
      id: u.id, title: u.title, body: u.body, kind: u.kind, publishedAt: u.published_at,
      productName: u.product_name, productSlug: u.product_slug,
    })),
  });
};

export const config: Config = { path: ["/api/updates", "/api/v1/updates"], method: "GET" };
