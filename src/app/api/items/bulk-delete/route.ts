import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildStoragePaths } from "@/lib/storage-paths";
import type { BulkDeleteResponse } from "@/types/api";

const MAX_BULK_DELETE = 50;

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    const response: BulkDeleteResponse = { ok: false, error: "Unauthorized" };
    return NextResponse.json(response, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const idsInput: unknown = body?.ids;
  if (!Array.isArray(idsInput)) {
    const response: BulkDeleteResponse = { ok: false, error: "ids array required" };
    return NextResponse.json(response, { status: 400 });
  }

  const uniqueIds = Array.from(
    new Set(
      idsInput
        .filter((val): val is string => typeof val === "string" && val.trim().length > 0)
        .map((val) => val.trim())
    )
  );

  if (uniqueIds.length === 0) {
    const response: BulkDeleteResponse = { ok: false, error: "No valid ids provided" };
    return NextResponse.json(response, { status: 400 });
  }
  if (uniqueIds.length > MAX_BULK_DELETE) {
    const response: BulkDeleteResponse = {
      ok: false,
      error: `Too many ids; maximum ${MAX_BULK_DELETE}`,
    };
    return NextResponse.json(response, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    const response: BulkDeleteResponse = { ok: false, error: "No user" };
    return NextResponse.json(response, { status: 401 });
  }

  const items = await prisma.item.findMany({
    where: { userId: user.id, id: { in: uniqueIds } },
    select: { id: true, imageUrl: true, originalUrl: true },
  });

  if (items.length === 0) {
    const response: BulkDeleteResponse = {
      ok: true,
      deletedIds: [],
      missingIds: uniqueIds,
    };
    return NextResponse.json(response);
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

  const storageErrors: Array<{ path: string; message: string }> = [];
  if (storageKeys.length > 0) {
    const { error } = await supabaseAdmin.storage.from("items").remove(storageKeys);
    if (error) {
      storageErrors.push({
        path: "*",
        message: error.message ?? "Failed to remove storage objects",
      });
      console.error("[bulk-delete] storage remove failed", error);
    }
  }

  const response: BulkDeleteResponse = {
    ok: true,
    deletedIds: existingIds,
    missingIds,
    ...(storageErrors.length ? { storageErrors } : {}),
  };

  return NextResponse.json(response);
}
