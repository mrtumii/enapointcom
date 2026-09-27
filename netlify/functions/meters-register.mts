import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, readBody, reference, text } from "../lib/http.mts";

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please fill in the form and try again.");
  if (text(body._hp)) return fail("We couldn't register that meter. Please try again.");

  const meterNumber = text(body.meterNumber, 40).replace(/[\s-]/g, "");
  const holderName = text(body.holderName, 120);
  const email = text(body.email, 200);
  const phone = text(body.phone, 40);
  if (!/^\d{6,20}$/.test(meterNumber)) return fail("The meter number should be 6 to 20 digits.");
  if (!holderName) return fail("Please enter the name on the meter account.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 7) return fail("Please enter a valid phone number.");

  const band = /^[A-E]$/.test(text(body.tariffBand)) ? text(body.tariffBand) : "C";
  const meterType = text(body.meterType) === "three-phase" ? "three-phase" : "single-phase";
  const sql = db().sql;

  const [existing] = await sql`SELECT id FROM meters WHERE meter_number = ${meterNumber} LIMIT 1`;
  if (existing) return fail("This meter is already registered. If you think that's wrong, email signup@enapoint.com.", 409);

  const [meter] = await sql<{ meter_number: string; status: string }>`
    INSERT INTO meters (meter_number, imei, holder_name, address, disco, tariff_band, phone, email, meter_type, state, status, source)
    VALUES (${meterNumber}, ${text(body.imei, 40) || null}, ${holderName}, ${text(body.address, 300)}, ${text(body.disco, 60)},
            ${band}, ${phone}, ${email}, ${meterType}, ${text(body.state, 60)}, 'pending-verification', 'website')
    RETURNING meter_number, status`;

  return json({
    reference: reference("MTR"),
    reply: "Your meter is registered. We verify it with your distribution company within two working days and email you when it's done.",
    meter: { meterNumber: meter.meter_number, status: meter.status },
  }, 201);
};

export const config: Config = { path: ["/api/meters/register", "/api/v1/meters/register"], method: "POST" };
