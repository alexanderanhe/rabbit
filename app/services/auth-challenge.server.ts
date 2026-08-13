import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { ObjectId } from "mongodb";
import { getAuthChallengesCollection } from "./mongo.server";

const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function digest(value: string) {
  return createHash("sha256").update(`${process.env.SESSION_SECRET || "development-only-change-me"}:${value}`).digest("hex");
}

function matches(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createAuthChallenge(params: { purpose: "register" | "login"; email: string; name?: string; userId?: ObjectId }) {
  const collection = await getAuthChallengesCollection();
  const recent = await collection.findOne({ email: params.email, purpose: params.purpose, createdAt: { $gt: new Date(Date.now() - SEND_COOLDOWN_MS) } });
  if (recent) return { ok: false as const, retryAfterSeconds: Math.max(1, Math.ceil((recent.createdAt.getTime() + SEND_COOLDOWN_MS - Date.now()) / 1000)) };

  const challengeId = nanoid(40);
  const code = String(randomInt(100_000, 1_000_000));
  const now = new Date();
  await collection.insertOne({
    challengeId,
    purpose: params.purpose,
    email: params.email,
    name: params.name,
    userId: params.userId,
    codeHash: digest(`${challengeId}:${code}`),
    attemptsRemaining: MAX_ATTEMPTS,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  return { ok: true as const, challengeId, code };
}

export async function verifyAuthCode(challengeId: string, code: string, purpose: "register" | "login") {
  const collection = await getAuthChallengesCollection();
  const challenge = await collection.findOne({ challengeId, purpose, expiresAt: { $gt: new Date() }, attemptsRemaining: { $gt: 0 }, verifiedAt: { $exists: false } });
  if (!challenge || !/^\d{6}$/.test(code) || !matches(challenge.codeHash, digest(`${challengeId}:${code}`))) {
    if (challenge) await collection.updateOne({ _id: challenge._id, verifiedAt: { $exists: false } }, { $inc: { attemptsRemaining: -1 } });
    return null;
  }
  const completionToken = nanoid(48);
  const verifiedAt = new Date();
  await collection.updateOne({ _id: challenge._id, verifiedAt: { $exists: false } }, { $set: { verifiedAt, completionTokenHash: digest(`${challengeId}:${completionToken}`) } });
  return { challenge, completionToken };
}

export async function consumeRegistrationChallenge(challengeId: string, completionToken: string) {
  const collection = await getAuthChallengesCollection();
  const challenge = await collection.findOne({ challengeId, purpose: "register", expiresAt: { $gt: new Date() }, verifiedAt: { $exists: true } });
  if (!challenge?.completionTokenHash || !matches(challenge.completionTokenHash, digest(`${challengeId}:${completionToken}`))) return null;
  await collection.deleteOne({ _id: challenge._id });
  return challenge;
}

export async function consumeLoginChallenge(challengeId: string, completionToken: string) {
  const collection = await getAuthChallengesCollection();
  const challenge = await collection.findOne({ challengeId, purpose: "login", expiresAt: { $gt: new Date() }, verifiedAt: { $exists: true } });
  if (!challenge?.completionTokenHash || !matches(challenge.completionTokenHash, digest(`${challengeId}:${completionToken}`))) return null;
  await collection.deleteOne({ _id: challenge._id });
  return challenge;
}
