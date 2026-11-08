import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, readBody, reference, text } from "../lib/http.mts";
import { paystackSecret } from "../lib/payments.mts";
import { config as f50, priceFor, reservedCount, stripeSecret, type ReservationRow } from "../lib/founding50.mts";

/*
 * Starts a Founding 50 payment. Naira goes to Paystack (card, transfer, USSD) when
 * PAYSTACK_SECRET_KEY is set, otherwise the buyer gets ENA's bank details and a
 * reference. USD and GBP go to Stripe Checkout when STRIPE_SECRET_KEY is set.
 */
export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please fill in the form and try again.");
  if (text(body.company)) return json({ mode: "bank", reference: reference("F50"), amount: 0, bank: f50.bank }); // honeypot

  const name = text(body.name, 120);
  const email = text(body.email, 160).toLowerCase();
  const phone = text(body.phone, 40);
  const address = text(body.address, 300);
  const state = text(body.state, 60);
  const notes = text(body.notes, 400);
  const currency = text(body.currency, 3).toUpperCase();
  if (!name || !phone || !address) return fail("Please fill in your name, phone and installation address.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");

  const priced = priceFor(text(body.plan, 40), currency);
  if ("error" in priced) return fail(priced.error);
  if ((await reservedCount()) >= f50.totalSystems) return fail("The Founding 50 is now full. Message us on WhatsApp to join the waitlist.", 409);

  const isNaira = currency === "NGN";
  const provider = isNaira ? (paystackSecret() ? "paystack" : "bank-transfer") : "stripe";
  if (provider === "stripe" && !stripeSecret()) {
    return fail(`Card payments in ${currency} aren't switched on yet. Please message us on WhatsApp or email ${f50.contact.email}.`, 503);
  }

  const ref = reference("F50", 8);
  const sql = db().sql;
  const [row] = await sql<ReservationRow>`
    INSERT INTO founding50_reservations (reference, name, email, phone, address, state, notes, plan, currency, amount_minor, provider)
    VALUES (${ref}, ${name}, ${email}, ${phone}, ${address}, ${state}, ${notes}, ${priced.plan.id}, ${currency}, ${priced.minor}, ${provider})
    RETURNING *`;

  const origin = new URL(req.url).origin;
  const successUrl = `${origin}/founding50/success?reference=${encodeURIComponent(ref)}`;
  const bankReply = { mode: "bank", amount: priced.amount, reference: ref, plan: priced.plan.name, bank: f50.bank };

  if (provider === "bank-transfer") return json(bankReply, 201);

  if (provider === "paystack") {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { authorization: `Bearer ${paystackSecret()}`, "content-type": "application/json" },
      body: JSON.stringify({
        email, amount: priced.minor, currency: "NGN", reference: ref, callback_url: successUrl,
        metadata: {
          purpose: "founding50", plan: priced.plan.id,
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: priced.plan.name },
            { display_name: "Name", variable_name: "name", value: name },
            { display_name: "Phone", variable_name: "phone", value: phone },
            { display_name: "Install address", variable_name: "address", value: `${address}, ${state}` },
          ],
        },
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (res?.ok && data?.status && data.data?.authorization_url) return json({ mode: "redirect", url: data.data.authorization_url, reference: ref }, 201);
    // Don't lose the buyer: fall back to bank transfer on the same reference.
    await sql`UPDATE founding50_reservations SET provider = 'bank-transfer' WHERE id = ${row.id}`;
    return json(bankReply, 201);
  }

  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("customer_email", email);
  p.append("client_reference_id", ref);
  p.append("success_url", successUrl);
  p.append("cancel_url", `${origin}/founding50/cancel`);
  p.append("billing_address_collection", "required");
  p.append("phone_number_collection[enabled]", "true");
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", currency.toLowerCase());
  p.append("line_items[0][price_data][unit_amount]", String(priced.minor));
  p.append("line_items[0][price_data][product_data][name]", `ENA Founding 50 home power system: ${priced.plan.name}`);
  p.append("line_items[0][price_data][product_data][description]",
    "10 kVA inverter, 15 kWh LiFePO4 battery, 4.76 kWp solar, smart metering. Installed in Nigeria by ENA Plus Ltd.");
  const meta: Record<string, string> = { reference: ref, plan: priced.plan.id, buyer_name: name, buyer_phone: phone, install_address: address, install_state: state, programme: "Founding 50" };
  for (const [k, v] of Object.entries(meta)) {
    p.append(`metadata[${k}]`, v);
    p.append(`payment_intent_data[metadata][${k}]`, v);
  }
  p.append("payment_intent_data[description]", `Founding 50 - ${priced.plan.name} - ${name}`);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${stripeSecret()}`, "content-type": "application/x-www-form-urlencoded" },
    body: p,
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  if (!res?.ok || !data?.url) {
    await sql`UPDATE founding50_reservations SET status = 'failed' WHERE id = ${row.id}`;
    return fail(data?.error?.message || "We couldn't reach the payment provider. Please try again.", 502);
  }
  await sql`UPDATE founding50_reservations SET provider_ref = ${data.id} WHERE id = ${row.id}`;
  return json({ mode: "redirect", url: data.url, reference: ref }, 201);
};

export const config: Config = { path: "/api/founding50/checkout", method: "POST" };
