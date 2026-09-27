import type { Config } from "@netlify/functions";
import { actorName, guard } from "../lib/auth.mts";
import { db, fail, json, readBody, text } from "../lib/http.mts";
import { settle, type OrderRow } from "../lib/payments.mts";

// Settles an order recorded while card payments are off (provider "simulation"),
// once staff have taken payment another way. Test-mode API keys may also use it
// so partners can exercise the full flow without real money.
export default async (req: Request) => {
  const actor = await guard(req, "write");
  if (actor instanceof Response) return actor;
  if (actor.kind === "key" && actor.mode !== "test") return fail("Only test keys can settle simulated orders.", 403);

  const ref = text((await readBody(req))?.reference, 40);
  const [order] = ref ? await db().sql<OrderRow>`SELECT * FROM orders WHERE reference = ${ref} LIMIT 1` : [];
  if (!order) return fail("We couldn't find that order reference.", 404);
  if (order.provider !== "simulation") return fail("This order is paid through the card provider and settles automatically.", 409);
  if (order.status === "paid") return json({ ok: true, status: "paid", alreadySettled: true });
  if (order.status !== "pending") return fail(`This order is ${order.status} and can't be settled.`, 409);

  await settle(order, "simulation", { via: "simulate", by: actorName(actor) });
  return json({ ok: true, status: "paid" });
};

export const config: Config = { path: ["/api/payments/simulate", "/api/v1/payments/simulate"], method: "POST" };
