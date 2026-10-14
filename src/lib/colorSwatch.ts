/**
 * Map a product colour name ("NAVY BLUE", "Rani Pink", "RED/BLACK") to CSS colours for a
 * swatch dot. Unknown names return no colours so the caller shows the text alone.
 */

/** Shop colour names that are not CSS keywords (or mean something different in CSS). */
const NAMED_COLORS: Record<string, string> = {
  white: "#ffffff",
  offwhite: "#f5f1e6",
  "off white": "#f5f1e6",
  cream: "#f3e9c6",
  ivory: "#fffff0",
  black: "#111111",
  grey: "#8a8f98",
  gray: "#8a8f98",
  "dark grey": "#4b5058",
  "light grey": "#c9cdd2",
  silver: "#c0c0c0",
  charcoal: "#36454f",
  red: "#d32f2f",
  maroon: "#7b1e2b",
  wine: "#6d1a36",
  "wine red": "#6d1a36",
  burgundy: "#800020",
  rust: "#b7410e",
  pink: "#f48fb1",
  "baby pink": "#f8c8d8",
  "light pink": "#f8c8d8",
  "rani pink": "#e0218a",
  rani: "#e0218a",
  magenta: "#d81b84",
  gajri: "#e94e77",
  peach: "#ffcba4",
  coral: "#ff7f50",
  orange: "#f57c00",
  yellow: "#fbc02d",
  lemon: "#fff44f",
  mustard: "#d4a017",
  gold: "#d4af37",
  golden: "#d4af37",
  copper: "#b87333",
  beige: "#e8d8b8",
  khaki: "#c3b091",
  fawn: "#e5aa70",
  skin: "#f1c27d",
  nude: "#e3bc9a",
  camel: "#c19a6b",
  brown: "#795548",
  "dark brown": "#4e342e",
  "light brown": "#a1887f",
  coffee: "#6f4e37",
  chocolate: "#5d3a1a",
  tan: "#d2b48c",
  green: "#388e3c",
  "dark green": "#1b5e20",
  "light green": "#9ccc65",
  "bottle green": "#006a4e",
  "parrot green": "#4cbb17",
  "pista": "#b5d99c",
  "pista green": "#b5d99c",
  mehendi: "#7a8b2a",
  mehndi: "#7a8b2a",
  olive: "#708238",
  "olive green": "#708238",
  mint: "#98ff98",
  "sea green": "#2e8b57",
  "rama green": "#2a9d8f",
  rama: "#2a9d8f",
  teal: "#008080",
  turquoise: "#30d5c8",
  firozi: "#30d5c8",
  aqua: "#00bcd4",
  blue: "#1e63d6",
  "royal blue": "#2a52be",
  "navy blue": "#1a2a5a",
  navy: "#1a2a5a",
  "dark blue": "#0d2c6b",
  "light blue": "#90caf9",
  "sky blue": "#87ceeb",
  sky: "#87ceeb",
  "ice blue": "#cfe8f6",
  "denim": "#1560bd",
  "ink blue": "#1f2f6b",
  "peacock blue": "#005f73",
  "peacock": "#005f73",
  purple: "#7b1fa2",
  violet: "#8e44ad",
  lavender: "#c3b1e1",
  lilac: "#c8a2c8",
  onion: "#c9a0a6",
  "onion pink": "#c9a0a6",
  mauve: "#b784a7",
  "dusty pink": "#d4a5a5",
  multi: "",
  multicolor: "",
  multicolour: "",
  "multi color": "",
  "multi colour": "",
  assorted: "",
  printed: "",
};

/** Split "RED/BLACK", "Red & White", "red-blue" into parts. */
function splitColorParts(name: string): string[] {
  return name
    .split(/\s*(?:\/|\+|&|,|\band\b|\s-\s)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function cssKeywordColor(name: string): string | null {
  const key = name.replace(/\s+/g, "").toLowerCase();
  if (!/^[a-z]+$/.test(key)) return null;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", key) ? key : null;
  }
  return null;
}

function resolveOne(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(name)) return name;
  if (name in NAMED_COLORS) return NAMED_COLORS[name] || null;
  const css = cssKeywordColor(name);
  if (css) return css;
  // "DARK MAROON", "LT BLUE", "MAROON SHADE": try the last word, then the first.
  const words = name.split(" ");
  if (words.length > 1) {
    const last = words[words.length - 1];
    if (last in NAMED_COLORS) return NAMED_COLORS[last] || null;
    const lastCss = cssKeywordColor(last);
    if (lastCss) return lastCss;
    const first = words[0];
    if (first in NAMED_COLORS) return NAMED_COLORS[first] || null;
  }
  return null;
}

/** Up to 3 CSS colours for a colour name; empty when nothing recognisable. */
export function colorSwatchesFor(name: string | null | undefined): string[] {
  const text = (name || "").trim();
  if (!text) return [];
  const parts = splitColorParts(text);
  if (parts.length < 2) {
    const whole = resolveOne(text);
    return whole ? [whole] : [];
  }
  const out: string[] = [];
  for (const part of parts) {
    const c = resolveOne(part);
    if (c && !out.includes(c)) out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

/** True for very light colours that need a visible border on a white page. */
export function isLightSwatch(color: string): boolean {
  const hex = color.startsWith("#") ? color.slice(1) : "";
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 210;
  }
  return ["white", "ivory", "snow", "ghostwhite", "whitesmoke", "seashell", "linen", "beige", "lightyellow"].includes(color);
}
