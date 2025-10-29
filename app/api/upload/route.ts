import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongo/client";
import { uploadToGridFS } from "@/lib/mongo/storage";
import { getFileType } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const ownerId = form.get("ownerId");
    const accountId = form.get("accountId");
    const path = (form.get("path") as string) || "/";

    if (!(file instanceof File)) return new Response("Bad Request", { status: 400 });
    if (typeof ownerId !== "string" || typeof accountId !== "string")
      return new Response("Bad Request", { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const gridId = await uploadToGridFS(buffer, file.name, (file as any).type);

    const { type, extension } = getFileType(file.name);
    const doc = {
      type,
      name: file.name,
      url: `/api/files/${gridId}`,
      extension,
      size: file.size,
      owner: new ObjectId(ownerId),
      accountId,
      users: [] as string[],
      bucketFileId: gridId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const col = await getCollection("files");
    const result = await col.insertOne(doc);

    try {
      revalidatePath(path);
    } catch {}

    return new Response(
      JSON.stringify({
        $id: result.insertedId.toString(),
        $createdAt: doc.createdAt.toISOString(),
        $updatedAt: doc.updatedAt.toISOString(),
        ...doc,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response("Upload failed", { status: 500 });
  }
}
