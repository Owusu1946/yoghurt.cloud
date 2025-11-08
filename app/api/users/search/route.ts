import { NextRequest } from "next/server";
import { getCollection } from "@/lib/mongo/client";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return new Response(JSON.stringify({ users: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const col = await getCollection<any>('users');
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const cursor = col.find({ $or: [{ email: regex }, { fullName: regex }] }).limit(10).project({ email: 1, fullName: 1 });
    const users = await cursor.toArray();
    return new Response(JSON.stringify({ users }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ users: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
