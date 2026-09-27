import type { Config } from "@netlify/functions";
import { adminConfigured, clearedCookie, isAdmin, passwordMatches, sessionCookie } from "../lib/auth.mts";
import { fail, readBody, text } from "../lib/http.mts";

const reply = (data: unknown, status = 200, cookie?: string) => {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (cookie) headers["set-cookie"] = cookie;
  return Response.json(data, { status, headers });
};

export default async (req: Request) => {
  if (req.method === "GET") return reply({ authenticated: isAdmin(req), configured: adminConfigured() });
  if (req.method === "DELETE") return reply({ authenticated: false, configured: adminConfigured() }, 200, clearedCookie());

  if (!adminConfigured()) return fail("The console password hasn't been set up for this site yet.", 503);
  const body = await readBody(req);
  const password = text(body?.password, 200);
  if (!password) return fail("Please enter the console password.");
  if (!passwordMatches(password)) {
    // A short pause makes guessing slow without inconveniencing staff.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fail("That password isn't right. Please try again.", 401);
  }
  return reply({ authenticated: true, configured: true }, 200, sessionCookie());
};

export const config: Config = { path: "/api/admin/session", method: ["GET", "POST", "DELETE"] };
