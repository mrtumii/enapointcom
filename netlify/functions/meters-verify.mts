import type { Config } from "@netlify/functions";
import { db, fail, json, readBody, text } from "../lib/http.mts";

export default async (req: Request) => {
  const body = await readBody(req);
  const id = text(body?.meterNumber ?? body?.imei ?? body?.rfid, 40).replace(/[\s-]/g, "");
  if (!id) return fail("Send a meterNumber, imei or rfid to check.");
  const [row] = await db().sql<{ status: string }>`
    SELECT status FROM meters WHERE meter_number = ${id} OR imei = ${id} OR rfid = ${id} LIMIT 1`;
  return json({ registered: Boolean(row), status: row?.status ?? null });
};

export const config: Config = { path: ["/api/meters/verify", "/api/v1/meters/verify"], method: "POST" };
