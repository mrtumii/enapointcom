import type { Config } from "@netlify/functions";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { pushConfig } from "../lib/marketing.mts";

/*
 * ENA alerts. GET /api/push/key hands the browser the VAPID public key; POST
 * /api/push/subscribe stores the subscription the bell in the header creates, and
 * DELETE removes it when the visitor turns alerts off.
 */
export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (path.endsWith("/key")) return json({ publicKey: (await pushConfig()).publicKey });

  const body = await readBody(req);
  if (!body) return fail("Missing subscription.");
  const sql = db().sql;

  if (req.method === "DELETE") {
    const endpoint = text(body.endpoint, 1000);
    if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
    return json({ ok: true });
  }

  const sub = (body.subscription || {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = text(sub.endpoint, 1000);
  const p256dh = text(sub.keys?.p256dh, 200);
  const auth = text(sub.keys?.auth, 100);
  let host = "";
  try { host = new URL(endpoint).protocol === "https:" ? new URL(endpoint).host : ""; } catch { host = ""; }
  if (!host || !p256dh || !auth) return fail("That browser subscription isn't valid.");

  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, page)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${text(body.page, 200)})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;
  return json({ ok: true }, 201);
};

export const config: Config = { path: ["/api/push/key", "/api/push/subscribe"], method: ["GET", "POST", "DELETE"] };
