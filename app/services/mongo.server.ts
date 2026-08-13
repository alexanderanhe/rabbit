import { MongoClient, type Collection, type WithId, type Document } from "mongodb";
import type { PushSubscriptionData } from "./backend.types";

export type TimerDocument = {
  timerId: string;
  tokenHash: string;
  title: string;
  duration: number;
  endAt: Date;
  status: "running" | "paused" | "finished" | "cancelled";
  subscription: PushSubscriptionData;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  notifiedAt?: Date;
};

declare global {
  var __carrotMongoClient: MongoClient | undefined;
  var __carrotMongoIndexes: Promise<void> | undefined;
}

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.__carrotMongoClient) global.__carrotMongoClient = new MongoClient(uri);
  return global.__carrotMongoClient;
}

export async function getTimersCollection(): Promise<Collection<TimerDocument>> {
  const client = getMongoClient();
  const database = client.db(process.env.MONGODB_DB || "carrot_timer");
  const collection = database.collection<TimerDocument>("timers");

  global.__carrotMongoIndexes ??= Promise.all([
    collection.createIndex({ timerId: 1 }, { unique: true }),
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    collection.createIndex({ status: 1, endAt: 1 }),
  ]).then(() => undefined);
  await global.__carrotMongoIndexes;
  return collection;
}

export type StoredTimerDocument = WithId<TimerDocument>;
