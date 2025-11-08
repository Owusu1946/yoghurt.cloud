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

export const uploadWebStreamToGridFS = async (
  webStream: ReadableStream,
  filename: string,
  contentType?: string,
  opts?: { totalBytes?: number; onProgress?: (uploaded: number, percent: number) => void },
): Promise<string> => {
  const bucket = await getBucket();
  return await new Promise((resolve, reject) => {
    // Convert Web ReadableStream to Node.js Readable and pipe to GridFS
    const nodeStream = Readable.fromWeb(webStream as any);
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata: { contentType },
    });
    let uploaded = 0;
    let lastPercent = -1;
    if (opts?.totalBytes) {
      nodeStream.on('data', (chunk: Buffer) => {
        uploaded += chunk.length;
        const percent = Math.floor((uploaded / (opts.totalBytes as number)) * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          opts?.onProgress?.(uploaded, percent);
        }
      });
    }
    uploadStream.on("error", (err) => reject(err));
    uploadStream.on("finish", () => {
      const id: ObjectId | undefined = (uploadStream as any).id as
        | ObjectId
        | undefined;
      resolve(id?.toString() || "");
    });
    nodeStream.pipe(uploadStream);
  });
};

export const deleteFromGridFS = async (id: string) => {
  const bucket = await getBucket();
  await bucket.delete(new ObjectId(id));
};

export const getGridFileInfo = async (id: string) => {
  const bucket = await getBucket();
  const cursor = bucket.find({ _id: new ObjectId(id) } as any);
  const files = await cursor.toArray();
  const f = files?.[0] as any;
  if (!f) return null;
  return {
    filename: f.filename as string,
    length: f.length as number,
    uploadDate: f.uploadDate as Date,
    contentType: f.metadata?.contentType as string | undefined,
  };
};

export const openDownloadStream = async (id: string) => {
  const bucket = await getBucket();
  return bucket.openDownloadStream(new ObjectId(id));
};

export const readHeadFromGridFS = async (id: string, maxBytes: number): Promise<Buffer> => {
  const bucket = await getBucket();
  const stream = bucket.openDownloadStream(new ObjectId(id), { start: 0, end: Math.max(0, maxBytes - 1) } as any);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) {
        stream.destroy();
      }
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).subarray(0, maxBytes)));
    stream.on('close', () => resolve(Buffer.concat(chunks).subarray(0, maxBytes)));
    stream.on('error', reject);
  });
};
