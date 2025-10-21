// src/app/api/items/[id]/clean/route.ts
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing REMOVE_BG_API_KEY" },
        { status: 500 }
      );
    }

    // Ensure item belongs to current user
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const { id } = await context.params;

    const item = await prisma.item.findFirst({
      where: { id, userId: user.id },
      select: { id: true, imageUrl: true, originalUrl: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const sourceImageUrl = item.originalUrl ?? item.imageUrl;
    if (!sourceImageUrl) {
      return NextResponse.json(
        { error: "No image URL to process" },
        { status: 400 }
      );
    }

    // Call remove.bg
    const form = new FormData();
    form.append("image_url", sourceImageUrl);
    form.append("size", "auto");
    form.append("format", "png");

    const resp = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: "remove.bg failed", status: resp.status, body: text },
        { status: 502 }
      );
    }

    const bytes = new Uint8Array(await resp.arrayBuffer());
    const fileBuffer = Buffer.from(bytes);

    // Upload cleaned PNG to Supabase Storage
    const cleanPath = `clean/${clerkId}/${item.id}.png`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("items")
      .upload(cleanPath, fileBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`;
    const cleanPublicUrl = `${publicBase}/${cleanPath}`;

    // Update DB: point imageUrl at cleaned image; preserve originalUrl if missing
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: {
        imageUrl: cleanPublicUrl,
        ...(item.originalUrl
          ? {}
          : item.imageUrl
          ? { originalUrl: item.imageUrl }
          : {}),
      },
      select: { id: true, imageUrl: true, originalUrl: true },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const err =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;
    console.error(err);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}
