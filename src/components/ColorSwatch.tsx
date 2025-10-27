"use client";

import * as React from "react";
import { hexForLoose } from "@/lib/colors";

function isLight(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 200;
}

type ColorSwatchProps = {
  label?: string | null;
  size?: number;
  className?: string;
};

export default function ColorSwatch({ label, size = 12, className = "" }: ColorSwatchProps) {
  if (!label) return null;
  const hex = hexForLoose(label);
  if (!hex) return null;

  const side = `${size}px`;
  const light = isLight(hex);

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block rounded-full align-middle ${className}`}
      style={{
        width: side,
        height: side,
        background: hex,
        border: light ? "1px solid #D1D5DB" : "1px solid rgba(0,0,0,0.2)",
        boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.05)",
      }}
    />
  );
}
