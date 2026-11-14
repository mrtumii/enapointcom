import type { Config } from "@netlify/functions";
import { guardAdmin } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { SEGMENTS, emailProvider, isSegment, pushCount, segmentEmails } from "../lib/marketing.mts";

/*
 * Marketing console (staff only). GET returns live audience sizes and recent
 * campaigns; POST records a campaign and hands it to the dispatcher background
 * function, which sends the emails and push notifications.
 */

type CampaignRow = { id: number; segment: string; channel: string; subject: string; status: string; email_sent: number; email_failed: number; push_sent: number; push_failed: number; note: string; created_at: string };

const CHANNELS = new Set(["email", "push", "both"]);

export default async (req: Request) => {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const sql = db().sql;

  if (req.method === "GET") {
    const [segments, push, rows] = await Promise.all([
      Promise.all(SEGMENTS.map(async (s) => ({ ...s, count: (await segmentEmails(s.id)).length }))),
      pushCount(),
      sql<CampaignRow>`SELECT id, segment, channel, subject, status, email_sent, email_failed, push_sent, push_failed, note, created_at
                       FROM campaigns ORDER BY created_at DESC LIMIT 25`,
    ]);
    return json({
      segments, pushSubscribers: push, emailProvider: emailProvider(),
      campaigns: rows.map((r) => ({
        id: r.id, segment: r.segment, channel: r.channel, subject: r.subject, status: r.status,
        emailSent: r.email_sent, emailFailed: r.email_failed, pushSent: r.push_sent, pushFailed: r.push_failed,
        note: r.note, createdAt: r.created_at,
      })),
    });
  }

  const body = await readBody(req);
  if (!body) return fail("Fill in the campaign and try again.");
  const segment = text(body.segment, 40);
  const channel = text(body.channel, 10);
  const subject = text(body.subject, 140);
  const message = text(body.body, 4000);
  let url = text(body.url, 300) || "/";
  if (!isSegment(segment)) return fail("Choose an audience.");
  if (!CHANNELS.has(channel)) return fail("Choose email, push or both.");
  if (!subject) return fail("Add a subject or title.");
  if (!message) return fail("Write a message.");
  // Links always point at this site.
  if (!url.startsWith("/") || url.startsWith("//")) return fail("The link must be a page on this site, like /pay-monthly.");
  if ((channel === "email" || channel === "both") && !emailProvider()) {
    return fail("Email isn't connected yet, so this campaign can only go out as a push notification.", 409);
  }
  url = new URL(url, new URL(req.url).origin).pathname;

  const [row] = await sql<{ id: number }>`
    INSERT INTO campaigns (segment, channel, subject, body, url) VALUES (${segment}, ${channel}, ${subject}, ${message}, ${url})
    RETURNING id`;

  // The dispatcher only ever sends campaigns that are still "queued", so it is
  // safe for it to be reachable without a session.
  const origin = new URL(req.url).origin;
  await fetch(`${origin}/.netlify/functions/campaigns-dispatch-background`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }),
  }).catch(() => null);

  return json({ ok: true, id: row.id }, 202);
};

export const config: Config = { path: "/api/campaigns", method: ["GET", "POST"] };
