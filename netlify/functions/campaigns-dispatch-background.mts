import { db } from "../lib/http.mts";
import { campaignEmail, isSegment, sendEmail, sendPush, segmentEmails, unsubscribeUrl, type PushRow } from "../lib/marketing.mts";

/*
 * Sends one queued campaign. Runs as a background function (up to 15 minutes), so
 * large audiences don't time out. It claims the campaign by moving it from "queued"
 * to "sending" first, which makes retries and repeat calls harmless.
 */

type Campaign = { id: number; segment: string; channel: string; subject: string; body: string; url: string };

export default async (req: Request) => {
  let id = 0;
  try { id = Number((await req.json()).id); } catch { return; }
  if (!Number.isInteger(id) || id <= 0) return;

  const sql = db().sql;
  const [c] = await sql<Campaign>`
    UPDATE campaigns SET status = 'sending' WHERE id = ${id} AND status = 'queued'
    RETURNING id, segment, channel, subject, body, url`;
  if (!c) return;

  const origin = process.env.URL || new URL(req.url).origin;
  const link = origin + (c.url || "/");
  let emailSent = 0, emailFailed = 0, pushSent = 0, pushFailed = 0;
  const notes: string[] = [];

  try {
    if ((c.channel === "email" || c.channel === "both") && isSegment(c.segment)) {
      const recipients = await segmentEmails(c.segment);
      for (let i = 0; i < recipients.length; i += 10) {
        const batch = recipients.slice(i, i + 10);
        const results = await Promise.allSettled(batch.map(async (to) => {
          const unsubscribe = await unsubscribeUrl(origin, to);
          const { html, text } = campaignEmail({ subject: c.subject, body: c.body, url: link, unsubscribe });
          await sendEmail({ to, subject: c.subject, html, text, unsubscribe });
        }));
        results.forEach((r) => (r.status === "fulfilled" ? emailSent++ : emailFailed++));
        await sql`UPDATE campaigns SET email_sent = ${emailSent}, email_failed = ${emailFailed} WHERE id = ${c.id}`;
      }
      if (!recipients.length) notes.push("No email recipients in this audience.");
    }
    if (c.channel === "push" || c.channel === "both") {
      const subs = await sql<PushRow>`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`;
      const res = await sendPush(subs, { title: c.subject, body: c.body.slice(0, 180), url: c.url || "/" });
      pushSent = res.sent; pushFailed = res.failed;
      if (res.removed) notes.push(`${res.removed} expired browser subscriptions removed.`);
      if (!subs.length) notes.push("No browsers have turned on alerts yet.");
    }
    await sql`
      UPDATE campaigns SET status = 'sent', email_sent = ${emailSent}, email_failed = ${emailFailed},
        push_sent = ${pushSent}, push_failed = ${pushFailed}, note = ${notes.join(" ")}, finished_at = now()
      WHERE id = ${c.id}`;
  } catch (e) {
    console.error("[campaign]", c.id, e instanceof Error ? e.message : e);
    await sql`
      UPDATE campaigns SET status = 'failed', email_sent = ${emailSent}, email_failed = ${emailFailed},
        push_sent = ${pushSent}, push_failed = ${pushFailed}, note = 'Sending stopped part-way; check the function log.', finished_at = now()
      WHERE id = ${c.id}`;
  }
};
