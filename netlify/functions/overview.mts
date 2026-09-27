import type { Config } from "@netlify/functions";
import { guard } from "../lib/auth.mts";
import { db, json } from "../lib/http.mts";
import { provider } from "../lib/payments.mts";

export default async (req: Request) => {
  const actor = await guard(req, "read");
  if (actor instanceof Response) return actor;
  const sql = db().sql;

  const [[stats], hourly, recentOrders, recentVends, lowStock] = await Promise.all([
    sql<Record<string, number>>`
      SELECT
        (SELECT COALESCE(SUM(amount_kobo), 0)::bigint FROM orders WHERE status = 'paid') AS gross_kobo,
        (SELECT COALESCE(SUM(units_kwh_milli), 0)::bigint FROM vend_tokens) AS units,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'pending') AS orders_pending,
        (SELECT COUNT(*)::int FROM devices WHERE status = 'online') AS devices_online,
        (SELECT COUNT(*)::int FROM devices) AS devices_total,
        (SELECT COUNT(*)::int FROM stock_items) AS stock_skus,
        (SELECT COALESCE(SUM(quantity), 0)::bigint FROM stock_items) AS stock_units,
        (SELECT COUNT(*)::int FROM stock_items WHERE quantity <= reorder_level) AS stock_below,
        (SELECT COUNT(*)::int FROM meters WHERE status IN ('linked', 'verified')) AS meters_linked`,
    sql<{ hour: number; n: number }>`
      SELECT FLOOR(EXTRACT(EPOCH FROM (now() - created_at)) / 3600)::int AS hour, COUNT(*)::int AS n
      FROM vend_tokens WHERE created_at > now() - interval '24 hours' GROUP BY 1`,
    sql<{ reference: string; meter_number: string; amount_kobo: number; units_kwh_milli: number; status: string; created_at: string }>`
      SELECT reference, meter_number, amount_kobo, units_kwh_milli, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8`,
    sql<{ meter_number: string; units_kwh_milli: number; status: string; created_at: string }>`
      SELECT meter_number, units_kwh_milli, status, created_at FROM vend_tokens ORDER BY created_at DESC LIMIT 8`,
    sql<{ sku: string; quantity: number; reorder_level: number }>`
      SELECT sku, quantity, reorder_level FROM stock_items WHERE quantity <= reorder_level ORDER BY quantity - reorder_level LIMIT 10`,
  ]);

  // Oldest hour first, so the sparkline reads left to right.
  const traffic = Array.from({ length: 24 }, () => 0);
  for (const h of hourly) if (h.hour >= 0 && h.hour < 24) traffic[23 - h.hour] = h.n;

  return json({
    stats: {
      grossKobo: Number(stats.gross_kobo), unitsKwhMilli: Number(stats.units), ordersPending: stats.orders_pending,
      devicesOnline: stats.devices_online, devicesTotal: stats.devices_total, stockSkus: stats.stock_skus,
      stockUnits: Number(stats.stock_units), stockBelowReorder: stats.stock_below, metersLinked: stats.meters_linked,
    },
    provider: provider(),
    traffic,
    recentOrders: recentOrders.map((o) => ({
      reference: o.reference, meterNumber: o.meter_number, amountKobo: o.amount_kobo, unitsKwhMilli: o.units_kwh_milli,
      status: o.status, createdAt: o.created_at,
    })),
    recentVends: recentVends.map((v) => ({ meterNumber: v.meter_number, unitsKwhMilli: v.units_kwh_milli, status: v.status, createdAt: v.created_at })),
    lowStock: lowStock.map((s) => ({ sku: s.sku, quantity: s.quantity, reorderLevel: s.reorder_level })),
  });
};

export const config: Config = { path: ["/api/overview", "/api/v1/overview"], method: "GET" };
