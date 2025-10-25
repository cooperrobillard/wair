import { normalizeMultiColor, normalizeToCanonArticle } from "@/lib/normalize";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { getAuth } from "@clerk/nextjs/server";
import { createHash } from "crypto";

const RESULT_SCHEMA = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  type: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(60).optional(),
});

const NEED_VALUES = ["name", "brand", "type", "color"] as const;
const NEED_SCHEMA = z.array(z.enum(NEED_VALUES)).nonempty();

const INPUT_SCHEMA = z.object({
  text: z.string().min(1),
  need: NEED_SCHEMA,
});

const SYSTEM_PROMPT = [
  "You extract clothing metadata as strict JSON.",
  "Allowed keys: name, brand, type, color.",
  "Only include keys that were requested in the 'need' list and can be confidently inferred from the provided text.",
  "For type, pick ONLY from this list (case-insensitive) and return the canonical spelling: T-Shirt, Long Sleeve Shirt, Polo Shirt, Button-Up Shirt, Blouse, Tank Top, Crop Top, Sweatshirt, Hoodie, Sweater, Cardigan, Jacket, Coat, Blazer, Vest, Jeans, Dress Pants / Slacks, Chinos, Joggers, Sweatpants, Shorts, Skirt, Leggings, Cargo Pants, Dress, Jumpsuit, Romper, Overalls, Sneakers, Dress Shoes, Loafers, Boots, Sandals, Heels, Flats, Slides, Running Shoes. If none is present, omit the key.",
  "For color, pick ONLY from this list (case-insensitive): Black, Charcoal, Light Gray, White, Ivory / Off-White, Beige / Tan, Brown, Navy, Olive, Denim, Red, Burgundy, Orange, Rust, Yellow, Green, Teal, Blue, Purple, Pink. If two colors are clearly present in roughly equal proportion, output them as 'Color A / Color B' using the canonical names; otherwise return a single color. If none is present, omit the key.",
  "For name and brand, return concise strings without marketing fluff; if unknown, omit the key.",
  "Respond with a single JSON object only; no prose or explanation.",
].join("\n");

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const CACHE_TTL_MS = 60_000;

type RateBucket = {
  count: number;
  resetAt: number;
};

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const rateLimitBuckets = new Map<string, RateBucket>();
const aiCache = new Map<string, CacheEntry>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return true;
}

function computeCacheKey(text: string, need: readonly string[]): string {
  const hash = createHash("sha1");
  const key = `${need.slice().sort().join(",")}::${text}`;
  hash.update(key);
  return hash.digest("hex");
}

function getCachedResult(key: string): Record<string, string> | null {
  const entry = aiCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    aiCache.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as Record<string, string>;
  } catch {
    aiCache.delete(key);
    return null;
  }
}

function setCachedResult(key: string, value: Record<string, string>): void {
  aiCache.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = INPUT_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { text, need } = parsed.data;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[ai-parse] Missing OPENAI_API_KEY");
      return NextResponse.json({ error: "AI parse unavailable" }, { status: 500 });
    }

    if (!checkRateLimit(userId)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const cacheKey = computeCacheKey(text, need);
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return NextResponse.json({ ok: true, result: cached, cached: true });
    }

    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ text, need }) },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content ?? "{}";

    let parsedJson: unknown = {};
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (error) {
      console.error("[ai-parse] Failed to parse model JSON", error);
      return NextResponse.json({ error: "AI parse failed" }, { status: 500 });
    }

    const data = RESULT_SCHEMA.partial().safeParse(parsedJson);
    if (!data.success) {
      console.error("[ai-parse] Model JSON validation failed", data.error);
      return NextResponse.json({ error: "AI parse failed" }, { status: 500 });
    }

    const filtered: Partial<Record<typeof NEED_VALUES[number], string>> = {};
    for (const key of need) {
      const value = data.data[key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;

      if (key === "type") {
        const canonicalType = normalizeToCanonArticle(trimmed);
        if (canonicalType) filtered[key] = canonicalType;
        continue;
      }

      if (key === "color") {
        const canonicalColor = normalizeMultiColor(trimmed);
        if (canonicalColor) filtered[key] = canonicalColor;
        continue;
      }

      filtered[key] = trimmed;
    }

    setCachedResult(cacheKey, filtered);

    return NextResponse.json({ ok: true, result: filtered });
  } catch (error) {
    console.error("[ai-parse] Unexpected failure", error);
    return NextResponse.json({ error: "AI parse failed" }, { status: 500 });
  }
}
