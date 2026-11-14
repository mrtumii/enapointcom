import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { db } from "./http.mts";

/*
 * Shared plumbing for the AI advisor, ENA alerts (web push) and the marketing console.
 *
 * Web push needs a VAPID key pair. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are used when
 * they are set; otherwise a pair is generated once and kept in Netlify Blobs, so alerts
 * work from the first deploy. The same blob holds the secret that signs unsubscribe links.
 */

type PushConfig = { publicKey: string; privateKey: string; linkSecret: string };

const env = (name: string) => (process.env[name] || "").trim();
let cached: PushConfig | null = null;

export async function pushConfig(): Promise<PushConfig> {
  if (cached) return cached;
  const store = getStore({ name: "marketing", consistency: "strong" });
  let saved = (await store.get("config", { type: "json" })) as PushConfig | null;
  if (!saved) {
    const keys = webpush.generateVAPIDKeys();
    const fresh: PushConfig = { publicKey: keys.publicKey, privateKey: keys.privateKey, linkSecret: randomBytes(32).toString("hex") };
    // Two cold starts can race here; only the first write wins and both read it back.
    await store.setJSON("config", fresh, { onlyIfNew: true });
    saved = (await store.get("config", { type: "json" })) as PushConfig | null;
    if (!saved) saved = fresh;
  }
  const fromEnv = env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY");
  cached = {
    publicKey: fromEnv ? env("VAPID_PUBLIC_KEY") : saved.publicKey,
    privateKey: fromEnv ? env("VAPID_PRIVATE_KEY") : saved.privateKey,
    linkSecret: saved.linkSecret,
  };
  return cached;
}

/* ------------------------------------------------------------------ push */

export type PushRow = { id: number; endpoint: string; p256dh: string; auth: string };

export async function sendPush(rows: PushRow[], payload: { title: string; body: string; url: string }) {
  const cfg = await pushConfig();
  const vapid = { subject: env("VAPID_SUBJECT") || "mailto:info@enapoint.com", publicKey: cfg.publicKey, privateKey: cfg.privateKey };
  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const gone: number[] = [];
  const delivered: number[] = [];
  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50);
    const results = await Promise.allSettled(
      slice.map((r) => webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, message, { vapidDetails: vapid, TTL: 60 * 60 * 24 })),
    );
    results.forEach((res, j) => {
      if (res.status === "fulfilled") { sent++; delivered.push(slice[j].id); return; }
      failed++;
      const code = (res.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) gone.push(slice[j].id); // the browser dropped the subscription
    });
  }
  const sql = db().sql;
  const ids = (list: number[]) => `{${list.join(",")}}`;
  if (gone.length) await sql`DELETE FROM push_subscriptions WHERE id = ANY(${ids(gone)}::int[])`;
  if (delivered.length) await sql`UPDATE push_subscriptions SET last_sent_at = now() WHERE id = ANY(${ids(delivered)}::int[])`;
  return { sent, failed, removed: gone.length };
}

/* ----------------------------------------------------------------- email */

export function emailProvider(): "resend" | "postmark" | null {
  if (env("RESEND_API_KEY")) return "resend";
  if (env("POSTMARK_TOKEN")) return "postmark";
  return null;
}

const FROM = () => env("EMAIL_FROM") || "Enapoint <info@enapoint.com>";

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; unsubscribe?: string }) {
  const provider = emailProvider();
  if (!provider) throw new Error("No email provider is connected.");
  const headers: Record<string, string> = msg.unsubscribe
    ? { "List-Unsubscribe": `<${msg.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : {};
  if (provider === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers }),
    });
    if (!r.ok) throw new Error(`Resend responded ${r.status}`);
    return;
  }
  const p = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "x-postmark-server-token": env("POSTMARK_TOKEN"), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      From: FROM(), To: msg.to, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text,
      MessageStream: env("POSTMARK_STREAM") || "broadcast",
      Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })),
    }),
  });
  if (!p.ok) throw new Error(`Postmark responded ${p.status}`);
}

/* ----------------------------------------------------------- unsubscribe */

export async function unsubscribeToken(email: string) {
  const { linkSecret } = await pushConfig();
  return createHmac("sha256", linkSecret).update("unsub:" + email.toLowerCase()).digest("base64url").slice(0, 32);
}

export async function validUnsubscribe(email: string, token: string) {
  const expected = Buffer.from(await unsubscribeToken(email));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function unsubscribeUrl(origin: string, email: string) {
  return `${origin}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${await unsubscribeToken(email)}`;
}

/* -------------------------------------------------------------- segments */

export const SEGMENTS = [
  { id: "all", title: "All customers", detail: "Everyone ENA has an email for, minus unsubscribes" },
  { id: "meter", title: "Meter owners", detail: "People who registered a prepaid meter" },
  { id: "buyers", title: "Top-up buyers", detail: "Anyone who has paid for units online" },
  { id: "founding50", title: "Founding 50", detail: "Founding 50 reservations" },
  { id: "leads", title: "Advisor leads", detail: "AI advisor sign-ups who agreed to offers" },
  { id: "enquiries", title: "Enquiries", detail: "People who used the contact form" },
] as const;

export type SegmentId = (typeof SEGMENTS)[number]["id"];
export const isSegment = (v: string): v is SegmentId => SEGMENTS.some((s) => s.id === v);

/** Distinct, lower-cased, still-subscribed email addresses for a segment. */
export async function segmentEmails(segment: SegmentId): Promise<string[]> {
  const sql = db().sql;
  const parts: Record<Exclude<SegmentId, "all">, () => Promise<{ email: string }[]>> = {
    meter: () => sql<{ email: string }>`SELECT email FROM meters WHERE email <> ''`,
    buyers: () => sql<{ email: string }>`SELECT email FROM orders WHERE email <> '' AND status = 'paid'`,
    founding50: () => sql<{ email: string }>`SELECT email FROM founding50_reservations`,
    leads: () => sql<{ email: string }>`SELECT email FROM advisor_leads WHERE marketing_ok`,
    enquiries: () => sql<{ email: string }>`SELECT email FROM contact_messages`,
  };
  const groups = segment === "all"
    ? await Promise.all([parts.meter(), parts.buyers(), parts.founding50(), parts.leads(), parts.enquiries()])
    : [await parts[segment]()];
  const off = new Set((await sql<{ email: string }>`SELECT email FROM email_unsubscribes`).map((r) => r.email));
  const out = new Set<string>();
  for (const rows of groups) {
    for (const r of rows) {
      const e = (r.email || "").trim().toLowerCase();
      if (e && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e) && !off.has(e)) out.add(e);
    }
  }
  return [...out];
}

export async function pushCount(): Promise<number> {
  const [row] = await db().sql<{ n: number }>`SELECT count(*)::int AS n FROM push_subscriptions`;
  return row?.n || 0;
}

/* --------------------------------------------------------- email layout */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function campaignEmail(opts: { subject: string; body: string; url: string; unsubscribe: string }) {
  const paragraphs = opts.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Inter,Arial,sans-serif;color:#13233c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f2">
<tr><td style="background:#0b1f3a;color:#fff;padding:16px 22px;font-weight:700;letter-spacing:.08em">ENA<span style="color:#c9a24b">POINT</span></td></tr>
<tr><td style="padding:24px 22px 8px"><h1 style="font-size:22px;margin:0 0 16px">${esc(opts.subject)}</h1>${paragraphs}
<p style="margin:20px 0 8px"><a href="${esc(opts.url)}" style="background:#ed5b1e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:99px;font-weight:700;display:inline-block">See the details</a></p></td></tr>
<tr><td style="padding:18px 22px;border-top:1px solid #e2e8f2;font-size:12px;color:#4a5a73">Ena Plus Ltd, trading as Enapoint &middot; Abuja, Nigeria &middot; info@enapoint.com<br>
You're receiving this because you're an Enapoint customer or asked us for a quote. <a href="${esc(opts.unsubscribe)}" style="color:#b8420f">Unsubscribe</a>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.subject}\n\n${opts.body}\n\n${opts.url}\n\n—\nEna Plus Ltd, trading as Enapoint · info@enapoint.com\nUnsubscribe: ${opts.unsubscribe}`;
  return { html, text };
}
