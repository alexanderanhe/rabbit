import { Worker } from "bullmq";
import webPush from "web-push";
import { getTimersCollection } from "../services/mongo.server";
import { getRedisConnection, scheduleTimerJob, TIMER_QUEUE_NAME } from "../services/queue.server";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

if (!publicKey || !privateKey || !subject) {
  throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required");
}

webPush.setVapidDetails(subject, publicKey, privateKey);

const ERROR_LOG_WINDOW_MS = 5 * 60 * 1000;
const errorWindows = new Map<string, { lastLoggedAt: number; suppressed: number }>();

function safeErrorName(error: unknown) {
  if (error instanceof Error) return error.name || "Error";
  return "UnknownError";
}

function logWorkerError(scope: string, error: unknown, jobId?: string) {
  const key = `${scope}:${safeErrorName(error)}`;
  const now = Date.now();
  const state = errorWindows.get(key);
  if (state && now - state.lastLoggedAt < ERROR_LOG_WINDOW_MS) {
    state.suppressed += 1;
    return;
  }
  const suppressed = state?.suppressed || 0;
  errorWindows.set(key, { lastLoggedAt: now, suppressed: 0 });
  // Deliberately omit stack traces and connection messages: they can contain
  // credentials and turn a Redis outage into gigabytes of duplicate output.
  console.error(JSON.stringify({
    level: "error",
    service: "rabbit-worker",
    event: scope,
    error: safeErrorName(error),
    ...(jobId ? { jobId } : {}),
    ...(suppressed ? { suppressed } : {}),
    timestamp: new Date(now).toISOString(),
  }));
}

const worker = new Worker<{ timerId: string }>(
  TIMER_QUEUE_NAME,
  async (job) => {
    const collection = await getTimersCollection();
    const timer = await collection.findOne({ timerId: job.data.timerId });
    if (!timer || timer.status !== "running" || timer.notifiedAt) return;

    if (timer.endAt.getTime() > Date.now() + 500) {
      await scheduleTimerJob(timer.timerId, timer.endAt);
      return;
    }

    if (!timer.subscription) {
      await collection.updateOne({ timerId: timer.timerId }, { $set: { status: "finished", updatedAt: new Date() } });
      return;
    }

    const payload = JSON.stringify({
      title: timer.title || "Timer",
      body: "Time’s up!",
      icon: "/images/icons/icon-192.png",
      badge: "/images/icons/icon-192.png",
      tag: `carrot-timer-${timer.timerId}`,
      url: `/timer/${timer.timerId}`,
    });

    try {
      await webPush.sendNotification(timer.subscription, payload, { TTL: 60 * 60, urgency: "high" });
      await collection.updateOne(
        { timerId: timer.timerId, notifiedAt: { $exists: false } },
        { $set: { status: "finished", notifiedAt: new Date(), updatedAt: new Date() } },
      );
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await collection.updateOne(
          { timerId: timer.timerId },
          { $set: { status: "finished", notifiedAt: new Date(), updatedAt: new Date() } },
        );
        return;
      }
      throw error;
    }
  },
  { connection: getRedisConnection(), concurrency: Number(process.env.PUSH_WORKER_CONCURRENCY || 10) },
);

worker.on("failed", (job, error) => logWorkerError("job_failed", error, job?.id));
worker.on("error", (error) => logWorkerError("worker_error", error));

async function shutdown() {
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(JSON.stringify({ level: "info", service: "rabbit-worker", event: "ready", queue: TIMER_QUEUE_NAME, timestamp: new Date().toISOString() }));
