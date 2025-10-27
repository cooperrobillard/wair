import { prisma } from "@/lib/db";
import { normalizeColorStd } from "@/lib/normalizeColor";
import { normalizeArticleType } from "@/lib/normalizeArticle";

async function main() {
  const slashColors = await prisma.item.findMany({
    where: { OR: [{ colorStd: "Ivory/Off-White" }, { colorStd: "Beige/Tan" }] },
    select: { id: true, colorStd: true, colorRaw: true },
  });

  for (const item of slashColors) {
    let mapped: string | null = null;
    if (item.colorStd === "Ivory/Off-White") mapped = "Ivory";
    else if (item.colorStd === "Beige/Tan") mapped = "Beige";

    const normalizedFromRaw = normalizeColorStd(item.colorRaw ?? null);
    if (
      normalizedFromRaw &&
      normalizedFromRaw !== "Ivory/Off-White" &&
      normalizedFromRaw !== "Beige/Tan"
    ) {
      mapped = normalizedFromRaw;
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
