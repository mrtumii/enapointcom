import type { Config } from "@netlify/functions";
import { db } from "../lib/http.mts";
import { validUnsubscribe } from "../lib/marketing.mts";

/* One-click unsubscribe from marketing emails. The link is signed, so nobody can unsubscribe someone else. */

const page = (title: string, message: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Enapoint</title><link rel="stylesheet" href="/assets/css/ena.css?v=20261114"><link rel="stylesheet" href="/assets/css/ena-v2.css?v=20261114"></head><body><main class="section"><div class="wrap"><p class="eyebrow">Email preferences</p><h1>${title}</h1><p class="lede">${message}</p><p><a class="cta" href="/">Back to Enapoint</a></p></div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export default async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const email = (params.get("e") || "").trim().toLowerCase().slice(0, 200);
  const token = (params.get("t") || "").slice(0, 64);
  if (!email || !token || !(await validUnsubscribe(email, token))) {
    return page("That link didn't work", "The unsubscribe link is incomplete. Reply to any Enapoint email, or write to info@enapoint.com, and we'll remove you.", 400);
  }
  await db().sql`INSERT INTO email_unsubscribes (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
  if (req.method === "POST") return new Response(null, { status: 204 });
  return page("You're unsubscribed", "You won't get Enapoint marketing emails any more. Receipts and service messages about your meter or order still arrive as normal.");
};

export const config: Config = { path: "/api/unsubscribe", method: ["GET", "POST"] };
