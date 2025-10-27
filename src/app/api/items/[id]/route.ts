// src/app/api/items/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildStoragePaths } from "@/lib/storage-paths";
import { normalizeMultiColor } from "@/lib/normalize";
import { normalizeArticleType } from "@/lib/normalizeArticle";
import { deriveColorStd, debugColor } from "@/lib/normalizeColor";

function parseStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return undefined;
}

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
  let rawInput: string | undefined;
  if (body?.rawInput === null) {
    rawInput = "";
  } else if (typeof body?.rawInput === "string") {
    rawInput = body.rawInput.trim();
  } else if (body?.rawInput !== undefined) {
    return NextResponse.json({ error: "rawInput must be a string" }, { status: 400 });
  }
  const articleType =
    typeof body?.articleType === "string" ? body.articleType.trim() : undefined;
  const colorValue = parseStringOrNull(body?.color);
  const colorRaw = parseStringOrNull(body?.colorRaw);
  const colorStdInput = parseStringOrNull(body?.colorStd);
  const brand = typeof body?.brand === "string" ? body.brand.trim() : undefined;
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const hasColorChange =
    colorValue !== undefined || colorRaw !== undefined || colorStdInput !== undefined;

  if (
    imageUrl === undefined &&
    originalUrl === undefined &&
    rawInput === undefined &&
    articleType === undefined &&
    !hasColorChange &&
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
    const canonicalArticle = articleType ? normalizeArticleType(articleType) : null;
    data.articleType = canonicalArticle ?? null;
  }
  if (hasColorChange) {
    const resolvedColorRaw = colorRaw !== undefined ? colorRaw : colorValue;
    if (resolvedColorRaw !== undefined) {
      const canonicalColor =
        resolvedColorRaw && resolvedColorRaw.length > 0
          ? normalizeMultiColor(resolvedColorRaw)
          : null;
      data.colorRaw = canonicalColor ?? resolvedColorRaw ?? null;
    }
    const deriveSource = colorStdInput === null ? null : colorValue ?? resolvedColorRaw ?? null;
    debugColor("deriveColorStd.input.update", {
      colorStdInput,
      colorFromBody: colorValue,
      colorRaw: resolvedColorRaw,
    });
    const derivedStd = deriveColorStd(colorStdInput, deriveSource ?? null);
    debugColor("deriveColorStd.output.update", { colorStd: derivedStd });
    data.colorStd = derivedStd ?? null;
    const warnSource =
      typeof colorStdInput === "string" && colorStdInput.length > 0
        ? colorStdInput
        : typeof deriveSource === "string"
        ? deriveSource
        : null;
    if (warnSource && !derivedStd) {
      console.warn("[items] color normalization returned null for:", warnSource);
    }
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
