import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { copyRemoteImageToSupabase } from "@/lib/image-ingest";

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { url, rawInput, force } = await req.json().catch(() => ({}));
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) user = await prisma.user.create({ data: { clerkId } });

    const item = await prisma.item.create({
      data: { userId: user.id, sourceUrl: url, rawInput: typeof rawInput === "string" ? rawInput : "" },
      select: { id: true },
    });

    const baseUrl = getBaseUrl();

    let product: any = null;
    let pathUsed: string | null = null;
    try {
      const scrapePayload =
        typeof force === "string" && force.length > 0
          ? { url, force }
          : { url };
      const scrapeRes = await fetch(`${baseUrl}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scrapePayload),
        cache: "no-store",
      });
      if (scrapeRes.ok) {
        const json = await scrapeRes.json().catch(() => null);
        product = json?.product ?? null;
        pathUsed = typeof json?.pathUsed === "string" ? json.pathUsed : null;
      }
    } catch {
      product = null;
    }

    if (product?.imageUrl) {
      const targetPath = `original/${clerkId}/${item.id}.png`;
      const { publicUrl } = await copyRemoteImageToSupabase({
        remoteUrl: product.imageUrl,
        bucket: "items",
        targetPath,
      });
      await prisma.item.update({
        where: { id: item.id },
        data: { originalUrl: publicUrl },
      });

      await fetch(`${baseUrl}/api/items/${item.id}/clean`, { method: "POST", cache: "no-store" }).catch(() => null);
    }

    const providedRawInput = typeof rawInput === "string" ? rawInput : "";
    if ((providedRawInput.trim() === "") && (product?.name || product?.brand || product?.colorRaw)) {
      const seed = [product?.brand, product?.name, product?.colorRaw].filter(Boolean).join(", ");
      if (seed) {
        await prisma.item.update({ where: { id: item.id }, data: { rawInput: seed } });
      }
    }

    return NextResponse.json({ ok: true, id: item.id, product, pathUsed: pathUsed ?? undefined });
  } catch (e: any) {
    console.error("[/api/items/from-url] unexpected", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
export const runtime = "nodejs";
