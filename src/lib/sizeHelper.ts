/**
 * Store size helper ("Find my size", Street theme product page).
 *
 * The shopper gives height, weight and how they like the fit; the store suggests a size from a
 * size chart ("fits chest up to …" per size) and says whether that size is in stock. The chart
 * is a standard Indian ready-made chart the shop can adjust in Website → Theme. Nothing the
 * shopper enters leaves their phone: it is kept in the browser so other products show "Your size".
 *
 * Saved on organizations.settings.storefront_size_helper and read by the public store through
 * get_org_public_info (20270502120000).
 */
export const STOREFRONT_SIZE_HELPER_KEY = "storefront_size_helper";
export const SIZE_PROFILE_STORAGE_KEY = "st-size-profile-v1";

export type SizeGender = "men" | "women";
export type SizeFit = "snug" | "regular" | "loose";
export type SizeChartId = "men_tops" | "women_tops" | "men_bottoms" | "women_bottoms";
/** Size label → the largest body measure (chest or waist, inches) the size is made for. */
export type SizeChart = Record<string, number>;

export const SIZE_CHART_IDS: SizeChartId[] = ["men_tops", "women_tops", "men_bottoms", "women_bottoms"];
export const SIZE_CHART_LABELS: Record<SizeChartId, string> = {
  men_tops: "Men / unisex tops (chest)",
  women_tops: "Women tops (bust)",
  men_bottoms: "Men bottoms (waist)",
  women_bottoms: "Women bottoms (waist)",
};
/** Letter sizes the shop can adjust, smallest first. */
export const SIZE_CHART_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

/** Standard Indian ready-made sizes: body chest / bust / waist in inches each size fits up to. */
export const STANDARD_SIZE_CHARTS: Record<SizeChartId, SizeChart> = {
  men_tops: { XS: 35, S: 37, M: 39, L: 41, XL: 43, XXL: 45, "3XL": 47, "4XL": 49 },
  women_tops: { XS: 33, S: 35, M: 37, L: 39, XL: 41, XXL: 43, "3XL": 45, "4XL": 47 },
  men_bottoms: { XS: 28, S: 30, M: 32, L: 34, XL: 36, XXL: 38, "3XL": 40, "4XL": 42 },
  women_bottoms: { XS: 26, S: 28, M: 30, L: 32, XL: 34, XXL: 36, "3XL": 38, "4XL": 40 },
};

export type StorefrontSizeHelper = {
  /** Shown unless the shop switches it off. */
  enabled: boolean;
  charts: Record<SizeChartId, SizeChart>;
};

function cloneStandardCharts(): Record<SizeChartId, SizeChart> {
  return {
    men_tops: { ...STANDARD_SIZE_CHARTS.men_tops },
    women_tops: { ...STANDARD_SIZE_CHARTS.women_tops },
    men_bottoms: { ...STANDARD_SIZE_CHARTS.men_bottoms },
    women_bottoms: { ...STANDARD_SIZE_CHARTS.women_bottoms },
  };
}

/** Saved setting → helper config. Missing or malformed values fall back to the standard chart. */
export function parseStorefrontSizeHelper(orgSettings: unknown): StorefrontSizeHelper {
  const charts = cloneStandardCharts();
  const out: StorefrontSizeHelper = { enabled: true, charts };
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return out;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_SIZE_HELPER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const row = raw as Record<string, unknown>;
  if (row.enabled === false) out.enabled = false;
  const savedCharts = row.charts;
  if (savedCharts && typeof savedCharts === "object" && !Array.isArray(savedCharts)) {
    for (const id of SIZE_CHART_IDS) {
      const saved = (savedCharts as Record<string, unknown>)[id];
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) continue;
      for (const size of SIZE_CHART_SIZES) {
        const value = Number((saved as Record<string, unknown>)[size]);
        if (Number.isFinite(value) && value >= 20 && value <= 70) charts[id][size] = Math.round(value * 2) / 2;
      }
    }
  }
  return out;
}

/** What gets saved: the switch, and only the chart values that differ from the standard chart. */
export function serializeStorefrontSizeHelper(helper: StorefrontSizeHelper): Record<string, unknown> {
  const charts: Record<string, SizeChart> = {};
  for (const id of SIZE_CHART_IDS) {
    const changed: SizeChart = {};
    for (const size of SIZE_CHART_SIZES) {
      const value = helper.charts[id]?.[size];
      if (Number.isFinite(value) && value !== STANDARD_SIZE_CHARTS[id][size]) changed[size] = value;
    }
    if (Object.keys(changed).length > 0) charts[id] = changed;
  }
  return Object.keys(charts).length > 0 ? { enabled: helper.enabled, charts } : { enabled: helper.enabled };
}

/* ---------- which chart a product uses ---------- */

const ALPHA_ALIASES: Record<string, string> = { "2XL": "XXL", XXXL: "3XL", XXXXL: "4XL", "1XL": "XL" };
const ALPHA_SIZES = new Set(["XXS", ...SIZE_CHART_SIZES, "5XL"]);

/** "2xl" → "XXL"; null when the label is not a letter size. */
export function alphaSize(label: string): string | null {
  const value = String(label || "").trim().toUpperCase().replace(/\s+/g, "");
  const normal = ALPHA_ALIASES[value] ?? value;
  return ALPHA_SIZES.has(normal) ? normal : null;
}

const KIDS_WORDS = /\b(kid|kids|boy|boys|girl|girls|baby|infant|junior|toddler|child|children|new ?born)\b/i;
const NO_HELPER_WORDS =
  /\b(shoe|shoes|sandal|sandals|slipper|slippers|chappal|footwear|sneaker|sneakers|sock|socks|cap|belt|bra|brief|briefs|panty|innerwear|saree|sari|dupatta|stole|bag|watch)\b/i;
const WOMEN_WORDS =
  /\b(women|womens|woman|ladies|lady|female|kurti|kurtis|lehenga|blouse|gown|anarkali|salwar|suit set|palazzo|leggings?|skirt|top|tops|tunic|dress|dresses|nighty|churidar|sharara|kaftan)\b/i;
const MEN_WORDS = /\b(men|mens|man|gents|male|sherwani|kurta pajama)\b/i;
const BOTTOM_WORDS =
  /\b(jeans?|trousers?|pants?|shorts?|joggers?|chinos?|cargos|track ?pants?|palazzo|leggings?|skirt|pyjama|pajama|lower|lowers|bermuda|capri)\b/i;
/** A top word wins over a bottom word: "kurta pajama" and "shirt pant set" are sized by the top. */
const TOP_WORDS =
  /\b(shirts?|t-?shirts?|tees?|kurtas?|kurtis?|jackets?|blazers?|hoodies?|sweaters?|sweatshirts?|coats?|sherwani|tunic|blouse)\b/i;

export type SizeScale = {
  gender: SizeGender;
  kind: "tops" | "bottoms";
  chartId: SizeChartId;
  /** Letter sizes use the chart; number sizes are the measure itself (40 = chest 40, 32 = waist 32). */
  labels: "alpha" | "numeric";
};

/**
 * The size scale a product uses, or null when the helper cannot honestly suggest a size for it
 * (free size, kids, footwear, mixed or unusual labels).
 */
export function sizeScaleFor(product: { name: string; category?: string | null; sizes: string[] }): SizeScale | null {
  const labels = product.sizes.map((s) => String(s || "").trim().toUpperCase()).filter((s) => s && s !== "FS");
  if (labels.length < 2) return null;
  const words = `${product.name || ""} ${product.category || ""}`;
  if (KIDS_WORDS.test(words) || NO_HELPER_WORDS.test(words)) return null;

  const gender: SizeGender = WOMEN_WORDS.test(words) && !MEN_WORDS.test(words) ? "women" : "men";
  const kind = BOTTOM_WORDS.test(words) && !TOP_WORDS.test(words) ? "bottoms" : "tops";
  const chartId = `${gender}_${kind}` as SizeChartId;

  if (labels.every((l) => alphaSize(l) !== null)) return { gender, kind, chartId, labels: "alpha" };

  const numbers = labels.map((l) => (/^\d{2}(\.5)?$/.test(l) ? Number(l) : NaN));
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  // Number sizes must look like adult chest (34–56) or waist (26–50) inches.
  if (kind === "bottoms" ? min < 26 || max > 50 : min < 34 || max > 56) return null;
  return { gender, kind, chartId, labels: "numeric" };
}

/* ---------- the shopper ---------- */

export type SizeProfile = {
  gender: SizeGender;
  heightCm: number;
  weightKg: number;
  fit: SizeFit;
};

export function isValidSizeProfile(p: Partial<SizeProfile> | null | undefined): p is SizeProfile {
  return (
    !!p &&
    (p.gender === "men" || p.gender === "women") &&
    (p.fit === "snug" || p.fit === "regular" || p.fit === "loose") &&
    Number.isFinite(p.heightCm) &&
    Number.isFinite(p.weightKg) &&
    p.heightCm! >= 120 &&
    p.heightCm! <= 215 &&
    p.weightKg! >= 30 &&
    p.weightKg! <= 180
  );
}

/** The profile kept in the browser, or null when none / unreadable. */
export function parseSizeProfile(raw: string | null | undefined): SizeProfile | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SizeProfile>;
    return isValidSizeProfile(p) ? { gender: p.gender, heightCm: p.heightCm, weightKg: p.weightKg, fit: p.fit } : null;
  } catch {
    return null;
  }
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / 2.54);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/**
 * Body chest / bust and waist (inches) estimated from height and weight. A rule of thumb fitted
 * to common Indian ready-made sizes, good to about one size either way: it is shown to the
 * shopper as a suggestion next to the size chart, never as a guarantee.
 */
export function estimateBody(profile: Pick<SizeProfile, "gender" | "heightCm" | "weightKg">): { chestIn: number; waistIn: number } {
  const { gender, heightCm, weightKg } = profile;
  const chest = gender === "women" ? 21.5 + 0.22 * weightKg : 22 + 0.21 * weightKg + 0.01 * heightCm;
  const waist =
    gender === "women" ? 24.5 + 0.37 * weightKg - 0.11 * heightCm : 30 + 0.36 * weightKg - 0.13 * heightCm;
  const round = (n: number) => Math.round(n * 2) / 2;
  return { chestIn: round(chest), waistIn: round(waist) };
}

const FIT_ALLOWANCE: Record<SizeFit, number> = { snug: -1, regular: 0, loose: 1.5 };

/** The body measure (inches) a size label fits up to on this scale, or null when unknown. */
export function sizeFitsUpTo(label: string, scale: SizeScale, charts: Record<SizeChartId, SizeChart>): number | null {
  if (scale.labels === "numeric") {
    const n = Number(label);
    if (!Number.isFinite(n)) return null;
    // A "40" shirt is cut for chest 38–39; "32" jeans fit waist up to 32.
    return scale.kind === "tops" ? n - 1 : n;
  }
  const size = alphaSize(label);
  if (!size) return null;
  const chart = charts[scale.chartId];
  if (Number.isFinite(chart[size])) return chart[size];
  // Sizes outside the editable list continue the chart in 2-inch steps.
  if (size === "XXS") return chart.XS - 2;
  if (size === "5XL") return chart["4XL"] + 2;
  return null;
}

export type SizeSuggestion = {
  /** The product's own size label to choose. */
  label: string;
  /** The measure used (chest/bust for tops, waist for bottoms), inches. */
  bodyIn: number;
  /** True when the shopper measures above the largest size the product comes in. */
  beyondRange: boolean;
};

/** The smallest of the product's sizes that fits the shopper, with their fit preference applied. */
export function suggestSize(
  productSizes: string[],
  scale: SizeScale,
  profile: SizeProfile,
  charts: Record<SizeChartId, SizeChart>,
): SizeSuggestion | null {
  const body = estimateBody(profile);
  const bodyIn = scale.kind === "tops" ? body.chestIn : body.waistIn;
  const target = bodyIn + FIT_ALLOWANCE[profile.fit];
  const options = productSizes
    .map((label) => ({ label, upTo: sizeFitsUpTo(label, scale, charts) }))
    .filter((o): o is { label: string; upTo: number } => o.upTo !== null)
    .sort((a, b) => a.upTo - b.upTo);
  if (options.length === 0) return null;
  const fit = options.find((o) => o.upTo >= target);
  if (fit) return { label: fit.label, bodyIn, beyondRange: false };
  return { label: options[options.length - 1].label, bodyIn, beyondRange: true };
}

/** Size guide rows for the product's own sizes: label and the measure it fits up to. */
export function sizeGuideRows(
  productSizes: string[],
  scale: SizeScale,
  charts: Record<SizeChartId, SizeChart>,
): Array<{ label: string; inches: number; cm: number }> {
  return productSizes
    .map((label) => ({ label, inches: sizeFitsUpTo(label, scale, charts) }))
    .filter((r): r is { label: string; inches: number } => r.inches !== null)
    .sort((a, b) => a.inches - b.inches)
    .map((r) => ({ ...r, cm: Math.round(r.inches * 2.54) }));
}

/** "chest", "bust" or "waist": the measure this scale goes by. */
export function sizeMeasureName(scale: SizeScale): string {
  if (scale.kind === "bottoms") return "waist";
  return scale.gender === "women" ? "bust" : "chest";
}
