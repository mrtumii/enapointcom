import config from "./founding50.json" with { type: "json" };
import { db } from "./http.mts";

/*
 * Founding 50: pricing, availability and settlement for home power system
 * reservations. Every amount is worked out here from founding50.json, never
 * taken from the browser.
 */

export { config };
export type Currency = "NGN" | "USD" | "GBP";
type Plan = { id: string; name: string; percent: number; note: string };

export type ReservationRow = {
  id: number; reference: string; name: string; email: string; phone: string; address: string; state: string;
  notes: string; plan: string; currency: Currency; amount_minor: string | number; provider: string;
  provider_ref: string | null; status: string; created_at: string; paid_at: string | null;
};

export const stripeSecret = () => (process.env.STRIPE_SECRET_KEY || "").trim();

/** Amount due today in whole units and minor units (kobo, cents, pence), or an error message. */
export function priceFor(planId: string, currency: string): { plan: Plan; amount: number; minor: number } | { error: string } {
  if (currency === "NGN") {
    const plan = config.nairaPlans.find((p) => p.id === planId);
    if (!plan) return { error: "Please choose a plan." };
    const amount = Math.round((config.nairaPrice * plan.percent) / 100);
    return { plan, amount, minor: amount * 100 };
  }
  if (currency === "USD" || currency === "GBP") {
    const plan = config.diasporaPlans.find((p) => p.id === planId);
    if (!plan) return { error: "Please choose a plan." };
    const full = (config.diasporaPrice as Record<string, number | null>)[currency];
    if (!full) return { error: `The ${currency} price hasn't been published yet. Please message us on WhatsApp or email ${config.contact.email}.` };
    const minor = Math.round(full * plan.percent);
    return { plan, amount: minor / 100, minor };
  }
  return { error: "Currency must be NGN, USD or GBP." };
}

/** Systems sold: paid online reservations plus any confirmed offline. */
export async function reservedCount(): Promise<number> {
  const [row] = await db().sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM founding50_reservations WHERE status = 'paid'`;
  return Math.min(config.totalSystems, (row?.n ?? 0) + (Number(config.reservedOffline) || 0));
}

/** Marks a pending reservation paid. Only the first caller wins, so webhook and verify can race safely. */
export async function settleReservation(id: number, providerRef?: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE founding50_reservations SET status = 'paid', paid_at = now(), provider_ref = COALESCE(${providerRef ?? null}, provider_ref)
    WHERE id = ${id} AND status = 'pending' RETURNING id`;
  return rows.length > 0;
}
