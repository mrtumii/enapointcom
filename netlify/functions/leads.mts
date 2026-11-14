import type { Config } from "@netlify/functions";
import { guardAdmin } from "../lib/auth.mts";
import { db, fail, isEmail, json, looksAutomated, readBody, reference, text } from "../lib/http.mts";

/*
 * AI energy advisor sign-ups. POST is public (from /advisor); GET lists them for
 * staff in the marketing console, since they are personal data.
 */

const PLACES = new Set(["home", "shop", "office", "estate"]);
const APPLIANCES = ["ac", "fridge", "tv", "fan", "light", "pump"];

type LeadRow = { reference: string; name: string; email: string; phone: string; place: string; backup_hours: number; pay: string; system: Record<string, unknown>; marketing_ok: boolean; created_at: string };

async function list(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const rows = await db().sql<LeadRow>`
    SELECT reference, name, email, phone, place, backup_hours, pay, system, marketing_ok, created_at
    FROM advisor_leads ORDER BY created_at DESC LIMIT 200`;
  return json({
    leads: rows.map((r) => ({
      reference: r.reference, name: r.name, email: r.email, phone: r.phone, place: r.place,
      backupHours: r.backup_hours, pay: r.pay, system: r.system, marketingOk: r.marketing_ok, createdAt: r.created_at,
    })),
  });
}

const num = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export default async (req: Request) => {
  if (req.method === "GET") return list(req);
  const body = await readBody(req);
  if (!body) return fail("Please fill in your details and try again.");
  const ref = reference("ADV");
  const reply = "Thank you — your tailored quote is on its way. We'll be in touch within one working day.";
  if (looksAutomated(body)) return json({ ok: true, reference: ref, reply });

  const name = text(body.name, 120);
  const email = text(body.email, 200).toLowerCase();
  if (!name) return fail("Please tell us your name.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");

  const counts = (body.appliances || {}) as Record<string, unknown>;
  const appliances = Object.fromEntries(APPLIANCES.map((k) => [k, num(counts[k], 0, 50)]));
  const sys = (body.system || {}) as Record<string, unknown>;
  const system = {
    batteryKwh: num(sys.batteryKwh, 0, 1000), inverterKva: num(sys.inverterKva, 0, 1000), panels: num(sys.panels, 0, 1000),
    kwp: Number(sys.kwp) || 0, loadW: num(sys.loadW, 0, 1_000_000), priceNaira: num(sys.priceNaira, 0, 1_000_000_000),
  };
  const place = PLACES.has(text(body.place)) ? text(body.place) : "";
  const pay = text(body.pay) === "outright" ? "outright" : "monthly";

  await db().sql`
    INSERT INTO advisor_leads (reference, name, email, phone, place, appliances, backup_hours, pay, system, marketing_ok)
    VALUES (${ref}, ${name}, ${email}, ${text(body.phone, 40)}, ${place}, ${JSON.stringify(appliances)}::jsonb,
            ${num(body.backupHours, 0, 48)}, ${pay}, ${JSON.stringify(system)}::jsonb, ${body.marketingOk === true})`;
  return json({ ok: true, reference: ref, reply }, 201);
};

export const config: Config = { path: ["/api/leads", "/api/v1/leads"], method: ["GET", "POST"] };
