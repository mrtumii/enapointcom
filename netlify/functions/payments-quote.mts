import type { Config } from "@netlify/functions";
import { db, fail, json, readBody } from "../lib/http.mts";
import { DEFAULT_TARIFF_KOBO, MAX_NAIRA, MIN_NAIRA, normaliseMeter, price } from "../lib/payments.mts";

export default async (req: Request) => {
  const body = await readBody(req);
  const amountNaira = Number(body?.amountNaira);
  if (!Number.isFinite(amountNaira) || amountNaira < MIN_NAIRA || amountNaira > MAX_NAIRA) {
    return fail(`Enter an amount between ₦${MIN_NAIRA.toLocaleString("en-NG")} and ₦${MAX_NAIRA.toLocaleString("en-NG")}.`);
  }
  // A registered meter is priced at its own tariff; anything else at the standard rate.
  const meterNumber = normaliseMeter(body?.meterNumber);
  let tariff = DEFAULT_TARIFF_KOBO;
  if (/^\d{6,20}$/.test(meterNumber)) {
    const [meter] = await db().sql<{ tariff_kobo_per_kwh: number }>`
      SELECT tariff_kobo_per_kwh FROM meters WHERE meter_number = ${meterNumber} LIMIT 1`;
    if (meter) tariff = meter.tariff_kobo_per_kwh;
  }
  return json(price(Math.round(amountNaira * 100), tariff));
};

export const config: Config = { path: ["/api/payments/quote", "/api/v1/payments/quote"], method: "POST" };
