const CANON_COLOR_LIST = [
  "Black",
  "Charcoal",
  "Light Gray",
  "White",
  "Ivory / Off-White",
  "Beige / Tan",
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
  "soft white": "Ivory / Off-White",
  "off white": "Ivory / Off-White",
  "off-white": "Ivory / Off-White",
  ivory: "Ivory / Off-White",
  cream: "Ivory / Off-White",
  beige: "Beige / Tan",
  tan: "Beige / Tan",
  camel: "Beige / Tan",
  khaki: "Beige / Tan",
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

const CANON_ARTICLE_LIST = [
  'T-Shirt',
  'Long Sleeve Shirt',
  'Polo Shirt',
  'Button-Up Shirt',
  'Blouse',
  'Tank Top',
  'Crop Top',
  'Sweatshirt',
  'Hoodie',
  'Sweater',
  'Cardigan',
  'Jacket',
  'Coat',
  'Blazer',
  'Vest',
  'Jeans',
  'Dress Pants / Slacks',
  'Chinos',
  'Joggers',
  'Sweatpants',
  'Shorts',
  'Skirt',
  'Leggings',
  'Cargo Pants',
  'Dress',
  'Jumpsuit',
  'Romper',
  'Overalls',
  'Sneakers',
  'Dress Shoes',
  'Loafers',
  'Boots',
  'Sandals',
  'Heels',
  'Flats',
  'Slides',
  'Running Shoes',
] as const;

export const CANON_ARTICLES = CANON_ARTICLE_LIST;
export type CanonArticle = typeof CANON_ARTICLES[number];

const ARTICLE_ALIAS_MAP: Record<string, CanonArticle> = {
  tee: 'T-Shirt',
  't-shirt': 'T-Shirt',
  tshirt: 'T-Shirt',
  'long sleeve tee': 'Long Sleeve Shirt',
  'long sleeve': 'Long Sleeve Shirt',
  'button-down': 'Button-Up Shirt',
  'button up': 'Button-Up Shirt',
  'button-up': 'Button-Up Shirt',
  oxford: 'Button-Up Shirt',
  blouse: 'Blouse',
  tank: 'Tank Top',
  'tank top': 'Tank Top',
  crop: 'Crop Top',
  'crop top': 'Crop Top',
  crewneck: 'Sweatshirt',
  sweatshirt: 'Sweatshirt',
  hoodie: 'Hoodie',
  sweater: 'Sweater',
  pullover: 'Sweater',
  cardigan: 'Cardigan',
  jacket: 'Jacket',
  coat: 'Coat',
  blazer: 'Blazer',
  vest: 'Vest',
  jeans: 'Jeans',
  denim: 'Jeans',
  'dress pants': 'Dress Pants / Slacks',
  slacks: 'Dress Pants / Slacks',
  chinos: 'Chinos',
  joggers: 'Joggers',
  sweatpants: 'Sweatpants',
  shorts: 'Shorts',
  skirt: 'Skirt',
  leggings: 'Leggings',
  'cargo pants': 'Cargo Pants',
  dress: 'Dress',
  jumpsuit: 'Jumpsuit',
  romper: 'Romper',
  overalls: 'Overalls',
  sneakers: 'Sneakers',
  'dress shoes': 'Dress Shoes',
  loafers: 'Loafers',
  boots: 'Boots',
  sandals: 'Sandals',
  heels: 'Heels',
  flats: 'Flats',
  slides: 'Slides',
  'running shoes': 'Running Shoes',
  trainers: 'Running Shoes',
};

export function normalizeToCanonArticle(input: string | null | undefined): CanonArticle | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const direct = ARTICLE_ALIAS_MAP[normalized];
  if (direct) return direct;
  const matched = CANON_ARTICLES.find((article) => article.toLowerCase() === normalized);
  return matched ?? null;
}
