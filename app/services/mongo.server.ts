import { MongoClient, type Collection, type ObjectId, type WithId } from "mongodb";
import type { PushSubscriptionData } from "./backend.types";
import type { TimerStyleId } from "../timer-styles";

export type TimerDocument = {
  timerId: string;
  tokenHash: string;
  title: string;
  styleId?: TimerStyleId;
  variant?: string;
  duration: number;
  endAt: Date;
  status: "running" | "paused" | "finished" | "cancelled";
  subscription?: PushSubscriptionData;
  userId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  notifiedAt?: Date;
  pausedRemaining?: number;
};

export type UserDocument = {
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthChallengeDocument = {
  challengeId: string;
  purpose: "register" | "login";
  email: string;
  name?: string;
  userId?: ObjectId;
  codeHash: string;
  completionTokenHash?: string;
  attemptsRemaining: number;
  createdAt: Date;
  expiresAt: Date;
  verifiedAt?: Date;
};

export type SessionDocument = {
  sessionId: string;
  data: { userId?: string };
  expiresAt: Date;
};

declare global {
  var __carrotMongoClient: MongoClient | undefined;
  var __carrotMongoIndexes: Promise<void> | undefined;
  var __carrotAuthIndexes: Promise<void> | undefined;
}

function getDatabase() {
  return getMongoClient().db(process.env.MONGODB_DB || "carrot_timer");
}

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.__carrotMongoClient) global.__carrotMongoClient = new MongoClient(uri, {
    connectTimeoutMS: 1_500,
    serverSelectionTimeoutMS: 1_500,
  });
  return global.__carrotMongoClient;
}

export async function pingDatabase() {
  await getDatabase().command({ ping: 1 });
}

export async function getTimersCollection(): Promise<Collection<TimerDocument>> {
  const collection = getDatabase().collection<TimerDocument>("timers");

  global.__carrotMongoIndexes ??= Promise.all([
    collection.createIndex({ timerId: 1 }, { unique: true }),
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collection.createIndex({ status: 1, endAt: 1 }),
    collection.createIndex({ userId: 1, createdAt: -1 }),
  ]).then(() => undefined);
  await global.__carrotMongoIndexes;
  return collection;
}

export async function getUsersCollection() {
  const database = getDatabase();
  const users = database.collection<UserDocument>("users");
  const sessions = database.collection<SessionDocument>("sessions");
  const challenges = database.collection<AuthChallengeDocument>("auth_challenges");
  global.__carrotAuthIndexes ??= Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ sessionId: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    challenges.createIndex({ challengeId: 1 }, { unique: true }),
    challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    challenges.createIndex({ email: 1, purpose: 1, createdAt: -1 }),
  ]).then(() => undefined);
  await global.__carrotAuthIndexes;
  return users;
}

export async function getAuthChallengesCollection() {
  await getUsersCollection();
  return getDatabase().collection<AuthChallengeDocument>("auth_challenges");
}

export async function getSessionsCollection() {
  await getUsersCollection();
  return getDatabase().collection<SessionDocument>("sessions");
}

export type StoredTimerDocument = WithId<TimerDocument>;
