import type { Config } from "@netlify/functions";
import { db, fail, isEmail, json, looksAutomated, readBody, text } from "../lib/http.mts";

const TOPICS = new Set(["sales", "installation", "partnerships", "operators", "api", "support", "lab", "government", "banking", "general"]);

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return fail("Please fill in the form and try again.");
  // Automated submissions get the same reply as real ones, but nothing is stored.
  const reply = "Thank you — your message has been sent. We reply within one working day.";
  if (looksAutomated(body)) return json({ ok: true, reply });

  const name = text(body.name, 120);
  const email = text(body.email, 200);
  const message = text(body.message, 5000);
  if (!name) return fail("Please tell us your name.");
  if (!isEmail(email)) return fail("Please enter a valid email address.");
  if (!message) return fail("Please add a short message so we know how to help.");
  const topic = TOPICS.has(text(body.topic)) ? text(body.topic) : "general";

  await db().sql`
    INSERT INTO contact_messages (topic, name, company, email, phone, message)
    VALUES (${topic}, ${name}, ${text(body.company, 200)}, ${email}, ${text(body.phone, 40)}, ${message})`;
  return json({ ok: true, reply }, 201);
};

export const config: Config = { path: ["/api/contact", "/api/v1/contact"], method: "POST" };
