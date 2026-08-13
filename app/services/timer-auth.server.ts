import { createHash, timingSafeEqual } from "node:crypto";

export function hashTimerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function timerTokenMatches(token: string, storedHash: string) {
  const received = Buffer.from(hashTimerToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return received.length === stored.length && timingSafeEqual(received, stored);
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}
