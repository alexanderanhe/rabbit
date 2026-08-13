export type HealthCheck = { status: "ok"; latencyMs: number } | { status: "error" };

export type HealthPayload = {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: HealthCheck;
    queue: HealthCheck;
  };
};

type HealthDependencies = {
  database: () => Promise<void>;
  queue: () => Promise<void>;
};

type HealthOptions = {
  timeoutMs?: number;
  now?: () => Date;
  uptime?: () => number;
  service?: string;
};

async function runCheck(check: () => Promise<void>, timeoutMs: number): Promise<HealthCheck> {
  const startedAt = performance.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
      }),
    ]);
    return { status: "ok", latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  } catch {
    return { status: "error" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function createHealthResponse(dependencies: HealthDependencies, options: HealthOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const [database, queue] = await Promise.all([
    runCheck(dependencies.database, timeoutMs),
    runCheck(dependencies.queue, timeoutMs),
  ]);
  const databaseAvailable = database.status === "ok";
  const allAvailable = databaseAvailable && queue.status === "ok";
  const payload: HealthPayload = {
    status: allAvailable ? "ok" : "degraded",
    service: options.service || "rabbit",
    timestamp: (options.now || (() => new Date()))().toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((options.uptime || (() => process.uptime()))())),
    checks: { database, queue },
  };

  return new Response(JSON.stringify(payload), {
    status: databaseAvailable ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
