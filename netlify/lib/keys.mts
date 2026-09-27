import { hashKey } from "./auth.mts";
import { db } from "./http.mts";

export type KeyRow = { id: number; label: string; mode: string; key_prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string };

export function shapeKey(k: KeyRow) {
  return {
    id: k.id, label: k.label, mode: k.mode, keyPrefix: k.key_prefix, scopes: Array.isArray(k.scopes) ? k.scopes : [],
    lastUsedAt: k.last_used_at, revoked: Boolean(k.revoked_at), createdAt: k.created_at,
  };
}

/** Creates a key and returns the full secret once; only its hash is kept. */
export async function issueKey(label: string, mode: "test" | "live", scopes: string[]) {
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const key = `ena_${mode}_${secret}`;
  const prefix = key.slice(0, mode.length + 9);
  const [row] = await db().sql<KeyRow>`
    INSERT INTO api_keys (label, mode, key_prefix, key_hash, scopes)
    VALUES (${label}, ${mode}, ${prefix}, ${hashKey(key)}, ${JSON.stringify(scopes)}::jsonb)
    RETURNING id, label, mode, key_prefix, scopes, last_used_at, revoked_at, created_at`;
  return { key, record: shapeKey(row) };
}
