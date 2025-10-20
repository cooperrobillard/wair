import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { ensureDbUser } from "@/lib/ensureUser";

const Body = z.object({
  rawInput: z.string().min(2),
  sourceUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await ensureDbUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.item.create({
    data: {
      userId: user.id,
      rawInput: parsed.data.rawInput,
      sourceUrl: parsed.data.sourceUrl,
    },
    select: { id: true },
  });

  const uploadPath = `${userId}/${item.id}.png`;
  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items`;

  return NextResponse.json({ id: item.id, uploadPath, publicBase });
}
