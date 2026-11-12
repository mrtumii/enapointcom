import { createCipheriv } from "node:crypto";
import { db } from "./http.mts";

/*
 * ENA Plus prepaid meters report through the Acrel IoT EMS platform (iot.acrel-eem.com).
 *  - Inbound: Acrel's Data Forwarding publishes real-time readings (a JSON array of
 *    MeterRealTimeData) and alarms (EventData with a list[]). They reach us either as an
 *    HTTPS POST to /api/acrel/ingest or through an MQTT broker the scheduled drain reads.
 *  - Outbound: switch, refresh and top-up go to Acrel's /basic/prepayment API after an
 *    AES-encrypted login that returns a token.
 */

const env = (name: string, fallback = "") => (process.env[name] || "").trim() || fallback;

/** Acrel serials can be digits or letters (e.g. "T001032"). */
export function normaliseSn(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);
}

// ------------------------------------------------------------------ field dictionary

export const FIELD_META: Record<string, { label: string; unit: string }> = {
  Ua: { label: "Voltage L1", unit: "V" }, Ub: { label: "Voltage L2", unit: "V" }, Uc: { label: "Voltage L3", unit: "V" },
  Ia: { label: "Current L1", unit: "A" }, Ib: { label: "Current L2", unit: "A" }, Ic: { label: "Current L3", unit: "A" },
  Pa: { label: "Active power L1", unit: "kW" }, Pb: { label: "Active power L2", unit: "kW" }, Pc: { label: "Active power L3", unit: "kW" },
  P: { label: "Total active power", unit: "kW" },
  PF: { label: "Power factor", unit: "" },
  EPI: { label: "Energy (import)", unit: "kWh" },
  BasePowRema: { label: "Remaining units", unit: "kWh" },
  SaleMoney: { label: "Last purchase amount", unit: "" },
  OweMoney: { label: "Amount owed", unit: "" },
  PrepayMode: { label: "Prepay mode", unit: "" },
};

const IDENTITY_KEYS = new Set(["meterSn", "meterNo", "gatewaySn", "state", "source", "createTime", "CreateTime"]);

type Reading = { meterSn: string; meterNo: string; gatewaySn: string; state: string; source: string; readAt: string; metrics: Record<string, unknown> };
type MeterEvent = { meterSn: string; gatewaySn: string; code: string; level: string; message: string; detail: unknown; occurredAt: string };

const str = (v: unknown, max = 120) => (v === null || v === undefined ? "" : String(v).slice(0, max));
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Numbers arrive as numbers or numeric strings; everything else passes through unchanged. */
function normaliseReading(raw: Record<string, unknown>): Reading {
  const metrics: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (IDENTITY_KEYS.has(k)) continue;
    metrics[k] = typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return {
    meterSn: normaliseSn(raw.meterSn), meterNo: str(raw.meterNo), gatewaySn: normaliseSn(raw.gatewaySn),
    state: str(raw.state, 20).toUpperCase(), source: str(raw.source, 20).toUpperCase(),
    readAt: str(raw.createTime ?? raw.CreateTime, 40), metrics,
  };
}

const looksLikeEvent = (o: unknown): o is Record<string, unknown> => isObj(o) && Array.isArray(o.list) && Boolean(o.meterSn);
const looksLikeReading = (o: unknown): o is Record<string, unknown> =>
  isObj(o) && Boolean(o.meterSn) && ("Ua" in o || "state" in o || "EPI" in o || "P" in o);

/** Sorts any Acrel payload (array or object, either topic) into readings and events. */
export function parsePayload(payload: unknown): { readings: Reading[]; events: MeterEvent[] } {
  const items = Array.isArray(payload) ? payload : isObj(payload) && Array.isArray(payload.data) ? payload.data : [payload];
  const readings: Reading[] = [];
  const events: MeterEvent[] = [];
  for (const item of items.slice(0, 2000)) {
    if (looksLikeEvent(item)) {
      for (const info of (item.list as unknown[]).slice(0, 200)) {
        if (!isObj(info)) continue;
        const message = isObj(info.message) ? info.message.en_US ?? Object.values(info.message)[0] : info.message;
        events.push({
          meterSn: normaliseSn(item.meterSn), gatewaySn: normaliseSn(item.gatewaySn),
          code: str(info.code, 40), level: str(info.level, 10), message: str(message, 300),
          detail: { message: info.message ?? null, origInfo: info.origInfo ?? null }, occurredAt: str(item.createTime, 40),
        });
      }
    } else if (looksLikeReading(item)) {
      const r = normaliseReading(item);
      if (r.meterSn) readings.push(r);
    }
  }
  return { readings, events: events.filter((e) => e.meterSn) };
}

/** Writes parsed data: history rows, the latest snapshot per meter, and alarms. */
export async function store(parsed: { readings: Reading[]; events: MeterEvent[] }) {
  const sql = db().sql;
  if (parsed.readings.length) {
    await sql`
      INSERT INTO meter_readings (meter_sn, gateway_sn, state, source, read_at, metrics)
      SELECT x->>'meterSn', x->>'gatewaySn', x->>'state', x->>'source', x->>'readAt', x->'metrics'
      FROM jsonb_array_elements(${JSON.stringify(parsed.readings)}::jsonb) AS x`;
    // HISTORY uploads backfill the log but must not overwrite a newer live snapshot.
    const latest = new Map<string, Reading>();
    for (const r of parsed.readings) if (r.source !== "HISTORY") latest.set(r.meterSn, r);
    if (latest.size) {
      await sql`
        INSERT INTO meter_telemetry (meter_sn, meter_no, gateway_sn, state, metrics, read_at, updated_at)
        SELECT x->>'meterSn', x->>'meterNo', x->>'gatewaySn', x->>'state', x->'metrics', x->>'readAt', now()
        FROM jsonb_array_elements(${JSON.stringify([...latest.values()])}::jsonb) AS x
        ON CONFLICT (meter_sn) DO UPDATE SET
          meter_no = COALESCE(NULLIF(EXCLUDED.meter_no, ''), meter_telemetry.meter_no),
          gateway_sn = COALESCE(NULLIF(EXCLUDED.gateway_sn, ''), meter_telemetry.gateway_sn),
          state = COALESCE(NULLIF(EXCLUDED.state, ''), meter_telemetry.state),
          metrics = meter_telemetry.metrics || EXCLUDED.metrics,
          read_at = EXCLUDED.read_at, updated_at = now()`;
    }
  }
  if (parsed.events.length) {
    await sql`
      INSERT INTO meter_events (meter_sn, gateway_sn, code, level, message, detail, occurred_at)
      SELECT x->>'meterSn', x->>'gatewaySn', x->>'code', x->>'level', x->>'message', x->'detail', x->>'occurredAt'
      FROM jsonb_array_elements(${JSON.stringify(parsed.events)}::jsonb) AS x`;
  }
  return { readings: parsed.readings.length, events: parsed.events.length };
}

/** Readings kept per meter; older rows are trimmed by the scheduled drain. */
export const HISTORY_DAYS = 90;

// ------------------------------------------------------------------ outbound control

export const acrelConfigured = () => Boolean(env("ACREL_LOGIN_NAME") && env("ACREL_PASSWORD"));

const base = () => env("ACREL_API_BASE", "https://iot.acrel-eem.com/basic/prepayment").replace(/\/+$/, "");

/** AES-128-CBC with zero padding, Base64 output (Acrel Appendix 3). */
export function aesEncrypt(plain: string, key: string, iv: string): string {
  const data = Buffer.from(plain, "utf8");
  const padded = Buffer.concat([data, Buffer.alloc((16 - (data.length % 16)) % 16, 0)]);
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

type AcrelResponse = { success?: string; errorCode?: string | number; errorMsg?: string; data?: any };

let tokenCache = { token: "", at: 0 };
const TOKEN_TTL_MS = 25 * 60 * 1000;

async function call(url: string, init: RequestInit): Promise<{ status: number; body: AcrelResponse }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = (await res.json().catch(() => ({}))) as AcrelResponse;
  return { status: res.status, body };
}

async function login(force = false): Promise<string> {
  if (!force && tokenCache.token && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.token;
  // 1234567890123456 is the protocol's published default; tenants that issue their own set the env vars.
  const parameters = aesEncrypt(
    JSON.stringify({ LoginName: env("ACREL_LOGIN_NAME"), PassWord: env("ACREL_PASSWORD") }),
    env("ACREL_AES_KEY", "1234567890123456"), env("ACREL_AES_IV", "1234567890123456"),
  );
  const { status, body } = await call(`${base()}/auth_user/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ parameters }).toString(),
  });
  if (body.success !== "1" || !body.data?.token) {
    throw new AcrelError(`Acrel login failed (${body.errorCode || status}${body.errorMsg ? ": " + body.errorMsg : ""}).`, body);
  }
  tokenCache = { token: String(body.data.token), at: Date.now() };
  return tokenCache.token;
}

export class AcrelError extends Error {
  acrel: AcrelResponse | null;
  constructor(message: string, acrel: AcrelResponse | null = null) {
    super(message);
    this.acrel = acrel;
  }
}

const ERROR_HINTS: Record<string, string> = {
  "1002": "a parameter is empty", "2050": "command delivery failed", "2051": "command delivery timed out",
  "2052": "the device is not connected", "4904": "the gateway is offline", "5006": "the purchase amount was rejected",
};

async function control(gatewaySn: string, meterSn: string, method: string, value: Record<string, string>, retried = false): Promise<AcrelResponse> {
  const token = await login(retried);
  const { status, body } = await call(`${base()}/entry/home/control`, {
    method: "POST",
    headers: { "content-type": "application/json", token },
    body: JSON.stringify({ gatewaySn, meterSn, method, value }),
  });
  if (!retried && ["10004", "10005", "10006", "4001"].includes(String(body.errorCode))) {
    return control(gatewaySn, meterSn, method, value, true);
  }
  if (body.success !== "1") {
    const code = String(body.errorCode || status);
    const hint = ERROR_HINTS[code] ? ` — ${ERROR_HINTS[code]}` : "";
    throw new AcrelError(`Acrel ${method} failed (${code}${hint}).`, body);
  }
  return body;
}

export const ACTIONS = ["on", "off", "force-on", "force-off", "refresh", "maintenance-start", "maintenance-end", "topup"] as const;
export type Action = (typeof ACTIONS)[number];

/** Maps an ENA action onto Acrel's method/value pair (Appendix 2). */
export function command(action: Action, amount?: number): { method: string; value: Record<string, string> } {
  switch (action) {
    case "on": return { method: "SWITCH", value: { Switch: "1" } };
    case "off": return { method: "SWITCH", value: { Switch: "0" } };
    case "force-on": return { method: "FORCESWITCH", value: { ForceSwitch: "1" } };
    case "force-off": return { method: "FORCESWITCH", value: { ForceSwitch: "0" } };
    case "refresh": return { method: "REFRESH", value: {} };
    case "maintenance-start": return { method: "RLYREP", value: { RlyRep: "1" } };
    case "maintenance-end": return { method: "RLYREP", value: { RlyRep: "0" } };
    // The top-up method name varies by tenant; confirm it in the sandbox and set ACREL_VEND_METHOD.
    case "topup": return { method: env("ACREL_VEND_METHOD", "SETPARAM"), value: { SaleMoney: String(amount) } };
  }
}

/** Sends a command and records it, successful or not, in meter_commands. */
export async function runCommand(meterSn: string, gatewaySn: string, action: Action, actor: string, amount?: number) {
  const { method, value } = command(action, amount);
  const sql = db().sql;
  try {
    const result = await control(gatewaySn, meterSn, method, value);
    await sql`INSERT INTO meter_commands (meter_sn, gateway_sn, action, value, ok, actor)
      VALUES (${meterSn}, ${gatewaySn}, ${action}, ${JSON.stringify({ method, ...value })}::jsonb, true, ${actor})`;
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`INSERT INTO meter_commands (meter_sn, gateway_sn, action, value, ok, error, actor)
      VALUES (${meterSn}, ${gatewaySn}, ${action}, ${JSON.stringify({ method, ...value })}::jsonb, false, ${message.slice(0, 500)}, ${actor})`;
    throw e instanceof AcrelError ? e : new AcrelError(message);
  }
}
