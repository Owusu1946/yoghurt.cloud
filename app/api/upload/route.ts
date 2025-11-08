import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongo/client";
import { uploadWebStreamToGridFS } from "@/lib/mongo/storage";
import { getFileType } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { generateTagsForFile } from "@/lib/ai/gemini";

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
      isPublic: false,
      tags: [] as string[],
      bucketFileId: gridId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const col = await getCollection("files");
    const result = await col.insertOne(doc);

    try {
      revalidatePath(path);
    } catch {}

    // Fire-and-forget: generate tags with Gemini and update the document
    console.log('Upload API: Starting background tagging for', file.name);
    ;(async () => {
      try {
        console.log('Gemini: Checking API key...');
        if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
          console.log('Gemini tagging skipped: missing GOOGLE_API_KEY/GEMINI_API_KEY');
          return;
        }
        console.log('Gemini: API key found, calling generateTagsForFile...');
        const tags = await generateTagsForFile({
          name: file.name,
          type,
          extension,
          contentType: (file as any).type,
          size: file.size,
        });
        console.log('Gemini: Received tags', { tags, isArray: Array.isArray(tags), length: tags?.length });
        if (Array.isArray(tags) && tags.length) {
          await col.updateOne({ _id: result.insertedId }, { $set: { tags, updatedAt: new Date() } });
          console.log('Gemini tagging success', { fileId: result.insertedId.toString(), name: file.name, tags });
          try { revalidatePath(path); } catch {}
        } else {
          console.log('Gemini: No tags returned or empty array');
        }
      } catch (err) {
        console.log('Gemini tagging failed', err);
      }
    })();

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
