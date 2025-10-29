import { MongoClient, Db, Collection } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "app";

export const getDb = async (): Promise<Db> => {
  if (db) return db;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!client) {
    client = new MongoClient(uri, {});
    await client.connect();
  }
  db = client.db(dbName);
  return db;
};

export const getCollection = async <T extends import("mongodb").Document = import("mongodb").Document>(
  name: string,
): Promise<Collection<T>> => {
  const database = await getDb();
  return database.collection<T>(name);
};
