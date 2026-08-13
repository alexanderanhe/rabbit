import { Queue } from "bullmq";

export const TIMER_QUEUE_NAME = "carrot-timer-notifications";

declare global {
  var __carrotTimerQueue: Queue | undefined;
}

export function getRedisConnection() {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("REDIS_URL is not configured");
  const url = new URL(value);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isFinite(database) ? database : 0,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function getTimerQueue() {
  global.__carrotTimerQueue ??= new Queue(TIMER_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    },
  });
  return global.__carrotTimerQueue;
}

export async function scheduleTimerJob(timerId: string, endAt: Date) {
  const queue = getTimerQueue();
  const jobId = `timer-${timerId}`;
  const existing = await queue.getJob(jobId);
  if (existing) await existing.remove().catch(() => undefined);
  await queue.add("timer-finished", { timerId }, {
    jobId,
    delay: Math.max(0, endAt.getTime() - Date.now()),
  });
}

export async function cancelTimerJob(timerId: string) {
  const job = await getTimerQueue().getJob(`timer-${timerId}`);
  if (job) await job.remove().catch(() => undefined);
}
