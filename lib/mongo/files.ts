import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongo/client";

export interface FileDoc {
  _id?: ObjectId;
  type: string; // document | image | video | audio | other
  name: string;
  url: string;
  extension: string;
  size: number;
  owner: ObjectId; // user _id
  accountId: string; // for UI compatibility
  users: string[]; // shared with emails
  bucketFileId?: string; // compatibility (not used in Mongo path)
  createdAt: Date;
  updatedAt: Date;
}

let filesIndexesEnsured = false;
const ensureFilesIndexes = async () => {
  if (filesIndexesEnsured) return;
  const col = await getCollection<FileDoc>("files");
  await col.createIndex({ owner: 1, createdAt: -1 }, { name: "owner_createdAt" });
  await col.createIndex({ name: 1 }, { name: "name_text" });
  filesIndexesEnsured = true;
};

export const filesCollection = async () => {
  await ensureFilesIndexes();
  return getCollection<FileDoc>("files");
};

export const listUserFiles = async (params: {
  ownerId: string;
  ownerEmail: string;
  types: string[];
  searchText?: string;
  sort?: string; // field-order (e.g., "$createdAt-desc" or "name-asc")
  limit?: number;
}) => {
  const { ownerId, ownerEmail, types, searchText, sort = "$createdAt-desc", limit } = params;
  const col = await filesCollection();

  const filter: any = {
    $or: [{ owner: new ObjectId(ownerId) }, { users: ownerEmail }],
  };
  if (types && types.length > 0) filter.type = { $in: types };
  if (searchText) filter.name = { $regex: searchText, $options: "i" };

  let sortSpec: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort) {
    const [sortBy, orderBy] = sort.split("-");
    const map: any = { $createdAt: "createdAt" };
    const field = map[sortBy] || sortBy;
    sortSpec = { [field]: orderBy === "asc" ? 1 : -1 };
  }

  const cursor = col.find(filter).sort(sortSpec).limit(limit || 100);
  const docs = await cursor.toArray();
  const total = await col.countDocuments(filter);

  return { total, docs };
};

export const aggregateTotalsForUser = async (ownerId: string, ownerEmail: string) => {
  const col = await filesCollection();
  const match = {
    $or: [{ owner: new ObjectId(ownerId) }, { users: ownerEmail }],
  };
  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: "$type",
        size: { $sum: "$size" },
        latestDate: { $max: "$createdAt" },
      },
    },
  ];
  const rows = await col.aggregate(pipeline).toArray();
  const byType: Record<string, { size: number; latestDate: string }> = {};
  for (const r of rows) {
    byType[r._id] = {
      size: r.size || 0,
      latestDate: r.latestDate ? new Date(r.latestDate).toISOString() : "",
    };
  }
  const used = rows.reduce((acc, r) => acc + (r.size || 0), 0);
  return {
    image: byType.image || { size: 0, latestDate: "" },
    document: byType.document || { size: 0, latestDate: "" },
    video: byType.video || { size: 0, latestDate: "" },
    audio: byType.audio || { size: 0, latestDate: "" },
    other: byType.other || { size: 0, latestDate: "" },
    used,
    all: 600 * 1024 * 1024 * 1024,
  };
};
