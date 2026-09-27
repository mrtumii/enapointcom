import type { Config } from "@netlify/functions";
import { guard } from "../lib/auth.mts";
import { db, fail, json, readBody } from "../lib/http.mts";
import { deliver, normaliseMeter, shapeToken, type TokenRow } from "../lib/payments.mts";

export default async (req: Request) => {
  if (req.method === "POST") {
    if (!new URL(req.url).pathname.endsWith("/flush")) return fail("Use POST /api/vend/flush to deliver queued units.", 405);
    // Delivers every queued token for registered meters, or just one meter's.
    const actor = await guard(req, "write");
    if (actor instanceof Response) return actor;
    const meter = normaliseMeter((await readBody(req))?.meterNumber) || null;
    return json({ delivered: await deliver(meter, false) });
  }

  const actor = await guard(req, "read");
  if (actor instanceof Response) return actor;
  const params = new URL(req.url).searchParams;
  const meter = normaliseMeter(params.get("meter") || "") || null;
  const status = ["queued", "delivered"].includes(params.get("status") || "") ? params.get("status") : null;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  const rows = await db().sql<TokenRow & { reference: string | null }>`
    SELECT t.*, o.reference FROM vend_tokens t LEFT JOIN orders o ON o.id = t.order_id
    WHERE (${meter}::text IS NULL OR t.meter_number = ${meter}::text)
      AND (${status}::text IS NULL OR t.status = ${status}::text)
    ORDER BY t.created_at DESC LIMIT ${limit}`;
  return json({ tokens: rows.map((t) => ({ reference: t.reference, ...shapeToken(t) })) });
};

export const config: Config = {
  path: ["/api/vend", "/api/v1/vend", "/api/vend/flush", "/api/v1/vend/flush"],
  method: ["GET", "POST"],
};
