// src/app/api/items/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

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

  if (!imageUrl && !originalUrl) {
    return NextResponse.json(
      { error: "imageUrl or originalUrl required" },
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

  const data: Record<string, string> = {};
  if (imageUrl) data.imageUrl = imageUrl;
  if (originalUrl) data.originalUrl = originalUrl;

  const updated = await prisma.item.updateMany({
    where: { id, userId: user.id },
    data,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
