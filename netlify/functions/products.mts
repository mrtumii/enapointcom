import type { Config, Context } from "@netlify/functions";
import { db, fail, json } from "../lib/http.mts";

type ProductRow = {
  slug: string; name: string; category: string; tagline: string; description: string;
  price_kobo: number | null; price_note: string; status: string; specs: unknown;
};

function shape(p: ProductRow) {
  return {
    slug: p.slug, name: p.name, category: p.category, tagline: p.tagline, description: p.description,
    priceKobo: p.price_kobo, priceNote: p.price_note, status: p.status, specs: p.specs ?? [],
  };
}

export default async (req: Request, context: Context) => {
  const sql = db().sql;
  const slug = context.params?.slug;
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
  method: "GET",
};
