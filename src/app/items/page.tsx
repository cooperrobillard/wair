import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureDbUser } from "@/lib/ensureUser";
import NewItemDialog from "@/components/NewItemDialog";

type UIItem = {
  id: string;
  rawInput: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  createdAt: Date;
};

export default async function ItemsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await ensureDbUser(userId);
  if (!user) redirect("/sign-in");

  const items: UIItem[] = await prisma.item.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rawInput: true,
      sourceUrl: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Items</h1>
        <NewItemDialog />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items yet. Click “Add Item” to create your first piece.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((it) => (
            <li key={it.id} className="border rounded-xl p-3">
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageUrl}
                  alt="Item"
                  className="w-full aspect-[4/5] object-cover rounded-lg border"
                />
              ) : (
                <div className="w-full aspect-[4/5] rounded-lg border grid place-items-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium line-clamp-2">{it.rawInput}</p>
                {it.sourceUrl && (
                  <a
                    href={it.sourceUrl}
                    target="_blank"
                    className="text-xs text-blue-600 underline"
                    rel="noreferrer"
                  >
                    source link
                  </a>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {new Date(it.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
