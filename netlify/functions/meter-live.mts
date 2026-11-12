import type { Config, Context } from "@netlify/functions";
import { actorName, allows, guard, identify } from "../lib/auth.mts";
import { db, fail, json, readBody } from "../lib/http.mts";
import { ACTIONS, AcrelError, FIELD_META, acrelConfigured, normaliseSn, runCommand, type Action } from "../lib/acrel.mts";

type Snapshot = { meter_sn: string; meter_no: string; gateway_sn: string; state: string; metrics: Record<string, unknown>; read_at: string; updated_at: string | Date };
type Link = { meter_number: string; acrel_meter_sn: string | null; acrel_gateway_sn: string | null; status: string };

// A meter that hasn't reported for this long is shown as offline whatever it last said.
const STALE_MS = 30 * 60 * 1000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function online(s: Snapshot) {
  const fresh = Date.now() - new Date(s.updated_at).getTime() < STALE_MS;
  return s.state === "ONLINE" && fresh;
}

/** What anyone with the meter number can see: link state, balance and consumption. */
const publicView = (s: Snapshot) => ({
  meterSn: s.meter_sn,
  online: online(s),
  state: s.state,
  readAt: s.read_at,
  updatedAt: s.updated_at,
  remainingKwh: num(s.metrics.BasePowRema),
  energyKwh: num(s.metrics.EPI),
  powerKw: num(s.metrics.P),
});

/** Key holders and staff also get the gateway and every metric, labelled. */
const fullView = (s: Snapshot) => ({
  ...publicView(s),
  meterNo: s.meter_no,
  gatewaySn: s.gateway_sn,
  metrics: Object.fromEntries(Object.entries(s.metrics).map(([k, v]) => [k, { value: v, label: FIELD_META[k]?.label ?? k, unit: FIELD_META[k]?.unit ?? "" }])),
});

async function resolve(number: string) {
  const sql = db().sql;
  const [link] = await sql<Link>`
    SELECT meter_number, acrel_meter_sn, acrel_gateway_sn, status FROM meters
    WHERE meter_number = ${number} OR acrel_meter_sn = ${number} LIMIT 1`;
  const sn = link?.acrel_meter_sn || number;
  const [snap] = await sql<Snapshot>`SELECT * FROM meter_telemetry WHERE meter_sn = ${sn} LIMIT 1`;
  return { link: link ?? null, sn, snap: snap ?? null };
}

const limitOf = (req: Request, fallback: number, max: number) =>
  Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || fallback, 1), max);

export default async (req: Request, context: Context) => {
  const sql = db().sql;
  const path = new URL(req.url).pathname.replace(/^\/api(\/v1)?/, "");
  const number = normaliseSn(context.params?.number ? decodeURIComponent(context.params.number).replace(/[\s-]/g, "") : "");

  // GET /api/telemetry — every meter's latest snapshot plus fleet counts.
  if (path === "/telemetry" || path === "/telemetry/") {
    const actor = await guard(req, "read");
    if (actor instanceof Response) return actor;
    const rows = await sql<Snapshot & { meter_number: string | null }>`
      SELECT t.*, m.meter_number FROM meter_telemetry t
      LEFT JOIN meters m ON m.meter_number = t.meter_sn OR m.acrel_meter_sn = t.meter_sn
      ORDER BY t.updated_at DESC LIMIT ${limitOf(req, 200, 1000)}`;
    const meters = rows.map((r) => ({ ...fullView(r), meterNumber: r.meter_number }));
    const on = meters.filter((m) => m.online).length;
    const [{ events }] = await sql<{ events: number }>`SELECT COUNT(*)::int AS events FROM meter_events WHERE received_at > now() - interval '24 hours'`;
    return json({ stats: { meters: meters.length, online: on, offline: meters.length - on, eventsLast24h: events }, controlEnabled: acrelConfigured(), meters });
  }

  // GET /api/telemetry/events — alarms across the fleet, newest first.
  if (path.startsWith("/telemetry/events")) {
    const actor = await guard(req, "read");
    if (actor instanceof Response) return actor;
    const meter = normaliseSn(new URL(req.url).searchParams.get("meter") || "") || null;
    const rows = await sql`
      SELECT meter_sn, gateway_sn, code, level, message, detail, occurred_at, received_at FROM meter_events
      WHERE (${meter}::text IS NULL OR meter_sn = ${meter}::text)
      ORDER BY received_at DESC LIMIT ${limitOf(req, 100, 500)}`;
    return json({ events: rows });
  }

  if (!number) return fail("Say which meter: /api/meters/:number/live.", 404);
  const { link, sn, snap } = await resolve(number);

  // GET /api/meters/:number/live
  if (path.endsWith("/live")) {
    const caller = req.headers.get("authorization") ? await guard(req, "read") : await identify(req);
    if (caller instanceof Response) return caller;
    if (!snap) {
      return fail(link ? "This meter is registered but hasn't reported any live data yet." : "No live data for that meter number.", 404);
    }
    const full = caller && allows(caller, "read");
    return json({ meterNumber: link?.meter_number ?? null, live: full ? fullView(snap) : publicView(snap) });
  }

  if (path.endsWith("/readings")) {
    const actor = await guard(req, "read");
    if (actor instanceof Response) return actor;
    const rows = await sql`
      SELECT state, source, read_at, metrics, received_at FROM meter_readings
      WHERE meter_sn = ${sn} ORDER BY received_at DESC LIMIT ${limitOf(req, 100, 1000)}`;
    return json({ meterSn: sn, readings: rows });
  }

  if (path.endsWith("/events")) {
    const actor = await guard(req, "read");
    if (actor instanceof Response) return actor;
    const rows = await sql`
      SELECT code, level, message, detail, occurred_at, received_at FROM meter_events
      WHERE meter_sn = ${sn} ORDER BY received_at DESC LIMIT ${limitOf(req, 100, 500)}`;
    return json({ meterSn: sn, events: rows });
  }

  // POST /api/meters/:number/control { action, amount?, gatewaySn? }
  if (path.endsWith("/control") && req.method === "POST") {
    const actor = await guard(req, "write");
    if (actor instanceof Response) return actor;
    if (!acrelConfigured()) return fail("Remote control isn't switched on yet: the Acrel account hasn't been configured.", 503);
    const body = (await readBody(req)) ?? {};
    const action = String(body.action || "") as Action;
    if (!ACTIONS.includes(action)) return fail(`Action must be one of: ${ACTIONS.join(", ")}.`);
    let amount: number | undefined;
    if (action === "topup") {
      amount = Number(body.amount);
      if (!(amount > 0) || amount > 1_000_000) return fail("Send a positive top-up amount.");
    }
    const gatewaySn = normaliseSn(body.gatewaySn) || link?.acrel_gateway_sn || snap?.gateway_sn || "";
    if (!gatewaySn) return fail("This meter has no known gateway yet. Send gatewaySn, or wait for its first reading.");
    try {
      await runCommand(sn, gatewaySn, action, actorName(actor), amount);
      return json({ ok: true, meterSn: sn, gatewaySn, action });
    } catch (e) {
      const err = e as AcrelError;
      return json({ error: err.message, acrel: err.acrel ?? null }, 502);
    }
  }

  return fail("Unknown meter telemetry route.", 404);
};

export const config: Config = {
  path: [
    "/api/telemetry", "/api/v1/telemetry", "/api/telemetry/events", "/api/v1/telemetry/events",
    "/api/meters/:number/live", "/api/v1/meters/:number/live",
    "/api/meters/:number/readings", "/api/v1/meters/:number/readings",
    "/api/meters/:number/events", "/api/v1/meters/:number/events",
    "/api/meters/:number/control", "/api/v1/meters/:number/control",
  ],
  method: ["GET", "POST"],
};
