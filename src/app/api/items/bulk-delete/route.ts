import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildStoragePaths } from "@/lib/storage-paths";

const MAX_BULK_DELETE = 50;

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const idsInput: unknown = body?.ids;
  if (!Array.isArray(idsInput)) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const uniqueIds = Array.from(
    new Set(
      idsInput
        .filter((val): val is string => typeof val === "string" && val.trim().length > 0)
        .map((val) => val.trim())
    )
  );

  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: "No valid ids provided" }, { status: 400 });
  }
  if (uniqueIds.length > MAX_BULK_DELETE) {
    return NextResponse.json(
      { error: `Too many ids; maximum ${MAX_BULK_DELETE}` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { userId: user.id, id: { in: uniqueIds } },
    select: { id: true, imageUrl: true, originalUrl: true },
  });

  if (items.length === 0) {
    return NextResponse.json({ ok: true, deletedIds: [], missingIds: uniqueIds });
  }

  const existingIds = items.map((item) => item.id);
  const missingIds = uniqueIds.filter((id) => !existingIds.includes(id));

  await prisma.item.deleteMany({
    where: { userId: user.id, id: { in: existingIds } },
  });

  const storageKeySet = new Set<string>();
  for (const item of items) {
    const paths = buildStoragePaths({
      clerkId,
      itemId: item.id,
      imageUrl: item.imageUrl,
      originalUrl: item.originalUrl,
    });
    for (const path of paths) {
      storageKeySet.add(path);
    }
  }

  const storageKeys = Array.from(storageKeySet);

  let storageError: string | null = null;
  if (storageKeys.length > 0) {
    const { error } = await supabaseAdmin.storage.from("items").remove(storageKeys);
    if (error) {
      storageError = error.message ?? "Failed to remove storage objects";
      console.error("[bulk-delete] storage remove failed", error);
    }
  }

  return NextResponse.json({
    ok: true,
    deletedIds: existingIds,
    missingIds,
    storageError,
  });
}
