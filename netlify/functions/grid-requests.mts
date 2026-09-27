import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, looksAutomated, readBody, text } from "../lib/http.mts";

function whole(value: unknown, fallback: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please fill in the form and try again.");
  const reply = "Thank you — our projects team will be in touch within two working days.";
  if (looksAutomated(body)) return json({ ok: true, reply });

  const contactName = text(body.contactName, 120);
  const contactEmail = text(body.contactEmail, 200);
  if (!contactName) return fail("Please tell us your name.");
  if (!isEmail(contactEmail)) return fail("Please enter a valid email address.");

  await db().sql`
    INSERT INTO grid_requests (system_type, sector, peak_load_kw, storage_kwh, meter_count, build_window, contact_name, contact_email, location, notes)
    VALUES (${text(body.systemType, 40) || "mini-grid"}, ${text(body.sector, 40) || "estate"},
            ${whole(body.peakLoadKw, 100, 100000)}, ${whole(body.storageKwh, 0, 1000000)}, ${whole(body.meterCount, 0, 100000)},
            ${text(body.buildWindow, 40)}, ${contactName}, ${contactEmail}, ${text(body.location, 200)}, ${text(body.notes, 5000)})`;
  return json({ ok: true, reply }, 201);
};

export const config: Config = { path: ["/api/grid-requests", "/api/v1/grid-requests"], method: "POST" };
