import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, readBody, reference, text } from "../lib/http.mts";
import { MAX_NAIRA, MIN_NAIRA, logEvent, normaliseMeter, paystackSecret, price, provider, type OrderRow } from "../lib/payments.mts";

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please fill in the form and try again.");

  const email = text(body.email, 200);
  const phone = text(body.phone, 40);
  const meterNumber = normaliseMeter(body.meterNumber);
  const amountNaira = Number(body.amountNaira);
  if (!/^\d{6,20}$/.test(meterNumber)) return fail("The meter number should be 6 to 20 digits.");
  if (!isEmail(email)) return fail("Please enter a valid email address for your receipt.");
  if (!Number.isFinite(amountNaira) || amountNaira < MIN_NAIRA || amountNaira > MAX_NAIRA) {
    return fail(`Enter an amount between ₦${MIN_NAIRA.toLocaleString("en-NG")} and ₦${MAX_NAIRA.toLocaleString("en-NG")}.`);
  }

  const sql = db().sql;
  const [meter] = await sql<{ status: string; tariff_kobo_per_kwh: number }>`
    SELECT status, tariff_kobo_per_kwh FROM meters WHERE meter_number = ${meterNumber} LIMIT 1`;
  if (!meter) return fail("We couldn't find that meter. Please register it first at enapoint.com/register.", 404);
  if (meter.status === "rejected") {
    return fail("This meter couldn't be verified, so we can't sell units to it. Please email signup@enapoint.com.", 409);
  }

  const quote = price(Math.round(amountNaira * 100), meter.tariff_kobo_per_kwh);
  const ref = reference("ENA", 10);
  const via = provider();
  const [order] = await sql<OrderRow>`
    INSERT INTO orders (reference, email, phone, meter_number, purpose, amount_kobo, service_charge_kobo, units_kwh_milli, provider, metadata)
    VALUES (${ref}, ${email}, ${phone}, ${meterNumber}, 'meter-topup', ${quote.amountKobo}, ${quote.serviceChargeKobo},
            ${quote.unitsKwhMilli}, ${via}, ${JSON.stringify({ tariffKoboPerKwh: quote.tariffKoboPerKwh })}::jsonb)
    RETURNING *`;

  let authorizationUrl = `/pay/confirm.html?reference=${encodeURIComponent(ref)}`;
  if (via === "paystack") {
    const origin = new URL(req.url).origin;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { authorization: `Bearer ${paystackSecret()}`, "content-type": "application/json" },
      body: JSON.stringify({
        email, amount: quote.amountKobo, currency: "NGN", reference: ref,
        callback_url: `${origin}/pay/return.html?reference=${encodeURIComponent(ref)}`,
        metadata: { meterNumber, phone, purpose: "meter-topup" },
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !data?.status || !data.data?.authorization_url) {
      await sql`UPDATE orders SET status = 'failed' WHERE id = ${order.id}`;
      await logEvent(order, "paystack", "initialize-failed", { httpStatus: res?.status ?? 0, message: data?.message ?? "" });
      return fail("We couldn't reach the payment provider just now. Please try again in a moment.", 502);
    }
    authorizationUrl = data.data.authorization_url;
  }

  await sql`UPDATE orders SET authorization_url = ${authorizationUrl} WHERE id = ${order.id}`;
  await logEvent(order, via, "initialized", { amountKobo: quote.amountKobo });
  return json({ reference: ref, authorizationUrl, provider: via, ...quote }, 201);
};

export const config: Config = { path: ["/api/payments/initialize", "/api/v1/payments/initialize"], method: "POST" };
