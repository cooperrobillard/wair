type BuildStoragePathArgs = {
  clerkId: string;
  itemId: string;
  imageUrl?: string | null;
  originalUrl?: string | null;
};

const PUBLIC_ITEMS_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/items/`
  : null;

function extractPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (PUBLIC_ITEMS_PREFIX && url.startsWith(PUBLIC_ITEMS_PREFIX)) {
    return url.slice(PUBLIC_ITEMS_PREFIX.length);
  }
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/items/";
    const idx = parsed.href.indexOf(marker);
    if (idx >= 0) {
      return parsed.href.slice(idx + marker.length);
    }
  } catch {
    // ignore invalid URL parsing
  }
  return null;
}

export function buildStoragePaths(args: BuildStoragePathArgs): string[] {
  const { clerkId, itemId, imageUrl, originalUrl } = args;
  const set = new Set<string>();

  const addPath = (path: string | null) => {
    if (path && path.trim().length) {
      set.add(path.trim());
    }
  };

  addPath(extractPathFromUrl(imageUrl));
  addPath(extractPathFromUrl(originalUrl));

  // Fallback paths based on known upload pattern
  addPath(`original/${clerkId}/${itemId}.png`);
  addPath(`clean/${clerkId}/${itemId}.png`);

  return Array.from(set);
}
