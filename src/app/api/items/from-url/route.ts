import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { copyRemoteImageToSupabase } from "@/lib/image-ingest";
import type { ScrapedProduct } from "@/lib/scrape-helpers";

type FromUrlBody = {
  url?: string;
  rawInput?: string;
  force?: string;
};

type ScrapeResponse = {
  product?: Partial<ScrapedProduct>;
  pathUsed?: string;
};

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as FromUrlBody | null;
    const url = body?.url;
    const rawInput = body?.rawInput;
    const force = body?.force;

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

    let product: Partial<ScrapedProduct> | null = null;
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
      }).catch(() => null);
      if (scrapeRes?.ok) {
        const json = (await scrapeRes.json().catch(() => null)) as ScrapeResponse | null;
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
  } catch (e: unknown) {
    console.error("[/api/items/from-url] unexpected", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = "nodejs";
