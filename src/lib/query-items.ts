import { prisma } from "@/lib/db";

export type SortOption = "recent" | "alpha";

export type ItemFilters = {
  userId: string;
  types?: string[];
  colors?: string[];
  brands?: string[];
  q?: string;
  sort?: SortOption;
  limit?: number;
  cursor?: string | null;
};

function clampLimit(n?: number) {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 24;
  return Math.min(Math.max(x, 1), 60);
}

function buildWhere(filters: ItemFilters) {
  const where: Record<string, unknown> = { userId: filters.userId };

  if (filters.types?.length) {
    where.articleType = { in: filters.types };
  }
  if (filters.colors?.length) {
    where.colorStd = { in: filters.colors };
  }
  if (filters.brands?.length) {
    where.brand = { in: filters.brands };
  }

  if (filters.q && filters.q.trim()) {
    const query = filters.q.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { brand: { contains: query, mode: "insensitive" } },
      { rawInput: { contains: query, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function queryItems(filters: ItemFilters) {
  const where = buildWhere(filters);
  const take = clampLimit(filters.limit);

  const orderBy =
    filters.sort === "alpha"
      ? [
          { name: "asc" as const },
          { createdAt: "desc" as const },
          { id: "desc" as const },
        ]
      : [
          { createdAt: "desc" as const },
          { id: "desc" as const },
        ];

  const items = await prisma.item.findMany({
    where,
    orderBy,
    take: take + 1,
    cursor: filters.cursor ? { id: filters.cursor } : undefined,
    skip: filters.cursor ? 1 : 0,
    select: {
      id: true,
      imageUrl: true,
      name: true,
      rawInput: true,
      brand: true,
      articleType: true,
      colorStd: true,
      createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (items.length > take) {
    const extra = items.pop();
    nextCursor = extra ? extra.id : null;
  }

  return { items, nextCursor };
}

export type FacetBucket = { value: string; count: number };
export type Facets = {
  types: FacetBucket[];
  colors: FacetBucket[];
  brands: FacetBucket[];
};

export async function getFacets(userId: string): Promise<Facets> {
  const [types, colors, brands] = await Promise.all([
    prisma.item.groupBy({
      by: ["articleType"],
      where: { userId, NOT: { articleType: null } },
      _count: { articleType: true },
      orderBy: { _count: { articleType: "desc" } },
    }),
    prisma.item.groupBy({
      by: ["colorStd"],
      where: { userId, NOT: { colorStd: null } },
      _count: { colorStd: true },
      orderBy: { _count: { colorStd: "desc" } },
    }),
    prisma.item.groupBy({
      by: ["brand"],
      where: { userId, NOT: { brand: null } },
      _count: { brand: true },
      orderBy: { _count: { brand: "desc" } },
    }),
  ]);

  return {
    types: types.map((entry) => ({
      value: entry.articleType!,
      count: entry._count.articleType,
    })),
    colors: colors.map((entry) => ({
      value: entry.colorStd!,
      count: entry._count.colorStd,
    })),
    brands: brands.map((entry) => ({
      value: entry.brand!,
      count: entry._count.brand,
    })),
  };
}
