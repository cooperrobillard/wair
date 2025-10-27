const CANON_COLOR_LIST = [
  "Black",
  "Charcoal",
  "Light Gray",
  "White",
  "Ivory",
  "Off-White",
  "Beige",
  "Tan",
  "Brown",
  "Navy",
  "Olive",
  "Denim",
  "Red",
  "Burgundy",
  "Orange",
  "Rust",
  "Yellow",
  "Green",
  "Teal",
  "Blue",
  "Purple",
  "Pink",
] as const;

export const CANON_COLORS = CANON_COLOR_LIST;
export type CanonColor = typeof CANON_COLORS[number];

const COLOR_ALIAS_MAP: Record<string, CanonColor> = {
  black: "Black",
  "jet black": "Black",
  "faded black": "Black",
  "washed black": "Black",
  "soft black": "Black",
  charcoal: "Charcoal",
  "charcoal grey": "Charcoal",
  "charcoal gray": "Charcoal",
  "dark grey": "Charcoal",
  "dark gray": "Charcoal",
  "heather gray": "Light Gray",
  "heather grey": "Light Gray",
  "light grey": "Light Gray",
  "light gray": "Light Gray",
  grey: "Light Gray",
  gray: "Light Gray",
  white: "White",
  "soft white": "Off-White",
  "off white": "Off-White",
  "off-white": "Off-White",
  ivory: "Ivory",
  cream: "Ivory",
  bone: "Ivory",
  ecru: "Ivory",
  beige: "Beige",
  stone: "Beige",
  sand: "Beige",
  oatmeal: "Beige",
  taupe: "Beige",
  tan: "Tan",
  camel: "Tan",
  khaki: "Tan",
  "light tan": "Tan",
  brown: "Brown",
  espresso: "Brown",
  chocolate: "Brown",
  navy: "Navy",
  "tapestry navy": "Navy",
  "preppy navy": "Navy",
  "deep navy": "Navy",
  "dark navy": "Navy",
  "midnight navy": "Navy",
  olive: "Olive",
  "army green": "Olive",
  "hunter green": "Olive",
  "sage green": "Olive",
  denim: "Denim",
  indigo: "Denim",
  red: "Red",
  scarlet: "Red",
  crimson: "Red",
  burgundy: "Burgundy",
  maroon: "Burgundy",
  orange: "Orange",
  rust: "Rust",
  copper: "Rust",
  yellow: "Yellow",
  mustard: "Yellow",
  gold: "Yellow",
  green: "Green",
  emerald: "Green",
  forest: "Green",
  teal: "Teal",
  turquoise: "Teal",
  blue: "Blue",
  cobalt: "Blue",
  royal: "Blue",
  "royal blue": "Blue",
  purple: "Purple",
  lavender: "Purple",
  lilac: "Purple",
  violet: "Purple",
  pink: "Pink",
  "dusty pink": "Pink",
  "pastel pink": "Pink",
  blush: "Pink",
};

export function normalizeToCanonColor(input: string | null | undefined): CanonColor | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const direct = COLOR_ALIAS_MAP[normalized];
  if (direct) return direct;
  const matched = CANON_COLORS.find((color) => color.toLowerCase() === normalized);
  return matched ?? null;
}

const MULTI_COLOR_SPLIT_RE = /[\/&+,]|\band\b/i;

export function normalizeMultiColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;

  const pieces = normalized
    .split(MULTI_COLOR_SPLIT_RE)
    .map((segment) => normalizeToCanonColor(segment))
    .filter((value): value is CanonColor => value != null);

  const deduped: CanonColor[] = [];
  for (const color of pieces) {
    if (!deduped.includes(color)) deduped.push(color);
    if (deduped.length === 2) break;
  }

  if (deduped.length === 0) {
    const fallback = normalizeToCanonColor(normalized);
    return fallback ?? null;
  }

  return deduped.join(' / ');
}
