import type { Config } from "@netlify/functions";
import { json } from "../lib/http.mts";
import { config as f50, reservedCount } from "../lib/founding50.mts";

// Public prices, plans and the live counter for the Founding 50 page.
export default async () => {
  const { _readme, reservedOffline, ...pub } = f50 as typeof f50 & { _readme?: string };
  return json({ ...pub, reserved: await reservedCount() });
};

export const config: Config = { path: "/api/founding50", method: "GET" };
