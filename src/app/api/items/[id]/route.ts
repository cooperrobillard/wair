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
  const imageUrl: unknown = body?.imageUrl;
  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
  }

  // await the params
  const { id } = await context.params;

  // Ownership check
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  const updated = await prisma.item.updateMany({
    where: { id, userId: user.id },
    data: { imageUrl: imageUrl.trim() },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
