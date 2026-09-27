import { getDatabase } from "@netlify/database";

export const db = () => getDatabase();

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** Reads a JSON body, returning null when it is missing or malformed. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** Trims a string field and caps its length; anything else becomes "". */
export function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
}

/**
 * The front end sends a honeypot value (_hp) and how long the page was open (_t).
 * People leave the honeypot empty and take longer than a couple of seconds.
 */
export function looksAutomated(body: Record<string, unknown>): boolean {
  if (text(body._hp)) return true;
  const elapsed = Number(body._t);
  return Number.isFinite(elapsed) && elapsed < 1500;
}

export function reference(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return prefix + "-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
