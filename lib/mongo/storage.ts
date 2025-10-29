import { GridFSBucket, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { Readable } from "stream";

export const getBucket = async () => {
  const db = await getDb();
  return new GridFSBucket(db, { bucketName: "files" });
};

export const uploadToGridFS = async (
  buffer: Buffer,
  filename: string,
  contentType?: string,
): Promise<string> => {
  const bucket = await getBucket();
  return await new Promise((resolve, reject) => {
    const readable = Readable.from(buffer);
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata: { contentType },
    });
    uploadStream.on("error", (err) => reject(err));
    uploadStream.on("finish", () => {
      const id: ObjectId | undefined = (uploadStream as any).id as
        | ObjectId
        | undefined;
      resolve(id?.toString() || "");
    });
    readable.pipe(uploadStream);
  });
};

export const deleteFromGridFS = async (id: string) => {
  const bucket = await getBucket();
  await bucket.delete(new ObjectId(id));
};
