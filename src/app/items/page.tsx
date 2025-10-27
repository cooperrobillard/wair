import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureDbUser } from "@/lib/ensureUser";
import ItemGrid from "@/components/ItemGrid";
import { queryItems, getFacets, type SortOption } from "@/lib/query-items";
import TopFiltersBar from "@/components/TopFiltersBar";
import NewItemDialog from "@/components/NewItemDialog";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};


const csv = (value?: string | string[]) =>
  (Array.isArray(value) ? value.join(",") : value ?? "")
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

export default async function ItemsPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await ensureDbUser(userId);
  if (!user) redirect("/sign-in");

  const sp = ((await searchParams) ?? {}) as Record<string, string | string[] | undefined>;

  const types = csv(sp.type);
  const colors = csv(sp.color);
  const brands = csv(sp.brand);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const sort: SortOption = sp.sort === "alpha" ? "alpha" : "recent";
  const cursor = typeof sp.cursor === "string" && sp.cursor.length > 0 ? sp.cursor : null;
  const selectMode = sp.select === "1";
  const listKey = [
    "t=" + types.join(","),
    "c=" + colors.join(","),
    "b=" + brands.join(","),
    "q=" + (q ?? ""),
    "s=" + sort,
    "sel=" + (selectMode ? "1" : "0"),
  ].join("|");

  const buildSearch = (overrides: Record<string, string | null>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "cursor") continue;
      const serialized = Array.isArray(value) ? value.join(",") : value ?? "";
      if (serialized) search.set(key, serialized);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    return `?${search.toString()}`;
  };

  const selectToggleHref = buildSearch({ select: selectMode ? null : "1", cursor: null });

  const [{ items, nextCursor }, facets] = await Promise.all([
    queryItems({
      userId: user.id,
      types,
      colors,
      brands,
      q,
      sort,
      limit: 24,
      cursor,
    }),
    getFacets(user.id),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Items</h1>
        <div className="flex items-center gap-2">
          <a
            href={selectToggleHref}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            {selectMode ? "Cancel select" : "Select"}
          </a>
          <NewItemDialog />
        </div>
      </div>

      <TopFiltersBar facets={facets} />

      <ItemGrid key={listKey} initialItems={items} initialSelectionMode={selectMode} />
      {nextCursor && (
        <a
          className="inline-block rounded-md border px-3 py-2 text-sm"
          href={`?${new URLSearchParams({
            ...Object.fromEntries(
              Object.entries(sp).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(",") : value ?? "",
              ])
            ),
            cursor: nextCursor,
          })}`}
        >
          Load more
        </a>
      )}
    </div>
  );
}
