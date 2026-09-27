import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, looksAutomated, readBody, reference, text } from "../lib/http.mts";

const ORG_TYPES = new Set(["bank", "fintech", "disco", "government", "installer", "developer", "other"]);
const INTEGRATIONS = new Set(["vending", "metering", "monitoring", "catalogue", "custom"]);
const CAPABILITIES = new Set(["register-meters", "verify-meters", "quote-topups", "sell-units", "vending-log", "webhooks", "device-data", "products"]);
const CHANNELS = new Set(["mobile-app", "web", "ussd", "branch", "pos", "back-office"]);

function pick(value: unknown, allowed: Set<string>): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  return [...new Set(list.map((v) => text(v, 40)).filter((v) => allowed.has(v)))];
}

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please complete the setup steps and try again.");
  const ref = reference("PTR");
  if (looksAutomated(body)) return json({ ok: true, reference: ref }, 201);

  const organisation = text(body.organisation, 200);
  const orgType = text(body.orgType, 40);
  const integration = text(body.integration, 40);
  const contactName = text(body.contactName, 120);
  const contactEmail = text(body.contactEmail, 200);
  const techEmail = text(body.techEmail, 200);

  if (!organisation) return fail("Please enter your organisation's name.");
  if (!ORG_TYPES.has(orgType)) return fail("Please choose the type of organisation.");
  if (!INTEGRATIONS.has(integration)) return fail("Please choose what you want to build.");
  if (!contactName) return fail("Please enter a contact name.");
  if (!isEmail(contactEmail)) return fail("Please enter a valid contact email address.");
  if (techEmail && !isEmail(techEmail)) return fail("Please enter a valid technical contact email, or leave it blank.");
  if (body.agree !== true && body.agree !== "yes" && body.agree !== "on") return fail("Please accept the partner terms to continue.");

  await db().sql`
    INSERT INTO partner_applications
      (reference, organisation, org_type, country, website, integration, capabilities, channels, monthly_volume, go_live,
       contact_name, contact_role, contact_email, contact_phone, tech_email, notes)
    VALUES (${ref}, ${organisation}, ${orgType}, ${text(body.country, 80)}, ${text(body.website, 200)}, ${integration},
            ${JSON.stringify(pick(body.capabilities, CAPABILITIES))}::jsonb, ${JSON.stringify(pick(body.channels, CHANNELS))}::jsonb,
            ${text(body.monthlyVolume, 40)}, ${text(body.goLive, 40)},
            ${contactName}, ${text(body.contactRole, 120)}, ${contactEmail}, ${text(body.contactPhone, 40)}, ${techEmail}, ${text(body.notes, 5000)})`;

  return json({ ok: true, reference: ref }, 201);
};

export const config: Config = { path: ["/api/partners/apply", "/api/v1/partners/apply"], method: "POST" };
