import type { Config, Context } from "@netlify/functions";
import { db, fail, json } from "../lib/http.mts";
import { paystackSecret } from "../lib/payments.mts";
import { settleReservation, stripeSecret, type ReservationRow } from "../lib/founding50.mts";

const load = async (ref: string) =>
  (await db().sql<ReservationRow>`SELECT * FROM founding50_reservations WHERE reference = ${ref} LIMIT 1`)[0];

// Confirms a payment with the provider directly instead of trusting the redirect back.
export default async (_req: Request, context: Context) => {
  const ref = String(context.params?.reference || "").slice(0, 40);
  let r = await load(ref);
  if (!r) return fail("We couldn't find that reservation reference.", 404);
  const expected = Number(r.amount_minor);

  if (r.status === "pending" && r.provider === "paystack" && paystackSecret()) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { authorization: `Bearer ${paystackSecret()}` },
    }).catch(() => null);
    const tx = res?.ok ? (await res.json().catch(() => null))?.data : null;
    if (tx?.status === "success" && Number(tx.amount) === expected && tx.currency === "NGN") await settleReservation(r.id, String(tx.id));
    else if (tx && ["failed", "abandoned", "reversed"].includes(tx.status)) await db().sql`UPDATE founding50_reservations SET status = 'failed' WHERE id = ${r.id} AND status = 'pending'`;
    r = await load(ref);
  } else if (r.status === "pending" && r.provider === "stripe" && r.provider_ref && stripeSecret()) {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(r.provider_ref)}`, {
      headers: { authorization: `Bearer ${stripeSecret()}` },
    }).catch(() => null);
    const s = res?.ok ? await res.json().catch(() => null) : null;
    if (s?.payment_status === "paid" && Number(s.amount_total) === expected && String(s.currency).toUpperCase() === r.currency) {
      await settleReservation(r.id, String(s.payment_intent || s.id));
    }
    r = await load(ref);
  }

  return json({ reference: r.reference, status: r.status, provider: r.provider, currency: r.currency, amountMinor: Number(r.amount_minor), plan: r.plan });
};

export const config: Config = { path: "/api/founding50/verify/:reference", method: "GET" };
