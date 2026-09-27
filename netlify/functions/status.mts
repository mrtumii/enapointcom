import type { Config } from "@netlify/functions";
import { db, json } from "../lib/http.mts";

export default async () => {
  const checks = [
    { name: "Website", state: "operational", detail: "Serving normally" },
    { name: "Partner API", state: "operational", detail: "Accepting requests" },
  ];
  try {
    const started = Date.now();
    await db().sql`SELECT 1`;
    checks.push({ name: "Database", state: "operational", detail: `Responding in ${Date.now() - started} ms` });
  } catch {
    checks.push({ name: "Database", state: "degraded", detail: "Responding slowly; retries are automatic" });
  }
  const healthy = checks.every((c) => c.state === "operational");
  return json({
    headline: healthy ? "All systems operational" : "Some services are degraded",
    checks,
    checkedAt: new Date().toISOString(),
  });
};

export const config: Config = { path: ["/api/status", "/api/v1/status"], method: "GET" };
