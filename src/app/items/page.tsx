import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureDbUser } from "@/lib/ensureUser";
import NewItemDialog from "@/components/NewItemDialog";
import ItemGrid, { type UIItem } from "@/components/ItemGrid";
import { parseFreeform } from "@/lib/freeform-parse";

export default async function ItemsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await ensureDbUser(userId);
  if (!user) redirect("/sign-in");

  const rawItems = await prisma.item.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rawInput: true,
      sourceUrl: true,
      imageUrl: true,
      originalUrl: true,
      articleType: true,
      colorRaw: true,
      name: true,
      brand: true,
      createdAt: true,
    },
  });

  const items: UIItem[] = rawItems.map((item) => {
    const parsed = parseFreeform(item.rawInput ?? "");
    const articleType = item.articleType ?? parsed.type ?? null;
    const colorRaw = item.colorRaw ?? parsed.color ?? null;
    return {
      id: item.id,
      rawInput: item.rawInput,
      articleType,
      colorRaw,
      sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl,
      originalUrl: item.originalUrl,
      name: item.name ?? null,
      brand: item.brand ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Items</h1>
        <NewItemDialog />
      </div>

      <ItemGrid initialItems={items} />
    </div>
  );
}
