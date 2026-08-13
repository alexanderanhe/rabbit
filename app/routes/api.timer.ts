import { data } from "react-router";
import type { Route } from "./+types/api.timer";
import { getTimersCollection } from "../services/mongo.server";
import { cancelTimerJob, scheduleTimerJob } from "../services/queue.server";
import { readBearerToken, timerTokenMatches } from "../services/timer-auth.server";

export async function action({ request, params }: Route.ActionArgs) {
  const token = readBearerToken(request);
  if (!token) return data({ error: "Unauthorized" }, { status: 401 });
  const collection = await getTimersCollection();
  const timer = await collection.findOne({ timerId: params.timerId });
  if (!timer || !timerTokenMatches(token, timer.tokenHash)) return data({ error: "Not found" }, { status: 404 });

  if (request.method === "DELETE") {
    await collection.updateOne({ timerId: params.timerId }, { $set: { status: "cancelled", updatedAt: new Date() } });
    await cancelTimerJob(params.timerId);
    return { ok: true };
  }

  if (request.method !== "PUT") return data({ error: "Method not allowed" }, { status: 405 });
  const payload = await request.json() as { status?: "running" | "paused"; endAt?: number };
  if (payload.status === "paused") {
    await collection.updateOne({ timerId: params.timerId }, { $set: { status: "paused", updatedAt: new Date() } });
    await cancelTimerJob(params.timerId);
    return { ok: true };
  }
  if (payload.status !== "running" || !payload.endAt) return data({ error: "Invalid timer state" }, { status: 400 });
  const endAt = new Date(payload.endAt);
  await collection.updateOne({ timerId: params.timerId }, {
    $set: { status: "running", endAt, updatedAt: new Date(), expiresAt: new Date(endAt.getTime() + 7 * 24 * 60 * 60 * 1000) },
    $unset: { notifiedAt: "" },
  });
  await scheduleTimerJob(params.timerId, endAt);
  return { ok: true };
}
