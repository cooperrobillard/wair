import { prisma } from "@/lib/db";
import { normalizeColorStd } from "@/lib/normalizeColor";
import { normalizeArticleType } from "@/lib/normalizeArticle";

const LEGACY_COLOR_SLASH_MAP: Record<string, string> = {
  "Ivory/Off-White": "Ivory",
  "Beige/Tan": "Beige",
};

async function main() {
  const slashColors = await prisma.item.findMany({
    where: { OR: [{ colorStd: "Ivory/Off-White" }, { colorStd: "Beige/Tan" }] },
    select: { id: true, colorStd: true, colorRaw: true },
  });

  for (const item of slashColors) {
    const current = (item.colorStd ?? "") as string;
    let mapped: string | null = LEGACY_COLOR_SLASH_MAP[current] ?? (current || null);

    const normalizedFromRaw = normalizeColorStd(item.colorRaw ?? null);
    const normalizedStr = (normalizedFromRaw ?? null) as string | null;
    if (normalizedStr) {
      mapped = LEGACY_COLOR_SLASH_MAP[normalizedStr] ?? normalizedStr;
    }

    await prisma.item.update({
      where: { id: item.id },
      data: { colorStd: mapped },
    });
  }

  const slashTypes = await prisma.item.findMany({
    where: { articleType: { in: ["Dress Pants/Slacks", "Dress Pants / Slacks", "Dress Pants /Slacks", "Dress Pants/ Slacks"] } },
    select: { id: true, articleType: true },
  });

  for (const item of slashTypes) {
    const mapped = normalizeArticleType("Dress Pants");
    await prisma.item.update({
      where: { id: item.id },
      data: { articleType: mapped },
    });
  }

  console.log("Backfill complete:", {
    colors: slashColors.length,
    types: slashTypes.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
