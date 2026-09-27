import { db } from "./http.mts";

/*
 * Pricing, settlement and token issue for meter top-ups.
 * The amount a customer pays includes a 1% service charge; the rest buys units at
 * the meter's tariff. Settlement is a single conditional UPDATE, so a webhook, a
 * verify call and an operator can all race on the same order and only one wins.
 */

export const SERVICE_CHARGE_RATE = 0.01;
export const DEFAULT_TARIFF_KOBO = 28500;
export const MIN_NAIRA = 100;
export const MAX_NAIRA = 500000;

export const paystackSecret = () => (process.env.PAYSTACK_SECRET_KEY || "").trim();
export const provider = () => (paystackSecret() ? "paystack" : "simulation");

export function normaliseMeter(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\s-]/g, "").slice(0, 40) : "";
}

export function price(amountKobo: number, tariffKoboPerKwh: number) {
  const serviceChargeKobo = Math.round(amountKobo * SERVICE_CHARGE_RATE);
  const unitsKwhMilli = Math.floor(((amountKobo - serviceChargeKobo) * 1000) / tariffKoboPerKwh);
  return { amountKobo, serviceChargeKobo, tariffKoboPerKwh, unitsKwhMilli };
}

export type OrderRow = {
  id: number; reference: string; email: string; phone: string; meter_number: string; purpose: string;
  amount_kobo: number; service_charge_kobo: number; units_kwh_milli: number; provider: string;
  provider_ref: string | null; authorization_url: string | null; status: string; created_at: string; paid_at: string | null;
};
export type TokenRow = { id: number; order_id: number | null; meter_number: string; token: string; units_kwh_milli: number; status: string; created_at: string; delivered_at: string | null };

export function shapeOrder(o: OrderRow) {
  return {
    reference: o.reference, meterNumber: o.meter_number, amountKobo: o.amount_kobo, serviceChargeKobo: o.service_charge_kobo,
    unitsKwhMilli: o.units_kwh_milli, provider: o.provider, status: o.status, createdAt: o.created_at, paidAt: o.paid_at,
  };
}

export function shapeToken(t: TokenRow) {
  return {
    meterNumber: t.meter_number, token: t.token, unitsKwhMilli: t.units_kwh_milli, status: t.status,
    createdAt: t.created_at, deliveredAt: t.delivered_at,
  };
}

/** A 20-digit token in groups of four, the format meter keypads accept. */
function newToken(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint32Array(20)), (n) => String(n % 10)).join("");
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

export async function logEvent(order: { id: number; reference: string } | null, source: string, event: string, payload: unknown) {
  await db().sql`
    INSERT INTO payment_events (order_id, reference, provider, event, payload)
    VALUES (${order?.id ?? null}, ${order?.reference ?? ""}, ${source}, ${event}, ${JSON.stringify(payload ?? {})}::jsonb)`;
}

/**
 * Marks a pending order paid and issues its vending token. Safe to call repeatedly:
 * only the first caller changes anything. Returns true when this call settled it.
 */
export async function settle(order: OrderRow, source: string, payload: unknown, providerRef?: string): Promise<boolean> {
  const sql = db().sql;
  const [won] = await sql<OrderRow>`
    UPDATE orders SET status = 'paid', paid_at = now(), provider_ref = COALESCE(${providerRef ?? null}, provider_ref)
    WHERE id = ${order.id} AND status = 'pending'
    RETURNING *`;
  if (!won) return false;
  await logEvent(won, source, "settled", payload);
  if (won.meter_number && won.units_kwh_milli > 0) {
    await sql`
      INSERT INTO vend_tokens (order_id, meter_number, token, units_kwh_milli)
      VALUES (${won.id}, ${won.meter_number}, ${newToken()}, ${won.units_kwh_milli})
      ON CONFLICT (order_id) DO NOTHING`;
    // Meters on a live link take units straight away; the rest queue until flushed.
    await deliver(won.meter_number, true);
  }
  return true;
}

/**
 * Delivers queued tokens and credits the meter balance, returning how many were sent. With onlineOnly, only
 * meters with a live link ("linked") are served; otherwise every registered,
 * non-rejected meter is.
 */
export async function deliver(meterNumber: string | null, onlineOnly: boolean): Promise<number> {
  const sql = db().sql;
  const statuses = onlineOnly ? ["linked"] : ["linked", "verified", "pending-verification"];
  const rows = await sql<{ meter_number: string; units: number; tokens: number }>`
    WITH sent AS (
      UPDATE vend_tokens t SET status = 'delivered', delivered_at = now()
      FROM meters m
      WHERE t.status = 'queued' AND m.meter_number = t.meter_number
        AND m.status IN (SELECT jsonb_array_elements_text(${JSON.stringify(statuses)}::jsonb))
        AND (${meterNumber}::text IS NULL OR t.meter_number = ${meterNumber}::text)
      RETURNING t.meter_number, t.units_kwh_milli
    )
    SELECT meter_number, SUM(units_kwh_milli)::int AS units, COUNT(*)::int AS tokens FROM sent GROUP BY meter_number`;
  for (const r of rows) {
    await sql`UPDATE meters SET balance_kwh_milli = balance_kwh_milli + ${r.units} WHERE meter_number = ${r.meter_number}`;
  }
  return rows.reduce((total, r) => total + r.tokens, 0);
}
