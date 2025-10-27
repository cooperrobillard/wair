// Canonical list (align with your Phase 5 color facet keys)
const CANONICAL = [
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

type CanonicalColor = (typeof CANONICAL)[number];

const ALIASES: Record<string, CanonicalColor> = {
  // neutrals
  "off white": "Off-White",
  "off-white": "Off-White",
  ivory: "Ivory",
  cream: "Ivory",
  bone: "Ivory",
  ecru: "Ivory",

  beige: "Beige",
  camel: "Tan",
  khaki: "Tan",
  tan: "Tan",
  "light tan": "Tan",
  stone: "Beige",
  sand: "Beige",
  oatmeal: "Beige",
  taupe: "Beige",

  "charcoal gray": "Charcoal",
  "dark gray": "Charcoal",
  "light grey": "Light Gray",
  grey: "Light Gray",

  // blues/greens
  "navy blue": "Navy",
  midnight: "Navy",
  cobalt: "Blue",
  "royal blue": "Blue",
  "sky blue": "Blue",
  "baby blue": "Blue",
  "light blue": "Blue",
  teal: "Teal",
  aqua: "Teal",
  turquoise: "Teal",
  "olive green": "Olive",
  forest: "Green",
  sage: "Green",
  "army green": "Olive",
  denim: "Denim",
  indigo: "Blue",

  // reds/oranges/yellows
  maroon: "Burgundy",
  wine: "Burgundy",
  oxblood: "Burgundy",
  rust: "Rust",
  "burnt orange": "Rust",
  mustard: "Yellow",
  gold: "Yellow",

  // misc
  magenta: "Pink",
  lilac: "Purple",
  violet: "Purple",
};

function toKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeColorStd(input?: string | null): CanonicalColor | null {
  if (!input) return null;
  const key = toKey(input);

  // 1) exact canonical match
  const exact = CANONICAL.find((c) => toKey(c) === key);
  if (exact) return exact;

  // 2) alias map
  if (ALIASES[key]) return ALIASES[key];

  // 3) heuristic single-word fallbacks
  if (key.includes("navy")) return "Navy";
  if (key.includes("olive")) return "Olive";
  if (key.includes("denim")) return "Denim";
  if (key.includes("charcoal")) return "Charcoal";
  if (key.includes("gray") || key.includes("grey")) return "Light Gray";
  if (key.includes("off white") || key.includes("off-white")) return "Off-White";
  if (key.includes("ivory") || key.includes("cream") || key.includes("ecru") || key.includes("bone"))
    return "Ivory";
  if (key.includes("khaki") || key.includes("tan")) return "Tan";
  if (
    key.includes("beige") ||
    key.includes("stone") ||
    key.includes("sand") ||
    key.includes("oatmeal") ||
    key.includes("taupe")
  )
    return "Beige";
  if (key.includes("blue")) return "Blue";
  if (key.includes("green")) return "Green";
  if (key.includes("red")) return "Red";
  if (key.includes("burgundy") || key.includes("maroon") || key.includes("wine")) return "Burgundy";
  if (key.includes("orange") || key.includes("rust")) return "Orange";
  if (key.includes("yellow") || key.includes("mustard")) return "Yellow";
  if (key.includes("purple") || key.includes("violet") || key.includes("lilac")) return "Purple";
  if (key.includes("pink") || key.includes("magenta")) return "Pink";
  if (key.includes("brown")) return "Brown";
  if (key.includes("black")) return "Black";
  if (key.includes("white")) return "White";

  // 4) unknown
  return null;
}

// Prefer explicit colorStd from UI/AI, else colorRaw, else null
export function deriveColorStd(colorStdInput?: string | null, colorRaw?: string | null) {
  return normalizeColorStd(colorStdInput ?? colorRaw ?? null);
}

export { CANONICAL as CANONICAL_COLORS };

const DBG = process.env.WAIR_DEBUG_COLOR === "1";
export function debugColor(step: string, data: unknown) {
  if (DBG) {
    console.log(`[color] ${step}`, data);
  }
}
