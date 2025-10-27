import { prisma } from "@/lib/db";
import { deriveColorStd } from "@/lib/normalizeColor";

async function main() {
  const batch = 200;
  let cursor: string | null = null;
  let updated = 0;

  while (true) {
    const items = (await prisma.item.findMany({
      where: { OR: [{ colorStd: null }, { colorStd: "" }] },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, colorRaw: true },
    })) as Array<{ id: string; colorRaw: string | null }>;

    if (!items.length) break;

    for (const it of items) {
      const colorStd = deriveColorStd(null, it.colorRaw ?? null);
      await prisma.item.update({
        where: { id: it.id },
        data: { colorStd },
      });
      updated += 1;
      cursor = it.id;
    }
  }

  console.log("Backfill complete. Updated:", updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
