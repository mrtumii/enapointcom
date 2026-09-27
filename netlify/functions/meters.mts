import type { Config, Context } from "@netlify/functions";
import { allows, guard, identify } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { normaliseMeter, shapeToken, type TokenRow } from "../lib/payments.mts";

type MeterRow = {
  meter_number: string; imei: string | null; rfid: string | null; holder_name: string; email: string; phone: string;
  disco: string; tariff_band: string; tariff_kobo_per_kwh: number; meter_type: string; address: string; state: string;
  source: string; status: string; balance_kwh_milli: number; registered_at: string; verified_at: string | null;
};

const STATUSES = new Set(["pending-verification", "verified", "linked", "rejected", "suspended"]);

const shape = (m: MeterRow) => ({
  meterNumber: m.meter_number, imei: m.imei, rfid: m.rfid, holderName: m.holder_name, email: m.email, phone: m.phone,
  disco: m.disco, tariffBand: m.tariff_band, tariffKoboPerKwh: m.tariff_kobo_per_kwh, meterType: m.meter_type,
  address: m.address, state: m.state, source: m.source, status: m.status, balanceKwhMilli: m.balance_kwh_milli,
  registeredAt: m.registered_at, verifiedAt: m.verified_at,
});

export default async (req: Request, context: Context) => {
  const sql = db().sql;
  const number = context.params?.number ? normaliseMeter(context.params.number) : null;

  // One meter: anyone can see its status and tariff; a key or staff session also
  // sees the holder's details and the latest tokens.
  if (req.method === "GET" && number) {
    const caller = req.headers.get("authorization") ? await guard(req, "read") : await identify(req);
    if (caller instanceof Response) return caller;
    const [row] = await sql<MeterRow>`SELECT * FROM meters WHERE meter_number = ${number} LIMIT 1`;
    if (!row) return fail("Meter not found.", 404);
    if (!caller || !allows(caller, "read")) {
      return json({ meter: { meterNumber: row.meter_number, status: row.status, tariffBand: row.tariff_band, tariffKoboPerKwh: row.tariff_kobo_per_kwh, meterType: row.meter_type } });
    }
    const tokens = await sql<TokenRow>`SELECT * FROM vend_tokens WHERE meter_number = ${number} ORDER BY created_at DESC LIMIT 10`;
    return json({ meter: shape(row), recentTokens: tokens.map(shapeToken) });
  }

  if (req.method === "GET") {
    const actor = await guard(req, "read");
    if (actor instanceof Response) return actor;
    const params = new URL(req.url).searchParams;
    const status = STATUSES.has(params.get("status") || "") ? params.get("status") : null;
    const limit = Math.min(Math.max(Number(params.get("limit")) || 200, 1), 500);
    const rows = await sql<MeterRow>`
      SELECT * FROM meters WHERE (${status}::text IS NULL OR status = ${status}::text)
      ORDER BY registered_at DESC LIMIT ${limit}`;
    return json({ meters: rows.map(shape) });
  }

  // PATCH /api/meters/:number — verify or reject a signup, or correct its network details.
  const actor = await guard(req, "write");
  if (actor instanceof Response) return actor;
  if (!number) return fail("Say which meter: PATCH /api/meters/:number.", 405);
  const body = await readBody(req);
  if (!body) return fail("Send the changes as JSON.");
  const [current] = await sql<MeterRow>`SELECT * FROM meters WHERE meter_number = ${number} LIMIT 1`;
  if (!current) return fail("Meter not found.", 404);

  const status = body.status === undefined ? current.status : text(body.status, 40);
  if (!STATUSES.has(status)) return fail("Status must be pending-verification, verified, linked, rejected or suspended.");
  const band = body.tariffBand === undefined ? current.tariff_band : text(body.tariffBand, 1);
  if (!/^[A-E]$/.test(band)) return fail("The tariff band should be a letter from A to E.");
  let tariff = current.tariff_kobo_per_kwh;
  if (body.tariffKoboPerKwh !== undefined) {
    tariff = Math.round(Number(body.tariffKoboPerKwh));
    if (!Number.isFinite(tariff) || tariff < 100 || tariff > 1_000_000) return fail("The tariff should be given in kobo per kWh.");
  }
  const pick = (key: string, column: string | null, max: number) => (body[key] === undefined ? column : text(body[key], max) || null);

  const [row] = await sql<MeterRow>`
    UPDATE meters SET status = ${status}, tariff_band = ${band}, tariff_kobo_per_kwh = ${tariff},
      disco = ${pick("disco", current.disco, 60) ?? ""}, imei = ${pick("imei", current.imei, 40)}, rfid = ${pick("rfid", current.rfid, 40)},
      verified_at = CASE WHEN ${status}::text IN ('verified', 'linked') THEN COALESCE(verified_at, now()) ELSE verified_at END
    WHERE meter_number = ${number} RETURNING *`;
  return json({ meter: shape(row) });
};

export const config: Config = {
  path: ["/api/meters", "/api/v1/meters", "/api/meters/:number", "/api/v1/meters/:number"],
  method: ["GET", "PATCH"],
};
