// src/app/api/items/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildStoragePaths } from "@/lib/storage-paths";
import { normalizeMultiColor, normalizeToCanonArticle } from "@/lib/normalize";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // <-- Next 15 expects Promise here
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : undefined;
  const originalUrl =
    typeof body?.originalUrl === "string" ? body.originalUrl.trim() : undefined;
  const rawInput =
    typeof body?.rawInput === "string" ? body.rawInput.trim() : undefined;
  const articleType =
    typeof body?.articleType === "string" ? body.articleType.trim() : undefined;
  const colorRaw = typeof body?.colorRaw === "string" ? body.colorRaw.trim() : undefined;
  const brand = typeof body?.brand === "string" ? body.brand.trim() : undefined;
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;

  if (
    imageUrl === undefined &&
    originalUrl === undefined &&
    rawInput === undefined &&
    articleType === undefined &&
    colorRaw === undefined &&
    brand === undefined &&
    name === undefined
  ) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 }
    );
  }

  // await the params
  const { id } = await context.params;

  // Ownership check
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  const data: Record<string, string | null> = {};
  if (imageUrl) data.imageUrl = imageUrl;
  if (originalUrl) data.originalUrl = originalUrl;
  if (rawInput !== undefined) data.rawInput = rawInput;
  if (articleType !== undefined) {
    const canonicalArticle = articleType ? normalizeToCanonArticle(articleType) : null;
    data.articleType = canonicalArticle ?? null;
  }
  if (colorRaw !== undefined) {
    const canonicalColor = colorRaw ? normalizeMultiColor(colorRaw) : null;
    data.colorRaw = canonicalColor ?? null;
  }
  if (brand !== undefined) data.brand = brand || null;
  if (name !== undefined) data.name = name || null;

  const updated = await prisma.item.updateMany({
    where: { id, userId: user.id },
    data,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  const existing = await prisma.item.findFirst({
    where: { id, userId: user.id },
    select: { id: true, imageUrl: true, originalUrl: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.item.delete({ where: { id: existing.id } });

  const storageKeys = buildStoragePaths({
    clerkId,
    itemId: existing.id,
    imageUrl: existing.imageUrl,
    originalUrl: existing.originalUrl,
  });

  if (storageKeys.length > 0) {
    const { error: removeError } = await supabaseAdmin.storage
      .from("items")
      .remove(storageKeys);
    if (removeError) {
      console.error("[DELETE /api/items/:id] failed to remove storage objects", removeError);
    }
  }

  return NextResponse.json({ ok: true });
}
