import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { queryItems } from "@/lib/query-items";

export async function GET(req: Request) {
  const { userId } = auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const csv = (key: string) =>
    (url.searchParams.get(key) || "")
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);

  const types = csv("type");
  const colors = csv("color");
  const brands = csv("brand");
  const q = url.searchParams.get("q") || undefined;
  const sort = (url.searchParams.get("sort") === "alpha" ? "alpha" : "recent") as "alpha" | "recent";
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") || 24);

  const { items, nextCursor } = await queryItems({
    userId,
    types,
    colors,
    brands,
    q,
    sort,
    limit,
    cursor: cursor && cursor.length > 0 ? cursor : null,
  });

  return NextResponse.json({ items, nextCursor });
}
