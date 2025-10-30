import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongo/client";
import { uploadWebStreamToGridFS } from "@/lib/mongo/storage";
import { getFileType } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large uploads

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('Upload API: Request received');
  try {
    const form = await req.formData();
    console.log(`Upload API: FormData parsed in ${Date.now() - startTime}ms`);
    
    const file = form.get("file");
    const ownerId = form.get("ownerId");
    const accountId = form.get("accountId");
    const path = (form.get("path") as string) || "/";

    if (!(file instanceof File)) return new Response("Bad Request", { status: 400 });
    if (typeof ownerId !== "string" || typeof accountId !== "string")
      return new Response("Bad Request", { status: 400 });

    console.log(`Upload API: Processing file ${file.name} (${file.size} bytes)`);
    // Stream the file directly to GridFS to avoid buffering large payloads in memory
    const gridId = await uploadWebStreamToGridFS(
      file.stream(),
      file.name,
      (file as any).type,
      {
        totalBytes: file.size,
        onProgress: (uploaded, percent) => {
          if (percent % 5 === 0) {
            console.log(`Upload API: ${file.name} ${percent}% (${uploaded}/${file.size})`);
          }
        },
      }
    );
    console.log(`Upload API: GridFS upload completed in ${Date.now() - startTime}ms`);

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
  } catch (e: any) {
    console.error('Upload API error:', e?.message || e);
    return new Response(`Upload failed: ${e?.message || 'Unknown error'}`.slice(0, 200), { status: 500 });
  }
}
