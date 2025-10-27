const TYPES = [
  // Tops
  "T-Shirt",
  "Long Sleeve Shirt",
  "Polo Shirt",
  "Button-Up Shirt",
  "Blouse",
  "Tank Top",
  "Crop Top",
  "Sweatshirt",
  "Hoodie",
  "Sweater",
  "Cardigan",
  "Jacket",
  "Coat",
  "Blazer",
  "Vest",
  // Bottoms
  "Jeans",
  "Dress Pants",
  "Slacks",
  "Chinos",
  "Joggers",
  "Sweatpants",
  "Shorts",
  "Skirt",
  "Leggings",
  "Cargo Pants",
  // One-pieces
  "Dress",
  "Jumpsuit",
  "Rompers",
  "Overalls",
  // Shoes
  "Sneakers",
  "Dress Shoes",
  "Loafers",
  "Boots",
  "Sandals",
  "Heels",
  "Flats",
  "Slides",
  "Running Shoes",
] as const;

export type CanonicalType = (typeof TYPES)[number];

const normKey = (value?: string | null) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const ALIASES: Record<string, CanonicalType> = {
  // Tops
  tee: "T-Shirt",
  "t-shirt": "T-Shirt",
  tshirt: "T-Shirt",
  "long sleeve tee": "Long Sleeve Shirt",
  "long sleeve": "Long Sleeve Shirt",
  "long-sleeve": "Long Sleeve Shirt",
  "polo": "Polo Shirt",
  "polo shirt": "Polo Shirt",
  "button down": "Button-Up Shirt",
  "button-down": "Button-Up Shirt",
  "button up": "Button-Up Shirt",
  "button-up": "Button-Up Shirt",
  oxford: "Button-Up Shirt",
  blouse: "Blouse",
  tank: "Tank Top",
  "tank top": "Tank Top",
  crop: "Crop Top",
  "crop top": "Crop Top",
  crewneck: "Sweatshirt",
  sweatshirt: "Sweatshirt",
  "hooded sweatshirt": "Hoodie",
  hoodie: "Hoodie",
  sweater: "Sweater",
  pullover: "Sweater",
  cardigan: "Cardigan",
  jacket: "Jacket",
  coat: "Coat",
  blazer: "Blazer",
  vest: "Vest",

  // Bottoms
  jeans: "Jeans",
  denim: "Jeans",
  "dress pants": "Dress Pants",
  "dress pants / slacks": "Dress Pants",
  "dress pants/slacks": "Dress Pants",
  slacks: "Slacks",
  trousers: "Dress Pants",
  chino: "Chinos",
  chinos: "Chinos",
  joggers: "Joggers",
  sweatpants: "Sweatpants",
  "sweat pants": "Sweatpants",
  "track pants": "Sweatpants",
  shorts: "Shorts",
  skirt: "Skirt",
  leggings: "Leggings",
  "yoga pants": "Leggings",
  "cargo pants": "Cargo Pants",

  // One-pieces
  dress: "Dress",
  jumpsuit: "Jumpsuit",
  romper: "Rompers",
  rompers: "Rompers",
  overall: "Overalls",
  overalls: "Overalls",

  // Shoes
  sneakers: "Sneakers",
  sneaker: "Sneakers",
  "tennis shoes": "Sneakers",
  "dress shoes": "Dress Shoes",
  loafers: "Loafers",
  boots: "Boots",
  sandals: "Sandals",
  heels: "Heels",
  flats: "Flats",
  slides: "Slides",
  "slide sandals": "Slides",
  "running shoes": "Running Shoes",
  runners: "Running Shoes",
  trainers: "Running Shoes",
};

export function normalizeArticleType(input?: string | null): CanonicalType | null {
  const key = normKey(input);
  if (!key) return null;

  const exact = TYPES.find((type) => normKey(type) === key);
  if (exact) return exact;

  if (ALIASES[key]) return ALIASES[key];

  return null;
}

export { TYPES as CANONICAL_TYPES };
