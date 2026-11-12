import type { Config } from "@netlify/functions";
import { guard } from "../lib/auth.mts";
import { fail, json } from "../lib/http.mts";
import { parsePayload, store } from "../lib/acrel.mts";

/*
 * HTTPS endpoint for Acrel IoT EMS Data Forwarding. Accepts the same payloads Acrel
 * publishes over MQTT: a JSON array of real-time readings, or an EventData object.
 * Authenticated with a write-scoped ENA API key, sent as "Authorization: Bearer …" or,
 * for forwarders that can't set headers, as ?key=… on the URL.
 */
export default async (req: Request) => {
  let authed = req;
  const key = new URL(req.url).searchParams.get("key");
  if (!req.headers.get("authorization") && key) {
    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${key}`);
    authed = new Request(req.url, { method: req.method, headers });
  }
  const actor = await guard(authed, "write");
  if (actor instanceof Response) return actor;

  const raw = await req.text();
  if (raw.length > 2_000_000) return fail("Payload too large; send at most 2 MB per request.", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail("Send the Acrel payload as JSON.");
  }
  const saved = await store(parsePayload(payload));
  // Acrel treats success:"1" as delivered; the counts help when testing by hand.
  return json({ success: "1", ...saved });
};

export const config: Config = {
  path: ["/api/acrel/ingest", "/api/v1/acrel/ingest"],
  method: ["POST"],
};
