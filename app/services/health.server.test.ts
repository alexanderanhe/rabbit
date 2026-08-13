import assert from "node:assert/strict";
import test from "node:test";
import { createHealthResponse, type HealthPayload } from "./health.server";

const fixedOptions = {
  now: () => new Date("2026-08-13T12:00:00.000Z"),
  uptime: () => 12_345.9,
  service: "rabbit",
  timeoutMs: 50,
};

test("returns 200 JSON when required dependencies are available", async () => {
  const response = await createHealthResponse(
    { database: async () => undefined, queue: async () => undefined },
    fixedOptions,
  );
  const body = await response.json() as HealthPayload;

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.status, "ok");
  assert.equal(body.service, "rabbit");
  assert.equal(body.timestamp, "2026-08-13T12:00:00.000Z");
  assert.equal(body.uptimeSeconds, 12_345);
  assert.equal(body.checks.database.status, "ok");
});

test("returns 503 without exposing internal errors when MongoDB is unavailable", async () => {
  const response = await createHealthResponse(
    {
      database: async () => { throw new Error("mongodb://user:secret@internal-host/private"); },
      queue: async () => undefined,
    },
    fixedOptions,
  );
  const rawBody = await response.text();
  const body = JSON.parse(rawBody) as HealthPayload;

  assert.equal(response.status, 503);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.checks.database, { status: "error" });
  assert.doesNotMatch(rawBody, /secret|internal-host|mongodb:\/\//i);
});

test("returns 200 degraded when the optional queue is unavailable", async () => {
  const response = await createHealthResponse(
    { database: async () => undefined, queue: async () => { throw new Error("redis unavailable"); } },
    fixedOptions,
  );
  const body = await response.json() as HealthPayload;

  assert.equal(response.status, 200);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.checks.queue, { status: "error" });
});
