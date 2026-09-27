import type { Config, Context } from "@netlify/functions";
import { guardAdmin } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { issueKey } from "../lib/keys.mts";

type ApplicationRow = {
  id: number; reference: string; organisation: string; org_type: string; country: string; website: string; integration: string;
  capabilities: string[]; channels: string[]; monthly_volume: string; go_live: string; contact_name: string; contact_role: string;
  contact_email: string; contact_phone: string; tech_email: string; notes: string; status: string; reviewer_notes: string;
  reviewed_at: string | null; api_key_id: number | null; key_prefix: string | null; key_revoked_at: string | null; created_at: string;
};

const STATUSES = new Set(["submitted", "reviewing", "approved", "declined"]);
// Features that need to change data rather than just read it.
const WRITE_CAPABILITIES = new Set(["register-meters", "sell-units", "products"]);

const shape = (a: ApplicationRow) => ({
  reference: a.reference, organisation: a.organisation, orgType: a.org_type, country: a.country, website: a.website,
  integration: a.integration, capabilities: a.capabilities ?? [], channels: a.channels ?? [], monthlyVolume: a.monthly_volume,
  goLive: a.go_live, contactName: a.contact_name, contactRole: a.contact_role, contactEmail: a.contact_email,
  contactPhone: a.contact_phone, techEmail: a.tech_email, notes: a.notes, status: a.status, reviewerNotes: a.reviewer_notes,
  reviewedAt: a.reviewed_at, createdAt: a.created_at,
  testKey: a.api_key_id ? { id: a.api_key_id, keyPrefix: a.key_prefix, revoked: Boolean(a.key_revoked_at) } : null,
});

async function find(ref: string) {
  const [row] = await db().sql<ApplicationRow>`
    SELECT a.*, k.key_prefix, k.revoked_at AS key_revoked_at
    FROM partner_applications a LEFT JOIN api_keys k ON k.id = a.api_key_id WHERE a.reference = ${ref}`;
  return row;
}

// Staff-only: review integration requests and issue test keys from them.
export default async (req: Request, context: Context) => {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const sql = db().sql;
  const ref = text(context.params?.reference, 40).toUpperCase();
  const wantsKey = new URL(req.url).pathname.endsWith("/key");

  if (req.method === "GET" && !ref) {
    const status = new URL(req.url).searchParams.get("status");
    const filter = STATUSES.has(status || "") ? status : null;
    const [rows, counts] = await Promise.all([
      sql<ApplicationRow>`
        SELECT a.*, k.key_prefix, k.revoked_at AS key_revoked_at
        FROM partner_applications a LEFT JOIN api_keys k ON k.id = a.api_key_id
        WHERE (${filter}::text IS NULL OR a.status = ${filter}::text)
        ORDER BY a.created_at DESC LIMIT 200`,
      sql<{ status: string; n: number }>`SELECT status, COUNT(*)::int AS n FROM partner_applications GROUP BY status`,
    ]);
    const summary = Object.fromEntries([...STATUSES].map((s) => [s, 0]));
    for (const c of counts) summary[c.status] = c.n;
    return json({ applications: rows.map(shape), summary });
  }

  const current = ref ? await find(ref) : null;
  if (!current) return fail("We couldn't find that application.", 404);
  if (req.method === "GET") return json({ application: shape(current) });

  if (req.method === "POST" && wantsKey) {
    if (current.status === "declined") return fail("This application was declined. Reopen it before issuing a key.", 409);
    if (current.api_key_id && !current.key_revoked_at) {
      return fail("A test key has already been issued for this application. Revoke it under API keys to issue a new one.", 409);
    }
    const write = (current.capabilities ?? []).some((c) => WRITE_CAPABILITIES.has(c));
    const { key, record } = await issueKey(`${current.organisation} · ${current.reference}`.slice(0, 80), "test", write ? ["read", "write"] : ["read"]);
    await sql`
      UPDATE partner_applications SET api_key_id = ${record.id}, status = 'approved', reviewed_at = now()
      WHERE id = ${current.id}`;
    return json({ key, record, application: shape((await find(ref))!) }, 201);
  }

  if (req.method !== "PATCH") return fail("Method not allowed.", 405);
  const body = await readBody(req);
  if (!body) return fail("Send the changes as JSON.");
  const status = body.status === undefined ? current.status : text(body.status, 20);
  if (!STATUSES.has(status)) return fail("Status must be submitted, reviewing, approved or declined.");
  const notes = body.reviewerNotes === undefined ? current.reviewer_notes : text(body.reviewerNotes, 2000);
  await sql`
    UPDATE partner_applications SET status = ${status}, reviewer_notes = ${notes},
      reviewed_at = CASE WHEN ${status}::text <> status THEN now() ELSE reviewed_at END
    WHERE id = ${current.id}`;
  return json({ application: shape((await find(ref))!) });
};

export const config: Config = {
  path: ["/api/partners/applications", "/api/partners/applications/:reference", "/api/partners/applications/:reference/key"],
  method: ["GET", "POST", "PATCH"],
};
