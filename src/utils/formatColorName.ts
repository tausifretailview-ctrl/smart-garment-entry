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
};

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
