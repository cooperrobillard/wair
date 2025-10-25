import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { copyRemoteImageToSupabase } from "@/lib/image-ingest";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Item id required" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const targetPath = `original/${clerkId}/${item.id}.png`;
    const { publicUrl } = await copyRemoteImageToSupabase({
      remoteUrl: imageUrl,
      bucket: "items",
      targetPath,
    });

    await prisma.item.update({
      where: { id: item.id },
      data: { originalUrl: publicUrl },
    });

    return NextResponse.json({ ok: true, originalUrl: publicUrl });
  } catch (error) {
    console.error("[upload-remote] unexpected", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
