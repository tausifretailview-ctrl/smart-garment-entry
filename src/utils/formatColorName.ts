/** Short color codes used on variants (BK, BR) mapped to readable labels. */
const COLOR_ABBREV: Record<string, string> = {
  BK: "Black",
  BL: "Blue",
  GR: "Green",
  GY: "Gray",
  RD: "Red",
  WH: "White",
  YL: "Yellow",
  OR: "Orange",
  PK: "Pink",
  PR: "Purple",
  BR: "Brown",
  NV: "Navy",
  MHD: "Mahendi",
  MRN: "Maroon",
  CR: "Cream",
  BG: "Beige",
  LB: "Light Blue",
  DG: "Dark Green",
  OL: "Olive",
  TN: "Tan",
  CL: "Coral",
  LV: "Lavender",
  WT: "White",
};

/** Actual swatch colors for product labels. Keys are lowercase readable names. */
const COLOR_SWATCH: Record<string, string> = {
  black: "#111827",
  blue: "#2563eb",
  green: "#15803d",
  gray: "#6b7280",
  grey: "#6b7280",
  red: "#dc2626",
  white: "#f8fafc",
  yellow: "#eab308",
  orange: "#ea580c",
  pink: "#db2777",
  purple: "#7c3aed",
  brown: "#78350f",
  navy: "#1e3a8a",
  mahendi: "#4d7c0f",
  mehendi: "#4d7c0f",
  maroon: "#7f1d1d",
  cream: "#f3e5c4",
  beige: "#d6c4a8",
  beije: "#d6c4a8",
  "light blue": "#38bdf8",
  "dark green": "#14532d",
  olive: "#3f6212",
  tan: "#c4a574",
  coral: "#e11d48",
  lavender: "#a78bfa",
  peach: "#fb923c",
  gold: "#d4a017",
  pista: "#65a30d",
  pistachio: "#65a30d",
  sandrift: "#c2b280",
  sand: "#c2b280",
  "g metal": "#52606d",
  gunmetal: "#52606d",
  "gun metal": "#52606d",
  mauve: "#a8557a",
  nutshell: "#8b5a2b",
  nutshel: "#8b5a2b",
  "s green": "#166534",
  "sea green": "#0f766e",
  "navy pink": "#be185d",
  silver: "#94a3b8",
  coffee: "#6f4e37",
  chocolate: "#5c3317",
  mustard: "#ca8a04",
  wine: "#881337",
  rust: "#c2410c",
  teal: "#0f766e",
  sky: "#0284c7",
  rose: "#e11d48",
  magenta: "#c026d3",
  khaki: "#a39264",
  camel: "#c19a6b",
  ivory: "#f5f0e1",
  charcoal: "#334155",
  copper: "#b45309",
  bronze: "#a16207",
};

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function swatchHex(label: string): string | undefined {
  const key = label.trim().toLowerCase();
  if (COLOR_SWATCH[key]) return COLOR_SWATCH[key];
  const words = key.split(/\s+/).filter(Boolean);
  for (let size = words.length; size >= 1; size -= 1) {
    for (let i = 0; i <= words.length - size; i += 1) {
      const phrase = words.slice(i, i + size).join(" ");
      if (COLOR_SWATCH[phrase]) return COLOR_SWATCH[phrase];
    }
  }
  return undefined;
}

/** Background is the real color. Text is white on dark swatches and dark on light ones. */
export function colorChipStyle(label: string): { backgroundColor: string; color: string } {
  const backgroundColor = swatchHex(label) ?? "#64748b";
  const color = relativeLuminance(backgroundColor) > 0.62 ? "#1f2937" : "#ffffff";
  return { backgroundColor, color };
}

/** Format one color code or a joined string into a readable name. */
export function formatColorName(color: string): string {
  if (!color) return "";
  const parts = color.split(/[.,/\\-]/).map((p) => p.trim()).filter(Boolean);
  const formatted = parts.map((part) => {
    const upper = part.toUpperCase();
    return COLOR_ABBREV[upper] || part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });
  return formatted.join(" / ");
}

/** Unique readable color labels, preserving first-seen order. */
export function distinctColorLabels(colors: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of colors) {
    const label = formatColorName(raw || "");
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}
