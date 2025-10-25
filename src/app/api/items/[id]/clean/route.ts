// src/app/api/items/[id]/clean/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { cleanItemBackground } from "@/lib/clean-item";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.REMOVE_BG_API_KEY!;
    if (!apiKey) return NextResponse.json({ error: "Missing REMOVE_BG_API_KEY" }, { status: 500 });

    const { id } = await ctx.params;

    const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`;
    const result = await cleanItemBackground({
      itemId: id,
      clerkId,
      apiKey,
      publicBase,
    });

    if (!result.ok) {
      let fallbackUrl = result.originalUrl ?? null;
      if (!fallbackUrl) {
        const existing = await prisma.item.findFirst({
          where: { id, user: { clerkId } },
          select: { originalUrl: true, imageUrl: true },
        });
        fallbackUrl = existing?.originalUrl ?? existing?.imageUrl ?? null;
      }

      if (fallbackUrl) {
        await prisma.item.updateMany({
          where: { id, user: { clerkId } },
          data: {
            imageUrl: fallbackUrl,
            ...(result.reason === "NO_CREDITS" ? { originalUrl: fallbackUrl } : {}),
          },
        });
      }

      if (result.reason === "NO_CREDITS") {
        return NextResponse.json({
          ok: true,
          cleaned: false,
          imageUrl: fallbackUrl,
          message: "No remove.bg credits; using original image.",
        });
      }
      return NextResponse.json({
        ok: true,
        cleaned: false,
        imageUrl: fallbackUrl,
      });
    }

    return NextResponse.json({ ok: true, imageUrl: result.cleanedUrl, cleaned: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
