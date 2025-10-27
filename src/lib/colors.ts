export const COLOR_HEX: Record<string, string> = {
  Black: "#111111",
  Charcoal: "#374151",
  "Light Gray": "#D1D5DB",
  White: "#FFFFFF",

  Ivory: "#F5F1E6",
  "Off-White": "#FAFAF7",
  Beige: "#D9C8A4",
  Tan: "#B8A07A",
  Brown: "#8B5E3C",

  Navy: "#1F2A44",
  Blue: "#2563EB",
  Denim: "#2C3E66",
  Teal: "#14B8A6",
  Olive: "#556B2F",
  Green: "#10B981",

  Red: "#EF4444",
  Burgundy: "#7F1D1D",
  Orange: "#F59E0B",
  Rust: "#B7410E",
  Yellow: "#FDE047",
  Purple: "#8B5CF6",
  Pink: "#F472B6",
};

export function hexFor(color?: string | null): string | null {
  if (!color) return null;
  return COLOR_HEX[color] ?? null;
}

function hashToGray(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  const channel = 180 + (Math.abs(hash) % 50);
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

export function hexForLoose(label?: string | null): string | null {
  if (!label) return null;
  return COLOR_HEX[label] ?? hashToGray(label);
}
