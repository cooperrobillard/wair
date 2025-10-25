import * as cheerio from "cheerio";

const IMAGE_EXTENSION_BLOCK = /\.(svg|ico)(\?|$)/i;
const IMAGE_NAME_BLOCK = /(logo|favicon|sprite|icon|placeholder|thumb|swatch|sample)/i;
const IMAGE_CLASS_HINT = /(product|gallery|image|hero|primary|main|zoom|slide|detail)/i;

const TYPE_PATTERNS = [
  { label: "Pleated pants", variants: ["pleated pants", "pleated pant", "pleated trouser", "pleated trousers"] },
  { label: "Cargo pants", variants: ["cargo pants", "cargo pant"] },
  { label: "Sweatpants", variants: ["sweatpants", "sweatpant", "jogger", "joggers"] },
  { label: "Shorts", variants: ["shorts", "short"] },
  { label: "Crewneck", variants: ["crewneck", "crewnecks", "crew neck", "crew necks"] },
  { label: "Hoodie", variants: ["hoodie", "hoodies", "hooded sweatshirt"] },
  { label: "Sweater", variants: ["sweater", "sweaters", "jumper", "jumpers"] },
  { label: "Cardigan", variants: ["cardigan", "cardigans"] },
  { label: "Sweatshirt", variants: ["sweatshirt", "sweatshirts"] },
  { label: "T-shirt", variants: ["t-shirt", "t-shirts", "tee", "tees", "t shirt", "t shirts"] },
  { label: "Shirt", variants: ["shirt", "shirts", "button-down", "button-downs", "buttondown", "buttondowns"] },
  { label: "Polo", variants: ["polo", "polos"] },
  { label: "Dress", variants: ["dress", "dresses"] },
  { label: "Skirt", variants: ["skirt", "skirts"] },
  { label: "Jacket", variants: ["jacket", "jackets"] },
  { label: "Coat", variants: ["coat", "coats", "parka", "parkas", "trench", "trenches"] },
  { label: "Blazer", variants: ["blazer", "blazers"] },
  { label: "Jeans", variants: ["jeans", "denim"] },
  { label: "Pants", variants: ["pant", "pants", "trouser", "trousers"] },
  { label: "Leggings", variants: ["legging", "leggings"] },
  { label: "Top", variants: ["top", "tops", "camisole", "camisoles", "tank", "tanks"] },
  { label: "Shoes", variants: ["shoes", "shoe", "sneaker", "sneakers", "trainer", "trainers"] },
  { label: "Boots", variants: ["boots", "boot"] },
  { label: "Sandals", variants: ["sandals", "sandal"] },
  { label: "Loafers", variants: ["loafers", "loafer"] },
  { label: "Heels", variants: ["heels", "heel", "pump", "pumps"] },
  { label: "Bag", variants: ["bag", "bags", "handbag", "handbags", "tote", "totes", "backpack", "backpacks"] },
  { label: "Hat", variants: ["hat", "hats", "cap", "caps", "beanie", "beanies"] },
  { label: "Scarf", variants: ["scarf", "scarves"] },
  { label: "Gloves", variants: ["gloves", "glove"] },
];

const TYPE_MAP: Array<[RegExp, string]> = [
  [/hoodie|hooded/i, "hoodie"],
  [/crewneck/i, "crewneck"],
  [/sweater|pullover|jumper/i, "sweater"],
  [/cardigan/i, "cardigan"],
  [/t[-\s]?shirt|tee\b|polo/i, "t-shirt"],
  [/button[-\s]?down/i, "shirt"],
  [/shorts/i, "shorts"],
  [/jeans|denim/i, "jeans"],
  [/chinos|khakis/i, "chinos"],
  [/trouser|pant/i, "pants"],
  [/pleat/i, "pleated pants"],
  [/skirt/i, "skirt"],
  [/dress/i, "dress"],
  [/sweatshirt/i, "sweatshirt"],
  [/jacket/i, "jacket"],
  [/coat|parka|trench/i, "coat"],
  [/blazer/i, "blazer"],
  [/legging/i, "leggings"],
  [/sneaker|trainer|running shoe/i, "shoes"],
  [/boot/i, "boots"],
  [/sandals?/i, "sandals"],
  [/loafer/i, "loafers"],
  [/heel|pump/i, "heels"],
  [/bag|handbag|tote|backpack/i, "bag"],
  [/hat|beanie|cap/i, "hat"],
  [/scarf/i, "scarf"],
  [/glove/i, "gloves"],
];

const COLOR_PATTERNS = [
  /(?:color|colour)\s*[:\-]\s*([A-Za-z0-9 \-\/]+)/i,
  /available in\s+([A-Za-z0-9 \-\/]+)\s+(?:color|colour)/i,
  /\b([A-Za-z][A-Za-z0-9 \-\/]+)\s+(?:color|colour)\b/i,
];

function normalizeString(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function valueToString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      (obj.url as string | undefined) ??
      (obj.contentUrl as string | undefined) ??
      (obj["@id"] as string | undefined) ??
      (obj.value as string | undefined)
    );
  }
  return undefined;
}

function extractNameField(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "object" && "name" in (value as Record<string, unknown>)) {
    return extractNameField((value as { name?: unknown }).name);
  }
  return undefined;
}

function extractBreadcrumbName(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const obj = entry as Record<string, unknown>;
  return extractNameField(obj["item"]) ?? extractNameField(obj["name"]);
}

function inferTypeFromText(text?: string): string | undefined {
  if (!text) return undefined;
  const collapsed = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  const normalized = ` ${collapsed} `;
  for (const { label, variants } of TYPE_PATTERNS) {
    for (const variant of variants) {
      const needle = ` ${variant
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()} `;
      if (normalized.includes(needle)) {
        return label;
      }
    }
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toStringArray);
  if (typeof value === "object") {
    const maybeName = (value as { name?: unknown }).name;
    if (maybeName) return toStringArray(maybeName);
  }
  return [String(value)];
}

function extractTypeCandidate(value: unknown): string | undefined {
  const asStrings = toStringArray(value);
  for (const raw of asStrings) {
    const candidate = raw.split(/>|\/|\|/).pop()?.trim();
    if (!candidate) continue;
    const inferred = inferTypeFromText(candidate);
    if (inferred) return inferred;
  }
  return undefined;
}

function addImageCandidate(
  list: string[],
  candidate: unknown,
  pageUrl: string,
  seen?: Set<string>
): void {
  const raw = valueToString(candidate);
  if (!raw) return;
  const abs = toAbsoluteUrl(raw, pageUrl);
  if (!abs) return;
  if (IMAGE_EXTENSION_BLOCK.test(abs)) return;
  if (IMAGE_NAME_BLOCK.test(abs)) return;
  const normalized = normalizeAmazonImage(abs);
  if (seen) {
    if (seen.has(normalized)) return;
    seen.add(normalized);
  } else if (list.includes(normalized)) {
    return;
  }
  list.push(normalized);
}

function extractColorFromText(text?: string): string | undefined {
  if (!text) return undefined;
  for (const pattern of COLOR_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const color = normalizeString(match[1]);
      if (color) return color;
    }
  }
  return undefined;
}

// Make a URL absolute relative to the page URL
export function toAbsoluteUrl(possible: string, pageUrl: string): string | null {
  try {
    if (!possible) return null;
    const abs = new URL(possible, pageUrl);
    return abs.toString();
  } catch {
    return null;
  }
}

export type ScrapedProduct = {
  name?: string;
  brand?: string;
  colorRaw?: string;
  imageUrl?: string;
  images?: string[];
  price?: string;
  currency?: string;
  type?: string;
};

type ParsedProduct = Partial<ScrapedProduct> & {
  breadcrumbs?: string[];
  metaTitle?: string;
};

// Pull Product JSON-LD blocks
export function parseJsonLd($: cheerio.CheerioAPI, pageUrl: string): ParsedProduct {
  const out: ParsedProduct = {};
  const scripts = $('script[type="application/ld+json"]');
  const images: string[] = [];
  const breadcrumbs: string[] = [];
  const seenImages = new Set<string>();

  scripts.each((_, el) => {
    const txt = $(el).contents().text().trim();
    if (!txt) return;
    try {
      const json = JSON.parse(txt);
      const arr = Array.isArray(json) ? json : [json];
      for (const node of arr) {
        const rawType = node?.["@type"] ?? node?.type;
        const typeStr = toStringArray(rawType).join(",").toLowerCase();

        if (typeStr.includes("breadcrumblist")) {
          const breadcrumb = Array.isArray(node?.itemListElement)
            ? (node.itemListElement as unknown[])
            : [];
          for (const entry of breadcrumb) {
            const name = extractBreadcrumbName(entry);
            if (name) breadcrumbs.push(name);
          }
          continue;
        }

        if (!typeStr.includes("product")) continue;

        if (node.name && !out.name) out.name = String(node.name);

        if (node.brand) {
          if (typeof node.brand === "string") out.brand = node.brand;
          else if (node.brand?.name) out.brand = String(node.brand.name);
        }

        if (node.color && !out.colorRaw) out.colorRaw = String(node.color);

        if (!out.colorRaw) {
          const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
          for (const prop of props) {
            const propName = String(prop?.name ?? "").toLowerCase();
            if (propName.includes("color") || propName.includes("colour")) {
              const val =
                valueToString(prop?.value) ??
                valueToString(prop?.propertyID) ??
                valueToString(prop?.description);
              if (val) {
                out.colorRaw = normalizeString(val);
                break;
              }
            }
          }
        }

        if (!out.colorRaw) {
          const colorFromDescription = extractColorFromText(String(node.description ?? ""));
          if (colorFromDescription) out.colorRaw = colorFromDescription;
        }

        if (!out.type) {
          const fromCategory = extractTypeCandidate(node.category);
          if (fromCategory) out.type = fromCategory;
        }
        if (!out.type) {
          const fromAdditional = extractTypeCandidate(node.additionalType);
          if (fromAdditional) out.type = fromAdditional;
        }
        if (!out.type) {
          const inferred = inferTypeFromText(`${node.name ?? ""} ${node.description ?? ""}`);
          if (inferred) out.type = inferred;
        }

        if (node.image) {
          const imagesArray = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imagesArray) {
            addImageCandidate(images, img, pageUrl, seenImages);
          }
          if (!out.imageUrl && images.length) out.imageUrl = images[0];
        }

        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        if (offers) {
          if (offers.price && !out.price) out.price = String(offers.price);
          if (offers.priceCurrency && !out.currency) out.currency = String(offers.priceCurrency);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  if (breadcrumbs.length) {
    out.breadcrumbs = Array.from(new Set(breadcrumbs.map((b) => normalizeString(b))));
  }
  if (images.length) {
    out.images = images;
    if (!out.imageUrl) out.imageUrl = images[0];
  }

  return out;
}

// Fallback: Open Graph / Twitter meta tags
export function parseMetaTags($: cheerio.CheerioAPI, pageUrl: string): ParsedProduct {
  const out: ParsedProduct = {};
  const pick = (sel: string) => $("meta" + sel).attr("content") || undefined;
  const seenImages = new Set<string>();

  const ogTitle = pick('[property="og:title"]');
  const twitterTitle = pick('[name="twitter:title"]');
  const title = $("title").first().text().trim() || undefined;
  const metaTitle = ogTitle || twitterTitle || title;
  out.metaTitle = metaTitle;
  if (metaTitle && !out.name) out.name = metaTitle;

  const images: string[] = [];
  const metaImages = [
    pick('[property="og:image"]'),
    pick('[property="og:image:secure_url"]'),
    pick('[property="og:image:url"]'),
    pick('[name="twitter:image"]'),
    pick('[name="twitter:image:src"]'),
  ];
  for (const img of metaImages) {
    addImageCandidate(images, img, pageUrl, seenImages);
  }
  if (images.length) {
    out.images = images;
    if (!out.imageUrl) out.imageUrl = images[0];
  }

  const desc =
    pick('[name="description"]') ||
    pick('[property="og:description"]') ||
    pick('[name="twitter:description"]') ||
    "";

  const explicitColor =
    pick('[property="product:color"]') ||
    pick('[itemprop="color"]') ||
    pick('[name="color"]');
  const color =
    explicitColor ||
    extractColorFromText(desc) ||
    extractColorFromText(metaTitle);
  if (color && !out.colorRaw) out.colorRaw = normalizeString(color);

  if (!out.type) {
    const metaType = inferType({
      name: out.name,
      brand: out.brand,
      metaTitle,
      breadcrumbs: out.breadcrumbs,
    });
    if (metaType) out.type = metaType;
  }

  return out;
}

export function collectImageCandidates(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  seeds: string[] = []
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const seed of seeds) {
    addImageCandidate(result, seed, pageUrl, seen);
  }

  $("img").each((_, element) => {
    const img = $(element);
    const candidates: Array<string | undefined> = [];
    const srcset = img.attr("srcset");
    if (srcset) {
      const first = srcset
        .split(",")
        .map((part) => part.trim().split(" ")[0])
        .find(Boolean);
      if (first) candidates.push(first);
    }
    candidates.push(
      img.attr("data-zoom-image"),
      img.attr("data-large_image"),
      img.attr("data-image"),
      img.attr("data-src"),
      img.attr("data-original"),
      img.attr("data-lazy"),
      img.attr("src")
    );

    const cls = `${img.attr("class") || ""} ${img.attr("id") || ""}`;
    const widthAttr = parseInt(img.attr("width") || "", 10);
    const heightAttr = parseInt(img.attr("height") || "", 10);
    if ((widthAttr && widthAttr < 80) || (heightAttr && heightAttr < 80)) return;
    if (!IMAGE_CLASS_HINT.test(cls) && !widthAttr && !heightAttr) {
      // Allow but deprioritise by continuing; candidates still considered below.
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      addImageCandidate(result, candidate, pageUrl, seen);
    }
  });

  return result;
}

export function inferType(input: {
  name?: string;
  brand?: string;
  metaTitle?: string;
  breadcrumbs?: string[];
}): string | undefined {
  const haystackParts = [
    input.name,
    input.metaTitle,
    ...(input.breadcrumbs ?? []),
    input.brand,
  ]
    .filter(Boolean)
    .map((part) => part!.toLowerCase());

  if (!haystackParts.length) return undefined;

  const hay = haystackParts.join(" ");
  for (const [regex, label] of TYPE_MAP) {
    if (regex.test(hay)) return label;
  }

  return inferTypeFromText(hay) ?? undefined;
}

export function normalizeAmazonImage(u: string): string {
  try {
    const url = new URL(u);
    if (!/amazon\./i.test(url.hostname)) return u;

    url.pathname = url.pathname.replace(/\._[A-Z]{2}_[A-Z]+[0-9A-Z_]*_\./g, "._SL1500_.");
    url.pathname = url.pathname
      .replace(/\._[A-Z]{2}_[0-9A-Z_]+_\./g, "._SL1500_.")
      .replace(/(\._[^.]+_)?\.(jpg|jpeg|png|webp)$/i, "._SL1500_.$2");
    return url.toString();
  } catch {
    return u;
  }
}
