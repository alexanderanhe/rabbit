import { data } from "react-router";
import type { Route } from "./+types/api.account-claim";
import { requireUserId } from "../services/auth.server";
import { getTimersCollection } from "../services/mongo.server";
import { hashTimerToken } from "../services/timer-auth.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const body = await request.json() as { timers?: Array<{ id?: string; token?: string }> };
  const timers = (body.timers || []).filter((timer): timer is { id: string; token: string } => Boolean(timer.id && timer.token)).slice(0, 100);
  if (!timers.length) return { ok: true, claimed: 0 };
  const collection = await getTimersCollection();
  const operations = timers.map((timer) => ({
    updateOne: {
      filter: { timerId: timer.id, tokenHash: hashTimerToken(timer.token) },
      update: { $set: { userId, updatedAt: new Date() }, $unset: { expiresAt: 1 as const } },
    },
  }));
  const result = await collection.bulkWrite(operations);
  return data({ ok: true, claimed: result.modifiedCount });
}
