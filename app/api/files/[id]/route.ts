import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getBucket } from "@/lib/mongo/storage";
import { getCollection } from "@/lib/mongo/client";
import { getCurrentUser } from "@/lib/actions/user.actions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return new Response("Bad Request", { status: 400 });

  try {
    const col = await getCollection("files");
    const doc = await col.findOne({ bucketFileId: id } as any);
    const user = await getCurrentUser();
    const email = user?.email;
    const owner = (doc?.owner as any)?.toString?.();
    const userCan = !!doc?.isPublic || (!!user && (owner === user?.$id || (doc?.users || []).includes(email)));
    if (!userCan) return new Response("Forbidden", { status: 403 });

    const bucket = await getBucket();
    const _id = new ObjectId(id);

    const files = await bucket.find({ _id }).toArray();
    const file = files?.[0];
    if (!file) return new Response("Not Found", { status: 404 });

    const nodeStream = bucket.openDownloadStream(_id);

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err: unknown) => controller.error(err));
      },
      cancel() {
        try {
          nodeStream.destroy();
        } catch {}
      },
    });

    const headers = new Headers();
    const contentType = (file as any).contentType || file?.metadata?.contentType || "application/octet-stream";
    headers.set("Content-Type", contentType);
    if (typeof (file as any).length === "number") headers.set("Content-Length", String((file as any).length));
    const uploaded: Date | undefined = (file as any).uploadDate;
    headers.set("Last-Modified", uploaded ? uploaded.toUTCString() : new Date().toUTCString());
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(readable, { status: 200, headers });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
