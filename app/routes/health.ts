import { createHealthResponse } from "../services/health.server";
import { pingDatabase } from "../services/mongo.server";
import { getTimerQueue } from "../services/queue.server";

async function pingQueue() {
  await getTimerQueue().waitUntilReady();
}

export function loader() {
  return createHealthResponse({ database: pingDatabase, queue: pingQueue });
}
