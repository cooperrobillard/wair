import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanItemBackground } from "@/lib/clean-item";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const { id } = await params;
    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const contentType = file.type || "image/png";

    const targetPath = `original/${clerkId}/${item.id}.png`;
    const { error } = await supabaseAdmin.storage.from("items").upload(targetPath, bytes, {
      contentType,
      upsert: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`;
    const originalUrl = `${publicBase}/${targetPath}`;

    await prisma.item.update({
      where: { id: item.id },
      data: { originalUrl },
    });

    const apiKey = process.env.REMOVE_BG_API_KEY!;
    const cleanResult = await cleanItemBackground({
      itemId: item.id,
      clerkId,
      apiKey,
      publicBase,
    });

    if (!cleanResult.ok) {
      if (cleanResult.reason === "NO_CREDITS") {
        await prisma.item.update({
          where: { id: item.id },
          data: {
            imageUrl: originalUrl,
            originalUrl,
          },
        });
        return NextResponse.json({
          ok: true,
          originalUrl,
          imageUrl: originalUrl,
          cleaned: false,
          message: "No remove.bg credits; using original image.",
        });
      }
      await prisma.item.update({
        where: { id: item.id },
        data: {
          imageUrl: originalUrl,
        },
      });
      return NextResponse.json({
        ok: true,
        originalUrl,
        imageUrl: originalUrl,
        cleaned: false,
      });
    }

    return NextResponse.json({
      ok: true,
      originalUrl,
      imageUrl: cleanResult.cleanedUrl,
      cleaned: true,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
