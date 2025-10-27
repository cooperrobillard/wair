"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ColorSwatch from "@/components/ColorSwatch";
import { COLOR_HEX } from "@/lib/colors";

type FacetBucket = { value: string; count: number };

export default function TopFiltersBar({
  facets,
}: {
  facets: { types: FacetBucket[]; colors: FacetBucket[]; brands: FacetBucket[] };
}) {
  const router = useRouter();
  const params = useSearchParams();

  const parseSet = React.useCallback(
    (key: string) => new Set((params.get(key) || "").split(",").filter(Boolean)),
    [params]
  );

  const [pendingQ, setPendingQ] = React.useState(params.get("q") || "");
  const [pendingSort, setPendingSort] = React.useState<"recent" | "alpha">(
    (params.get("sort") as "recent" | "alpha") || "recent"
  );
  const [pendingTypes, setPendingTypes] = React.useState<Set<string>>(parseSet("type"));
  const [pendingColors, setPendingColors] = React.useState<Set<string>>(parseSet("color"));
  const [pendingBrands, setPendingBrands] = React.useState<Set<string>>(parseSet("brand"));

  React.useEffect(() => {
    setPendingQ(params.get("q") || "");
    setPendingSort((params.get("sort") as "recent" | "alpha") || "recent");
    setPendingTypes(parseSet("type"));
    setPendingColors(parseSet("color"));
    setPendingBrands(parseSet("brand"));
  }, [params, parseSet]);

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  };

  const buildSearch = () => {
    const sp = new URLSearchParams(params.toString());
    const setList = (key: string, set: Set<string>) => {
      if (set.size) {
        sp.set(key, Array.from(set).join(","));
      } else {
        sp.delete(key);
      }
    };
    if (pendingQ.trim()) {
      sp.set("q", pendingQ.trim());
    } else {
      sp.delete("q");
    }
    sp.set("sort", pendingSort);
    setList("type", pendingTypes);
    setList("color", pendingColors);
    setList("brand", pendingBrands);
    sp.delete("cursor");
    return sp;
  };

  const identical = (() => {
    const arr = (set: Set<string>) => Array.from(set).sort().join(",");
    return (
      (params.get("q") || "") === pendingQ.trim() &&
      ((params.get("sort") as "recent" | "alpha") || "recent") === pendingSort &&
      (params.get("type") || "") === arr(pendingTypes) &&
      (params.get("color") || "") === arr(pendingColors) &&
      (params.get("brand") || "") === arr(pendingBrands)
    );
  })();

  const apply = () => {
    const sp = buildSearch();
    const url = `/items?${sp.toString()}`;
    if (url !== window.location.pathname + window.location.search) {
      router.push(url);
    } else {
      router.refresh();
    }
  };

  const clearAll = () => {
    setPendingQ("");
    setPendingSort("recent");
    setPendingTypes(new Set());
    setPendingColors(new Set());
    setPendingBrands(new Set());
    const sp = new URLSearchParams(params.toString());
    ["type", "color", "brand", "q", "cursor", "sort"].forEach((key) => sp.delete(key));
    router.push(`/items?${sp.toString()}`);
    router.refresh();
  };

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={pendingQ}
          onChange={(event) => setPendingQ(event.target.value)}
          placeholder="Search name/brand..."
          aria-label="Search items"
          className="w-full rounded-md border px-3 py-2 text-sm sm:w-64"
          onKeyDown={(event) => {
            if (event.key === "Enter") apply();
          }}
        />
        <div className="flex items-center gap-2">
          <label className="text-sm">Sort</label>
          <select
            value={pendingSort}
            onChange={(event) => setPendingSort(event.target.value as "recent" | "alpha")}
            className="rounded-md border px-2 py-2 text-sm"
          >
            <option value="recent">Most recent</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>
      </div>

      {!!facets.types.length && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium">Type</span>
          {facets.types.map((type) => {
            const active = pendingTypes.has(type.value);
            return (
              <button
                key={type.value}
                onClick={() => setPendingTypes((set) => toggle(set, type.value))}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active ? "bg-black text-white" : "bg-white"
                }`}
                title={`${type.value} (${type.count})`}
              >
                {type.value} <span className="opacity-70">({type.count})</span>
              </button>
            );
          })}
        </div>
      )}

      {!!facets.colors.length && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium">Color</span>
          {facets.colors
            .filter((color) => Boolean(COLOR_HEX[color.value]))
            .map((color) => {
              const active = pendingColors.has(color.value);
              return (
                <button
                  key={color.value}
                  onClick={() => setPendingColors((set) => toggle(set, color.value))}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                    active ? "bg-black text-white" : "bg-white"
                  }`}
                  title={`${color.value} (${color.count})`}
                >
                  <ColorSwatch label={color.value} size={12} />
                  {color.value} <span className="opacity-70">({color.count})</span>
                </button>
              );
            })}
        </div>
      )}

      {!!facets.brands.length && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium">Brand</span>
          {facets.brands.slice(0, 16).map((brand) => {
            const active = pendingBrands.has(brand.value);
            return (
              <button
                key={brand.value}
                onClick={() => setPendingBrands((set) => toggle(set, brand.value))}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active ? "bg-black text-white" : "bg-white"
                }`}
                title={`${brand.value} (${brand.count})`}
              >
                {brand.value} <span className="opacity-70">({brand.count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={apply}
          disabled={identical}
          className={`rounded-md border px-3 py-2 text-sm ${
            identical ? "bg-white text-gray-500" : "bg-black text-white"
          }`}
        >
          Search
        </button>
        <button onClick={clearAll} className="text-xs text-muted-foreground underline">
          Clear filters
        </button>
      </div>
    </div>
  );
}
