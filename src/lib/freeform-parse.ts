import { normalizeMultiColor, normalizeToCanonArticle } from "@/lib/normalize";
export type ParseResult = {
  type?: string;
  color?: string;
  confidence: { type: number; color: number };
};

const PRICE_RE = /\$[\d.,]+/g;
const PERCENT_RE = /\b\d{1,3}%/g;
const MULTI_SPACE_RE = /\s+/g;
const SITE_SEPARATOR_RE = /\s*[|\-–—•·:]\s*/;
const COLOR_LABEL_RE = /\bcolor\b[\s:=-]*([a-z][a-z\s-]{2,30})\b/i;
const MAX_COLOR_LENGTH = 32;

const SITE_SUFFIXES = [
  'amazon',
  'amazon.com',
  'amazon canada',
  'amazon uk',
  'banana republic',
  'banana republic factory',
  'j crew',
  'jcrew',
  'uniqlo',
  'uniqlo usa',
  'uniqlo us',
  'uniqlo.com',
  'gap',
  'gap factory',
  'old navy',
  'everlane',
  'h&m',
  'hm',
  'lululemon',
  'nordstrom',
  'nordstrom rack',
  "macy's",
  'macys',
  'target',
  'walmart',
  'mr porter',
  'net a porter',
  'farfetch',
  'matchesfashion',
  'asos',
  'anthropologie',
  'urban outfitters',
  'massimo dutti',
  'patagonia',
  'rei',
  'cos',
  'club monaco',
  'brooks brothers',
  'uniqlo usa online store',
  'official site',
  'official store',
  'online store',
  'online shop',
  'shop',
];

const BASE_COLORS = [
  'black',
  'white',
  'navy',
  'blue',
  'green',
  'olive',
  'red',
  'maroon',
  'pink',
  'purple',
  'gray',
  'grey',
  'silver',
  'gold',
  'khaki',
  'camel',
  'stone',
  'taupe',
  'burgundy',
  'teal',
  'mustard',
  'orange',
  'yellow',
  'beige',
  'ivory',
  'cream',
  'tan',
  'brown',
];

const COLOR_PHRASES = [
  'tapestry navy',
  'navy blue',
  'deep navy',
  'dark navy',
  'midnight blue',
  'royal blue',
  'light blue',
  'heather gray',
  'heather grey',
  'off white',
  'soft white',
  'forest green',
  'sage green',
  'army green',
  'hunter green',
  'jet black',
  'faded black',
  'dusty pink',
  'pastel pink',
  'charcoal gray',
  'charcoal grey',
  'stone gray',
];

const TYPE_RULES: Array<{ label: string; patterns: RegExp[]; confidence: number }> = [
  { label: 'quarter-zip', patterns: [/quarter[-\s]?zip/, /1\/4\s?zip/, /half[-\s]?zip/, /zip[-\s]?neck/], confidence: 0.9 },
  { label: 'crewneck', patterns: [/crew[-\s]?neck/, /mock[-\s]?neck/], confidence: 0.85 },
  { label: 'sweatshirt', patterns: [/sweat\s?shirt/], confidence: 0.85 },
  { label: 'sweater', patterns: [/sweater/, /pullover/, /jumper/], confidence: 0.75 },
  { label: 'hoodie', patterns: [/hoodie/, /hooded/], confidence: 0.85 },
  { label: 't-shirt', patterns: [/t[-\s]?shirt/, /\btee\b/, /\bpolo\b/], confidence: 0.7 },
  { label: 'henley', patterns: [/henley/], confidence: 0.75 },
  { label: 'button-down', patterns: [/button[-\s]?down/, /oxford/, /dress\s+shirt/], confidence: 0.75 },
  { label: 'jeans', patterns: [/jeans?\b/, /denim\b/], confidence: 0.7 },
  { label: 'chinos', patterns: [/chinos?\b/, /khakis?\b/], confidence: 0.7 },
  { label: 'pleated pants', patterns: [/pleated\s+(?:pants?|trousers?)/], confidence: 0.7 },
  { label: 'pants', patterns: [/trousers?\b/, /pants?\b/], confidence: 0.6 },
  { label: 'shorts', patterns: [/shorts?\b/], confidence: 0.65 },
  { label: 'blazer', patterns: [/blazer/], confidence: 0.7 },
  { label: 'coat', patterns: [/coat\b/, /overcoat/, /trench/, /parka/, /puffer/, /anorak/, /down\s+jacket/], confidence: 0.75 },
];

const COLOR_CONFIDENCE = {
  label: 0.85,
  phrase: 0.7,
  base: 0.5,
};

const DEBOUNCE_SITE = new RegExp(`\\b(?:${SITE_SUFFIXES.map((s) => escapeRegex(s)).join('|')})\\b`, 'i');

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
}

function normalizeInput(value: string): string {
  return value
    .replace(PRICE_RE, ' ')
    .replace(PERCENT_RE, ' ')
    .replace(/[\u2122\u00ae\u2120]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSiteBranding(value: string): string {
  const segments = value.split(SITE_SEPARATOR_RE).map((seg) => seg.trim());
  if (segments.length <= 1) return value.trim();
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (DEBOUNCE_SITE.test(last)) {
      segments.pop();
    } else {
      break;
    }
  }
  return segments.join(' | ').trim();
}

function preprocessText(value: string): string {
  const normalized = normalizeInput(value.toLowerCase());
  return stripSiteBranding(normalized);
}

export function normalizeProductText(value: string): string {
  if (!value) return '';
  const normalized = normalizeInput(value);
  return stripSiteBranding(normalized);
}

function matchType(text: string): { label?: string; confidence: number } {
  for (const rule of TYPE_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return { label: rule.label, confidence: rule.confidence };
      }
    }
  }
  return { confidence: 0 };
}

function matchColorFromLabel(text: string): { color?: string; confidence: number } {
  const match = COLOR_LABEL_RE.exec(text);
  if (!match) return { confidence: 0 };
  const captured = match[1].trim().toLowerCase();
  if (!captured || captured.length > MAX_COLOR_LENGTH) return { confidence: 0 };
  return { color: captured.replace(MULTI_SPACE_RE, ' '), confidence: COLOR_CONFIDENCE.label };
}

function matchColorFromPhrases(text: string): { color?: string; confidence: number } {
  let found: string | undefined;
  for (const phrase of COLOR_PHRASES.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');
    if (pattern.test(text)) {
      found = phrase;
      break;
    }
  }
  if (!found) return { confidence: 0 };
  return { color: found, confidence: COLOR_CONFIDENCE.phrase };
}

function matchColorFromBases(text: string): { color?: string; confidence: number } {
  for (const base of BASE_COLORS) {
    const pattern = new RegExp(`\\b${escapeRegex(base)}\\b`, 'i');
    if (pattern.test(text)) {
      return { color: base, confidence: COLOR_CONFIDENCE.base };
    }
  }
  return { confidence: 0 };
}

function combineConfidence(...scores: number[]): number {
  return Math.max(0, Math.min(1, scores.reduce((acc, score) => Math.max(acc, score), 0)));
}

export function parseFreeform(text: string): ParseResult {
  if (!text || !text.trim()) {
    return { confidence: { type: 0, color: 0 } };
  }

  const normalized = preprocessText(text);
  const typeMatch = matchType(normalized);

  const labelMatch = matchColorFromLabel(normalized);
  const phraseMatch = matchColorFromPhrases(normalized);
  const baseMatch = matchColorFromBases(normalized);
  const colorMatch = labelMatch.color
    ? labelMatch
    : phraseMatch.color
    ? phraseMatch
    : baseMatch;

  const normalizedType = typeMatch.label ? normalizeToCanonArticle(typeMatch.label) : null;
  const normalizedColor = colorMatch.color ? normalizeMultiColor(colorMatch.color) : null;

  return {
    type: normalizedType ?? undefined,
    color: normalizedColor ?? undefined,
    confidence: {
      type: typeMatch.confidence,
      color: combineConfidence(labelMatch.confidence, phraseMatch.confidence, baseMatch.confidence),
    },
  };
}

function gatherFields(product?: {
  name?: string;
  brand?: string;
  colorRaw?: string;
  type?: string;
  breadcrumbs?: string[];
  title?: string;
  description?: string;
}): string[] {
  if (!product) return [];
  const fields: string[] = [];
  if (product.name) fields.push(product.name);
  if (product.brand) fields.push(product.brand);
  if (product.colorRaw) fields.push(product.colorRaw);
  if (product.type) fields.push(product.type);
  if (product.title) fields.push(product.title);
  if (product.description) fields.push(product.description);
  if (Array.isArray(product.breadcrumbs)) fields.push(product.breadcrumbs.join(' '));
  return fields.filter((field) => typeof field === 'string' && field.trim().length > 0);
}

export function parseFromProduct(input: {
  name?: string;
  brand?: string;
  colorRaw?: string;
  type?: string;
  breadcrumbs?: string[];
  title?: string;
  description?: string;
}): ParseResult {
  const fields = gatherFields(input);
  if (!fields.length) {
    return { confidence: { type: 0, color: 0 } };
  }

  const combined = preprocessText(fields.join(' '));
  const baseResult = parseFreeform(combined);
  let parsedType = baseResult.type ?? undefined;
  let parsedColor = baseResult.color ?? undefined;

  if ((!parsedColor || parsedColor.length === 0) && input?.colorRaw) {
    const colorCandidate = preprocessText(input.colorRaw);
    const labelMatch = matchColorFromLabel(colorCandidate);
    const phraseMatch = matchColorFromPhrases(colorCandidate);
    const baseMatch = matchColorFromBases(colorCandidate);
    const candidateColor = labelMatch.color ?? phraseMatch.color ?? baseMatch.color;
    if (candidateColor) {
      const canonical = normalizeMultiColor(candidateColor);
      if (canonical) {
        parsedColor = canonical;
        baseResult.confidence.color = combineConfidence(
          baseResult.confidence.color,
          labelMatch.confidence,
          phraseMatch.confidence,
          baseMatch.confidence
        );
      }
    }
  }

  if ((!parsedType || parsedType.length === 0) && input?.type) {
    const canonicalType = normalizeToCanonArticle(input.type);
    if (canonicalType) {
      parsedType = canonicalType;
      if (baseResult.confidence.type < 0.6) {
        baseResult.confidence.type = 0.6;
      }
    }
  }

  return {
    type: parsedType ?? undefined,
    color: parsedColor ?? undefined,
    confidence: baseResult.confidence,
  };
}
