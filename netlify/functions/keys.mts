import type { Config, Context } from "@netlify/functions";
import { guardAdmin } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { issueKey, shapeKey, type KeyRow } from "../lib/keys.mts";

// Keys are managed from the console only; a key can never mint or revoke keys.
export default async (req: Request, context: Context) => {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const sql = db().sql;

  if (req.method === "GET") {
    const rows = await sql<KeyRow>`
      SELECT id, label, mode, key_prefix, scopes, last_used_at, revoked_at, created_at FROM api_keys
      ORDER BY revoked_at IS NOT NULL, created_at DESC`;
    return json({ keys: rows.map(shapeKey) });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const label = text(body?.label, 80);
    if (!label) return fail("Give the key a label so you know what it's for.");
    const mode = body?.mode === "live" ? "live" : "test";
    const scopes = Array.isArray(body?.scopes) && body.scopes.includes("write") ? ["read", "write"] : ["read"];
    const { key, record } = await issueKey(label, mode, scopes);
    return json({ key, record }, 201);
  }

  const id = Number(context.params?.id);
  if (!Number.isInteger(id)) return fail("Say which key: DELETE /api/keys/:id.", 405);
  const rows = await sql`UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = ${id} RETURNING id`;
  return rows.length ? json({ ok: true }) : fail("Key not found.", 404);
};

export const config: Config = {
  path: ["/api/keys", "/api/keys/:id"],
  method: ["GET", "POST", "DELETE"],
};
