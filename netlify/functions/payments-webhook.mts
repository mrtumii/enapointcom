import type { Config } from "@netlify/functions";
import { createHmac } from "node:crypto";
import { sameSecret } from "../lib/auth.mts";
import { db, fail, json } from "../lib/http.mts";
import { logEvent, paystackSecret, settle, type OrderRow } from "../lib/payments.mts";

// Paystack signs the raw body with HMAC-SHA512 using the secret key. Nothing in the
// body is trusted until that signature checks out.
export default async (req: Request) => {
  const secret = paystackSecret();
  if (!secret) return fail("Online payments aren't switched on for this site.", 503);

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  if (!signature || !sameSecret(signature, expected)) return fail("Invalid signature.", 401);

  let event: { event?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail("Malformed payload.");
  }
  const data = event.data || {};
  const ref = String(data.reference || "").slice(0, 40);
  const [order] = ref ? await db().sql<OrderRow>`SELECT * FROM orders WHERE reference = ${ref} LIMIT 1` : [];
  await logEvent(order ?? null, "paystack", `webhook:${event.event || "unknown"}`, { id: data.id, status: data.status, amount: data.amount });

  if (event.event === "charge.success" && order) {
    if (Number(data.amount) === order.amount_kobo && data.currency === "NGN") {
      await settle(order, "paystack", { via: "webhook", id: data.id, paidAt: data.paid_at, channel: data.channel }, String(data.id));
    } else {
      await logEvent(order, "paystack", "amount-mismatch", { expected: order.amount_kobo, received: data.amount, currency: data.currency });
    }
  }
  // Always acknowledge a correctly signed event so the provider stops retrying.
  return json({ received: true });
};

export const config: Config = { path: ["/api/payments/webhook", "/api/v1/payments/webhook"], method: "POST" };
