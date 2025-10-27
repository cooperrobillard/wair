import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureDbUser } from "@/lib/ensureUser";
import { deriveColorStd, debugColor } from "@/lib/normalizeColor";
import { prisma } from "@/lib/db";
import { normalizeArticleType } from "@/lib/normalizeArticle";

export const runtime = "nodejs";

function parseStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const rawInputPayload: unknown = body?.rawInput;
    const sourceUrl: unknown = body?.sourceUrl;
    const articleType = typeof body?.articleType === "string" ? body.articleType.trim() : undefined;
    const colorStdInput = parseStringOrNull(body?.colorStd);
    const colorValue = parseStringOrNull(body?.color);
    const colorRawInput = parseStringOrNull(body?.colorRaw);
    const resolvedColorRaw = colorRawInput !== undefined ? colorRawInput : colorValue;
    const shouldProcessColor =
      colorStdInput !== undefined || colorValue !== undefined || colorRawInput !== undefined;
    const brand = typeof body?.brand === "string" ? body.brand.trim() : undefined;
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;

    if (
      rawInputPayload !== undefined &&
      rawInputPayload !== null &&
      typeof rawInputPayload !== "string"
    ) {
      return NextResponse.json({ error: "rawInput must be a string" }, { status: 400 });
    }

    const user = await ensureDbUser(userId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let colorStd: string | null | undefined;
    if (shouldProcessColor) {
      const deriveSource = colorStdInput === null ? null : colorValue ?? resolvedColorRaw ?? null;
      debugColor("deriveColorStd.input.create", {
        colorStdInput,
        colorFromBody: colorValue,
        colorRaw: resolvedColorRaw,
      });
      colorStd = deriveColorStd(colorStdInput, deriveSource ?? null);
      debugColor("deriveColorStd.output.create", { colorStd });
      if (typeof deriveSource === "string" && !colorStd) {
        console.warn("[items] color normalization returned null for:", deriveSource);
      }
    }

    const item = await prisma.item.create({
      data: {
        userId: user.id,
        rawInput:
          typeof rawInputPayload === "string" ? rawInputPayload.trim() : "",
        sourceUrl: typeof sourceUrl === "string" ? sourceUrl : undefined,
        articleType: articleType ? normalizeArticleType(articleType) ?? undefined : undefined,
        colorRaw: resolvedColorRaw !== undefined ? resolvedColorRaw : undefined,
        colorStd: colorStd ?? undefined,
        brand: brand || undefined,
        name: name || undefined,
      },
      select: { id: true },
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error("[api/items] missing NEXT_PUBLIC_SUPABASE_URL env var");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const originalUploadPath = `original/${userId}/${item.id}.png`;
    const publicBase = `${supabaseUrl}/storage/v1/object/public/items`;

    return NextResponse.json({
      id: item.id,
      originalUploadPath,
      publicBase,
    });
  } catch (error) {
    const err = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    console.error("[api/items] failed to create item", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
