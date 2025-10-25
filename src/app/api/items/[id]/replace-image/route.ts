import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { copyRemoteImageToSupabase } from "@/lib/image-ingest";
import { prisma } from "@/lib/db";
import { cleanItemBackground } from "@/lib/clean-item";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const { imageUrl } = await req.json().catch(() => ({}));
    if (typeof imageUrl !== "string" || !/^https?:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

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

    const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`;
    const apiKey = process.env.REMOVE_BG_API_KEY!;
    const cleanedResult = await cleanItemBackground({
      itemId: item.id,
      clerkId,
      apiKey,
      publicBase,
    });

    if (!cleanedResult.ok) {
      if (cleanedResult.reason === "NO_CREDITS") {
        const fallbackUrl = cleanedResult.originalUrl ?? publicUrl;
        await prisma.item.update({
          where: { id: item.id },
          data: {
            imageUrl: fallbackUrl,
            originalUrl: fallbackUrl,
          },
        });
        return NextResponse.json({
          ok: true,
          originalUrl: fallbackUrl,
          imageUrl: fallbackUrl,
          cleaned: false,
          message: "No remove.bg credits; using original image.",
        });
      }
      const fallbackUrl = cleanedResult.originalUrl ?? publicUrl;
      await prisma.item.update({
        where: { id: item.id },
        data: {
          imageUrl: fallbackUrl,
          ...(fallbackUrl ? { originalUrl: fallbackUrl } : {}),
        },
      });
      return NextResponse.json({
        ok: true,
        originalUrl: fallbackUrl,
        imageUrl: fallbackUrl,
        cleaned: false,
      });
    }

    return NextResponse.json({
      ok: true,
      originalUrl: publicUrl,
      imageUrl: cleanedResult.cleanedUrl,
      cleaned: true,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
