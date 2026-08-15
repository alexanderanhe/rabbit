import { data } from "react-router";
import type { Route } from "./+types/api.timer";
import { getTimersCollection } from "../services/mongo.server";
import { cancelTimerJob, scheduleTimerJob } from "../services/queue.server";
import { readBearerToken, timerTokenMatches } from "../services/timer-auth.server";
import { getUserId } from "../services/auth.server";
import { DEFAULT_TIMER_STYLE } from "../timer-styles";

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return data({ error: "Not found" }, { status: 404 });
  const timer = await (await getTimersCollection()).findOne({ timerId: params.timerId, userId });
  if (!timer) return data({ error: "Not found" }, { status: 404 });
  const remaining = timer.status === "running" ? Math.max(0, Math.ceil((timer.endAt.getTime() - Date.now()) / 1000)) : timer.status === "paused" ? timer.pausedRemaining || 0 : 0;
  return {
    id: timer.timerId, title: timer.title, styleId: timer.styleId || DEFAULT_TIMER_STYLE, duration: timer.duration,
    remaining, endAt: timer.endAt.getTime(), status: remaining === 0 ? "finished" : timer.status,
    createdAt: timer.createdAt.getTime(),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const collection = await getTimersCollection();
  const timer = await collection.findOne({ timerId: params.timerId });
  const token = readBearerToken(request);
  const userId = await getUserId(request);
  const ownsTimer = Boolean(userId && timer?.userId?.equals(userId));
  if (!timer || (!ownsTimer && (!token || !timerTokenMatches(token, timer.tokenHash)))) return data({ error: "Not found" }, { status: 404 });

  if (request.method === "DELETE") {
    await collection.updateOne({ timerId: params.timerId }, { $set: { status: "cancelled", updatedAt: new Date() } });
    await cancelTimerJob(params.timerId);
    return { ok: true };
  }

  if (request.method !== "PUT") return data({ error: "Method not allowed" }, { status: 405 });
  const payload = await request.json() as { status?: "running" | "paused"; endAt?: number; remaining?: number };
  if (payload.status === "paused") {
    await collection.updateOne({ timerId: params.timerId }, { $set: { status: "paused", pausedRemaining: Math.max(0, Number(payload.remaining) || 0), updatedAt: new Date() } });
    await cancelTimerJob(params.timerId);
    return { ok: true };
  }
  if (payload.status !== "running" || !payload.endAt) return data({ error: "Invalid timer state" }, { status: 400 });
  const endAt = new Date(payload.endAt);
  await collection.updateOne({ timerId: params.timerId }, {
    $set: { status: "running", endAt, updatedAt: new Date(), ...(!ownsTimer ? { expiresAt: new Date(endAt.getTime() + 7 * 24 * 60 * 60 * 1000) } : {}) },
    $unset: { notifiedAt: "", pausedRemaining: "", ...(ownsTimer ? { expiresAt: "" } : {}) },
  });
  await scheduleTimerJob(params.timerId, endAt);
  return { ok: true };
}
