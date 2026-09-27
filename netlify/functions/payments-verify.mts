import type { Config, Context } from "@netlify/functions";
import { db, fail, json } from "../lib/http.mts";
import { paystackSecret, settle, shapeOrder, shapeToken, type OrderRow, type TokenRow } from "../lib/payments.mts";

async function load(ref: string) {
  const sql = db().sql;
  const [order] = await sql<OrderRow>`SELECT * FROM orders WHERE reference = ${ref} LIMIT 1`;
  if (!order) return null;
  const [token] = await sql<TokenRow>`SELECT * FROM vend_tokens WHERE order_id = ${order.id} LIMIT 1`;
  return { order, token };
}

export default async (_req: Request, context: Context) => {
  const ref = String(context.params?.reference || "").slice(0, 40);
  let found = await load(ref);
  if (!found) return fail("We couldn't find that payment reference.", 404);

  // Ask Paystack directly rather than trusting the redirect back to us.
  if (found.order.status === "pending" && found.order.provider === "paystack" && paystackSecret()) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { authorization: `Bearer ${paystackSecret()}` },
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    const tx = data?.data;
    if (tx?.status === "success" && Number(tx.amount) === found.order.amount_kobo && tx.currency === "NGN") {
      await settle(found.order, "paystack", { via: "verify", id: tx.id, paidAt: tx.paid_at, channel: tx.channel }, String(tx.id));
      found = (await load(ref))!;
    } else if (tx && ["failed", "abandoned", "reversed"].includes(tx.status)) {
      await db().sql`UPDATE orders SET status = 'failed' WHERE id = ${found.order.id} AND status = 'pending'`;
      found = (await load(ref))!;
    }
  }

  return json({
    status: found.order.status,
    order: shapeOrder(found.order),
    token: found.token ? shapeToken(found.token) : null,
  });
};

export const config: Config = {
  path: ["/api/payments/verify/:reference", "/api/v1/payments/verify/:reference"],
  method: "GET",
};
