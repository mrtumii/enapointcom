import type { Config } from "@netlify/functions";
import { guard } from "../lib/auth.mts";
import { db, json } from "../lib/http.mts";

type DeviceRow = { id: number; name: string; type: string; identifier: string; reading: string; status: string; account_ref: string };

export default async (req: Request) => {
  const actor = await guard(req, "read");
  if (actor instanceof Response) return actor;
  const rows = await db().sql<DeviceRow>`SELECT id, name, type, identifier, reading, status, account_ref FROM devices ORDER BY type, name`;
  return json({
    devices: rows.map((d) => ({ id: d.id, name: d.name, type: d.type, identifier: d.identifier, reading: d.reading, status: d.status, account: d.account_ref })),
    summary: { online: rows.filter((d) => d.status === "online").length, total: rows.length },
  });
};

export const config: Config = { path: ["/api/devices", "/api/v1/devices"], method: "GET" };
