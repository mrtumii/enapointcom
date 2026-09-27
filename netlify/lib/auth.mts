import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db, fail } from "./http.mts";

/*
 * Two ways in:
 *  - staff sign in to /dashboard with ENA_ADMIN_PASSWORD and get a signed, HttpOnly
 *    session cookie that carries every scope;
 *  - partners send "Authorization: Bearer ena_test_…" or "ena_live_…". Only the SHA-256
 *    of a key is stored, and each key carries "read" and optionally "write".
 */

export type Scope = "read" | "write";
export type Actor =
  | { kind: "admin"; label: string }
  | { kind: "key"; id: number; label: string; mode: string; scopes: string[] };

const COOKIE = "ena_session";
const SESSION_SECONDS = 12 * 60 * 60;

const env = (name: string) => (process.env[name] || "").trim();

export const adminConfigured = () => Boolean(env("ENA_ADMIN_PASSWORD"));

// A dedicated secret is preferred; without one, sessions are signed with a value
// derived from the password, so changing the password signs everyone out.
function sessionSecret(): string {
  return env("ENA_SESSION_SECRET") || createHash("sha256").update("ena-session:" + env("ENA_ADMIN_PASSWORD")).digest("hex");
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function sameSecret(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function passwordMatches(candidate: string): boolean {
  return adminConfigured() && sameSecret(candidate, env("ENA_ADMIN_PASSWORD"));
}

function readCookie(req: Request, name: string): string {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

export function sessionCookie(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${expires}.${sign(String(expires))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req: Request): boolean {
  if (!adminConfigured()) return false;
  const [expires, signature] = readCookie(req, COOKIE).split(".");
  if (!expires || !signature || Number(expires) * 1000 < Date.now()) return false;
  return sameSecret(signature, sign(expires));
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

async function keyActor(req: Request): Promise<Actor | null> {
  const match = /^Bearer\s+(ena_(?:test|live)_[A-Za-z0-9_-]{16,})$/.exec(req.headers.get("authorization") || "");
  if (!match) return null;
  const sql = db().sql;
  const [row] = await sql<{ id: number; label: string; mode: string; scopes: string[] }>`
    UPDATE api_keys SET last_used_at = now()
    WHERE key_hash = ${hashKey(match[1])} AND revoked_at IS NULL
    RETURNING id, label, mode, scopes`;
  return row ? { kind: "key", id: row.id, label: row.label, mode: row.mode, scopes: Array.isArray(row.scopes) ? row.scopes : [] } : null;
}

// Cookie-authenticated writes must come from our own pages. SameSite=Strict already
// covers modern browsers; this also refuses a cross-site Origin outright.
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin || req.method === "GET" || req.method === "HEAD") return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Who is calling, if anyone. Keys are only looked up when a Bearer header is present. */
export async function identify(req: Request): Promise<Actor | null> {
  if (req.headers.get("authorization")) return keyActor(req);
  if (isAdmin(req) && sameOrigin(req)) return { kind: "admin", label: "console" };
  return null;
}

export function allows(actor: Actor, scope: Scope): boolean {
  if (actor.kind === "admin") return true;
  return actor.scopes.includes(scope) || (scope === "read" && actor.scopes.includes("write"));
}

/** Returns the caller, or a 401/403 response to send straight back. */
export async function guard(req: Request, scope: Scope): Promise<Actor | Response> {
  const actor = await identify(req);
  if (!actor) {
    return fail(req.headers.get("authorization")
      ? "That API key isn't valid or has been revoked."
      : "Sign in to the staff console, or send an API key.", 401);
  }
  if (!allows(actor, scope)) return fail(`This API key doesn't have the "${scope}" scope.`, 403);
  return actor;
}

/** Console-only routes: API keys and partner applications are never reachable with a key. */
export function guardAdmin(req: Request): Response | null {
  if (isAdmin(req) && sameOrigin(req)) return null;
  return fail("Sign in to the staff console to do this.", 401);
}

export const actorName = (actor: Actor) => (actor.kind === "admin" ? "console" : `key:${actor.label}`.slice(0, 80));
