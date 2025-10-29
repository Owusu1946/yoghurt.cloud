import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongo/client";

export interface UserDoc {
  _id?: ObjectId;
  fullName: string;
  email: string;
  avatar: string;
  passwordHash: string;
  accountId: string; // duplicate id for compatibility with UI
}

let indexesEnsured = false;
const ensureUsersIndexes = async () => {
  if (indexesEnsured) return;
  const col = await getCollection<UserDoc>("users");
  try {
    const s = performance.now();
    await col.createIndex({ email: 1 }, { unique: true, name: "uniq_email" });
    indexesEnsured = true;
    const d = performance.now() - s;
    console.log("users.ensureIndexes", `${d.toFixed(3)}ms`);
  } catch (e) {
    console.log("users.ensureIndexes: skipped or failed", e);
  }
};

export const usersCollection = async () => {
  await ensureUsersIndexes();
  return getCollection<UserDoc>("users");
};

export const findUserByEmail = async (email: string) => {
  const s = performance.now();
  const col = await usersCollection();
  const doc = await col.findOne({ email });
  const d = performance.now() - s;
  console.log("users.findByEmail", `${Math.round(d)}ms`);
  console.log("users.findByEmail.result", { found: !!doc, email });
  return doc;
};

export const findUserById = async (id: string) => {
  const s = performance.now();
  const col = await usersCollection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  const d = performance.now() - s;
  console.log("users.findById", `${Math.round(d)}ms`);
  console.log("users.findById.result", { found: !!doc, id });
  return doc;
};

export const createUser = async (data: Omit<UserDoc, "_id" | "accountId">) => {
  const s = performance.now();
  const col = await usersCollection();
  const result = await col.insertOne({ ...data, accountId: "" });
  const id = result.insertedId.toString();
  await col.updateOne({ _id: result.insertedId }, { $set: { accountId: id } });
  const d = performance.now() - s;
  console.log("users.create", `${Math.round(d)}ms`);
  console.log("users.create.result", { id, email: data.email });
  return id;
};
