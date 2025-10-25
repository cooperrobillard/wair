import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import {
  collectImageCandidates,
  inferType,
  normalizeAmazonImage,
  parseJsonLd,
  parseMetaTags,
  ScrapedProduct,
} from "@/lib/scrape-helpers";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const DIRECT_TIMEOUT_MS = 10_000;
const BROWSERLESS_TIMEOUT_MS = 35_000;
const BROWSERLESS_REQUEST_TIMEOUT_MS = BROWSERLESS_TIMEOUT_MS + 1_000;

function canonUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDirect(
  url: string
): Promise<{ html: string | null; status?: number; ct?: string }> {
  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    },
    DIRECT_TIMEOUT_MS
  );
  if (!res) return { html: null };
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || !ct.includes("text/html")) {
    return { html: null, status: res.status, ct };
  }
  return { html: await res.text(), status: res.status, ct };
}

async function fetchBrowserless(
  url: string
): Promise<{ html: string | null; status?: number }> {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) return { html: null };
  const res = await fetchWithTimeout(
    `https://chrome.browserless.io/content?token=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        waitFor: "domcontentloaded",
        gotoOptions: { waitUntil: "domcontentloaded", timeout: BROWSERLESS_TIMEOUT_MS },
        options: { userAgent: DESKTOP_UA, locale: "en-US" },
      }),
      cache: "no-store",
    },
    BROWSERLESS_REQUEST_TIMEOUT_MS
  );
  if (!res) return { html: null };
  if (!res.ok) return { html: null, status: res.status };
  return { html: await res.text(), status: res.status };
}

function pickBestImage(candidates: string[]): string | undefined {
  const goodExt = (u: string) => /\.(png|jpe?g|webp)(\?|#|$)/i.test(u);
  const notThumb = (u: string) => !/(_UX\d+_|_SX\d+_|thumb|sprite|icon|placeholder)/i.test(u);

  const byScore = [...new Set(candidates)]
    .map((u) => ({
      u,
      score: (goodExt(u) ? 2 : 0) + (notThumb(u) ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const upgradeAmazon = (url: string) => url.replace(/\._[A-Z]{2}\d+_\.([a-z]+)$/i, ".$1");

  const top = byScore[0]?.u;
  return top ? upgradeAmazon(top) : undefined;
}

function consolidate(pageUrl: string, html: string): ScrapedProduct {
  const $ = cheerio.load(html);
  const fromLd = parseJsonLd($, pageUrl);
  const fromMeta = parseMetaTags($, pageUrl);

  const name = fromLd.name ?? fromMeta.name;
  const brand = fromLd.brand ?? fromMeta.brand;
  const colorRaw = fromLd.colorRaw ?? fromMeta.colorRaw;

  const breadcrumbHints = new Set<string>([
    ...(fromLd.breadcrumbs ?? []),
    ...(fromMeta.breadcrumbs ?? []),
  ]);

  $("nav a, .breadcrumb a, .breadcrumbs a, ol.breadcrumb li, ol[aria-label='breadcrumb'] li").each(
    (_, el) => {
      const text = $(el).text().trim();
      if (text) breadcrumbHints.add(text);
    }
  );

  const metaImageSelectors = [
    "meta[property='og:image']",
    "meta[property='og:image:url']",
    "meta[property='og:image:secure_url']",
    "meta[name='og:image']",
    "meta[name='og:image:url']",
    "meta[name='og:image:secure_url']",
    "meta[name='twitter:image']",
    "meta[name='twitter:image:src']",
    "meta[property='twitter:image']",
    "meta[property='twitter:image:src']",
    "link[rel='image_src']",
  ] as const;

  const metaImages = metaImageSelectors
    .flatMap((selector) =>
      $(selector)
        .map((_, el) => {
          const content = $(el).attr("content") ?? $(el).attr("href") ?? "";
          return content;
        })
        .get()
    )
    .filter((value): value is string => Boolean(value));

  const seedImages = Array.from(
    new Set(
      [
        ...(fromLd.images ?? []),
        ...(fromMeta.images ?? []),
        fromLd.imageUrl,
        fromMeta.imageUrl,
        ...metaImages,
      ]
        .filter((value): value is string => Boolean(value))
        .map((url) => normalizeAmazonImage(url))
    )
  );

  const imageCandidates = collectImageCandidates($, pageUrl, seedImages).map((url) =>
    normalizeAmazonImage(url)
  );
  const allImages = Array.from(new Set([...seedImages, ...imageCandidates]));
  const bestImage = pickBestImage(allImages);

  const type =
    fromLd.type ??
    fromMeta.type ??
    inferType({
      name,
      brand,
      metaTitle: fromMeta.metaTitle,
      breadcrumbs: Array.from(breadcrumbHints),
    });

  const product: ScrapedProduct = {
    name,
    brand,
    colorRaw,
    price: fromLd.price ?? fromMeta.price,
    currency: fromLd.currency ?? fromMeta.currency,
    type,
  };

  if (allImages.length) {
    product.images = allImages;
  }
  if (bestImage) {
    product.imageUrl = bestImage;
  } else if (allImages[0]) {
    product.imageUrl = allImages[0];
  }

  return product;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    let url: string | undefined = body?.url;
    const force = typeof body?.force === "string" ? body.force : undefined;

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Valid url required" }, { status: 400 });
    }

    const canonical = canonUrl(url);
    if (!canonical) {
      return NextResponse.json({ error: "Valid url required" }, { status: 400 });
    }
    url = canonical;

    let html: string | null = null;
    let directOk = false;
    let blOk = false;
    let directStatus: number | undefined;
    let directCt: string | undefined;
    let blStatus: number | undefined;

    if (force !== "browserless") {
      const direct = await fetchDirect(url);
      html = direct.html;
      directOk = Boolean(direct.html);
      directStatus = direct.status;
      directCt = direct.ct;
    }

    if (!html) {
      const bl = await fetchBrowserless(url);
      html = bl.html;
      blOk = Boolean(bl.html);
      blStatus = bl.status;
    }

    const blKeyTail = process.env.BROWSERLESS_API_KEY?.slice(-6);
    console.log("[/api/scrape]", {
      url,
      directOk,
      directStatus,
      directCt,
      blOk,
      blStatus,
      blKeyTail,
    });

    if (!html) {
      if (blStatus === 403) {
        return NextResponse.json(
          {
            error: "browserless_403",
            hint: "Invalid token, no credits, or endpoint blocked by plan",
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: "Unable to load page (blocked or not HTML)" },
        { status: 502 }
      );
    }

    const product = consolidate(url, html);

    if (!product.name && !product.imageUrl) {
      return NextResponse.json(
        { error: "Could not extract product metadata" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      product,
      pathUsed: directOk ? "direct" : blOk ? "browserless" : "none",
    });
  } catch (error: unknown) {
    console.error("[/api/scrape] unexpected", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = "nodejs";
