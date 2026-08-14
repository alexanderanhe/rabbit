import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ObjectId } from "mongodb";
import { createCookieSessionStorage, redirect } from "react-router";
import { getUsersCollection } from "./mongo.server";

const scrypt = promisify(scryptCallback);
// Browsers commonly cap persistent cookies at roughly 400 days. Use that full
// window so trusted devices stay signed in without creating immortal sessions.
const SESSION_MAX_AGE = 60 * 60 * 24 * 400;
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production");
}

const sessionStorage = createCookieSessionStorage<{ userId: string }>({
  cookie: {
    name: "__rabbit_auth",
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.SESSION_SECRET || "development-only-change-me"],
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, hashHex] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getUserId(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const value = session.get("userId");
  return value && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (!userId) throw redirect("/account");
  return userId;
}

export async function getCurrentUser(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return null;
  const user = await (await getUsersCollection()).findOne({ _id: userId }, { projection: { name: 1, email: 1 } });
  return user ? { id: user._id.toHexString(), name: user.name, email: user.email } : null;
}
