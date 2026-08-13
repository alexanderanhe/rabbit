import { data } from "react-router";
import type { Route } from "./+types/api.timers";
import type { RemoteTimerPayload } from "../services/backend.types";
import { getTimersCollection } from "../services/mongo.server";
import { scheduleTimerJob } from "../services/queue.server";
import { hashTimerToken } from "../services/timer-auth.server";

function isValidPayload(value: Partial<RemoteTimerPayload>): value is RemoteTimerPayload {
  return Boolean(
    value.id && value.token && value.title && value.duration && value.endAt &&
    value.subscription?.endpoint && value.subscription.keys?.auth && value.subscription.keys?.p256dh,
  );
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const payload = await request.json() as Partial<RemoteTimerPayload>;
  if (!isValidPayload(payload)) return data({ error: "Invalid timer" }, { status: 400 });
  const endAt = new Date(payload.endAt);
  if (!Number.isFinite(endAt.getTime())) return data({ error: "Invalid endAt" }, { status: 400 });

  const now = new Date();
  const collection = await getTimersCollection();
  await collection.updateOne(
    { timerId: payload.id },
    {
      $set: {
        tokenHash: hashTimerToken(payload.token),
        title: payload.title.slice(0, 48),
        duration: payload.duration,
        endAt,
        status: "running",
        subscription: payload.subscription,
        updatedAt: now,
        expiresAt: new Date(endAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      $setOnInsert: { timerId: payload.id, createdAt: now },
      $unset: { notifiedAt: "" },
    },
    { upsert: true },
  );
  await scheduleTimerJob(payload.id, endAt);
  return data({ ok: true }, { status: 201 });
}
