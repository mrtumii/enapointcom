import type { Config } from "@netlify/functions";
import mqtt from "mqtt";
import { db } from "../lib/http.mts";
import { HISTORY_DAYS, parsePayload, store } from "../lib/acrel.mts";

/*
 * Netlify doesn't keep processes running between requests, so instead of a permanent
 * MQTT subscriber this runs every minute and drains the broker. It connects with a
 * fixed client id and a persistent session (clean: false), so the broker holds QoS 1
 * messages published while we're disconnected and hands them over on reconnect.
 * Does nothing until MQTT_URL is set.
 */

const env = (name: string, fallback = "") => (process.env[name] || "").trim() || fallback;

const LISTEN_MS = 20_000; // hard stop, well inside the scheduled-function limit
const QUIET_MS = 3_000; // stop early once the backlog is empty

function drain(): Promise<unknown[]> {
  const topics = [env("MQTT_TOPIC_REALTIME", "ena/acrel/meter/realtime"), env("MQTT_TOPIC_EVENT", "ena/acrel/meter/event")];
  const qos = (Number(env("MQTT_QOS", "1")) === 0 ? 0 : 1) as 0 | 1;
  const payloads: unknown[] = [];
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(env("MQTT_URL"), {
      clientId: env("MQTT_CLIENT_ID", "ena-netlify-drain"),
      username: env("MQTT_USERNAME") || undefined,
      password: env("MQTT_PASSWORD") || undefined,
      clean: false,
      reconnectPeriod: 0,
      connectTimeout: 8_000,
    });
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const finish = (err?: Error) => {
      clearTimeout(quiet);
      clearTimeout(hard);
      client.end(false, {}, () => (err && !payloads.length ? reject(err) : resolve(payloads)));
    };
    const hard = setTimeout(() => finish(), LISTEN_MS);
    const settle = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => finish(), QUIET_MS);
    };
    client.on("connect", () => {
      client.subscribe(topics, { qos }, (err) => (err ? finish(err) : settle()));
    });
    client.on("message", (topic, buf) => {
      try {
        payloads.push(JSON.parse(buf.toString("utf8")));
      } catch {
        console.error(`[mqtt] dropped non-JSON message on ${topic}`);
      }
      settle();
    });
    client.on("error", (err) => finish(err));
  });
}

export default async () => {
  if (minuteOfHour() === 7) {
    await db().sql`DELETE FROM meter_readings WHERE received_at < now() - make_interval(days => ${HISTORY_DAYS})`;
  }
  if (!env("MQTT_URL")) return;
  const payloads = await drain();
  let readings = 0;
  let events = 0;
  for (const p of payloads) {
    const saved = await store(parsePayload(p));
    readings += saved.readings;
    events += saved.events;
  }
  console.log(`[mqtt] drained ${payloads.length} message(s): ${readings} reading(s), ${events} event(s)`);
};

const minuteOfHour = () => new Date().getUTCMinutes();

export const config: Config = {
  schedule: "* * * * *",
};
