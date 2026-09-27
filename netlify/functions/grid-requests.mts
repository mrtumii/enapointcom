import type { Config } from "@netlify/functions";
import { guardAdmin } from "../lib/auth.mts";
import { db, fail, isEmail, json, looksAutomated, readBody, text } from "../lib/http.mts";

function whole(value: unknown, fallback: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

type RequestRow = {
  created_at: string; system_type: string; sector: string; peak_load_kw: number; storage_kwh: number; meter_count: number;
  build_window: string; contact_name: string; contact_email: string; location: string; notes: string;
};

async function list(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const rows = await db().sql<RequestRow>`
    SELECT created_at, system_type, sector, peak_load_kw, storage_kwh, meter_count, build_window, contact_name, contact_email, location, notes
    FROM grid_requests ORDER BY created_at DESC LIMIT 200`;
  return json({
    requests: rows.map((g) => ({
      createdAt: g.created_at, systemType: g.system_type, sector: g.sector, peakLoadKw: g.peak_load_kw, storageKwh: g.storage_kwh,
      meterCount: g.meter_count, buildWindow: g.build_window, contactName: g.contact_name, contactEmail: g.contact_email,
      location: g.location, notes: g.notes,
    })),
  });
}

export default async (req: Request) => {
  if (req.method === "GET") return list(req);
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

export const config: Config = { path: ["/api/grid-requests", "/api/v1/grid-requests"], method: ["GET", "POST"] };
