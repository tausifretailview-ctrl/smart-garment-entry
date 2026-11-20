/**
 * Markdown % (wholesale distributors): the sale price stays the list price (1800) and a markdown
 * comes off it on the Sale Bill (brand-wise 25–30%), before any extra discount the user gives.
 *
 *   Sale price 1800 · Markdown 25% → 1350 · extra Disc 5% → 1282.50
 *
 * A product's own markdown (products.markdown_percent) wins; empty = its brand's markdown
 * (brand_markdowns). sale_items.discount_percent keeps the WHOLE line discount (markdown
 * included) so reports, prints and older screens stay right; sale_items.markdown_percent says how
 * much of it is the markdown.
 */

export const MARKDOWN_MAX_PERCENT = 99.99;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Brand names compared without case or extra spaces ("Acme ", "ACME" → "ACME"). */
export function normalizeBrandKey(brand: string | null | undefined): string {
  return String(brand ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** 0 … 99.99, two decimals; anything else is 0. */
export function clampMarkdownPercent(value: unknown): number {
  const n = num(value);
  if (n <= 0) return 0;
  return round2(Math.min(MARKDOWN_MAX_PERCENT, n));
}

/** "" / null → null (follow the brand); otherwise a valid markdown %. */
export function parseProductMarkdownInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  return clampMarkdownPercent(s);
}

export function resolveMarkdownPercent(args: {
  /** products.markdown_percent: null/undefined = not set on the product. */
  productMarkdown: number | null | undefined;
  brand: string | null | undefined;
  brandMarkdowns: ReadonlyMap<string, number>;
}): number {
  if (args.productMarkdown !== null && args.productMarkdown !== undefined) {
    return clampMarkdownPercent(args.productMarkdown);
  }
  return clampMarkdownPercent(args.brandMarkdowns.get(normalizeBrandKey(args.brand)) ?? 0);
}

export type MarkdownLineAmounts = {
  markdownAmount: number;
  afterMarkdown: number;
  /** Extra discount (Disc % or Disc ₹), taken off the price after markdown. */
  extraDiscountAmount: number;
  afterDiscount: number;
};

/** Money for one line: base (price × qty) → markdown → extra discount. */
export function markdownLineAmounts(args: {
  base: number;
  markdownPercent: number;
  discountPercent: number;
  discountAmount: number;
}): MarkdownLineAmounts {
  const base = num(args.base);
  const md = clampMarkdownPercent(args.markdownPercent);
  const markdownAmount = md > 0 ? round2((base * md) / 100) : 0;
  const afterMarkdown = round2(base - markdownAmount);
  const dp = num(args.discountPercent);
  const extraDiscountAmount = dp > 0 ? round2((afterMarkdown * dp) / 100) : round2(num(args.discountAmount));
  return { markdownAmount, afterMarkdown, extraDiscountAmount, afterDiscount: round2(afterMarkdown - extraDiscountAmount) };
}

/**
 * sale_items.discount_percent for a line with markdown: the whole discount as one %.
 * 25% markdown + 5% extra = 28.75%. Without markdown the caller keeps its own rule.
 */
export function combinedDiscountPercent(args: {
  base: number;
  markdownPercent: number;
  discountPercent: number;
  discountAmount: number;
}): number {
  const md = clampMarkdownPercent(args.markdownPercent);
  const dp = num(args.discountPercent);
  if (dp > 0) return Math.round((100 - ((100 - md) * (100 - dp)) / 100) * 1e4) / 1e4;
  if (md > 0 && num(args.discountAmount) <= 0) return md;
  const base = num(args.base);
  if (base <= 0) return md;
  const a = markdownLineAmounts(args);
  return Math.round(((a.markdownAmount + a.extraDiscountAmount) / base) * 1e6) / 1e4;
}

function tidyPercent(p: number): number {
  const two = round2(p);
  return Math.abs(p - two) < 0.001 ? two : Math.round(p * 1e4) / 1e4;
}

/**
 * Opening a saved bill: split the stored whole-line discount back into markdown + extra.
 * `fields` is what hydrateSaleItemDiscountFields restored (whole discount, % or ₹).
 */
export function splitMarkdownFromSavedLine(
  fields: { discountPercent: number; discountAmount: number },
  markdownPercent: number | null | undefined,
  base: number,
): { markdownPercent: number; discountPercent: number; discountAmount: number } {
  const md = clampMarkdownPercent(markdownPercent);
  if (md <= 0) return { markdownPercent: 0, discountPercent: fields.discountPercent, discountAmount: fields.discountAmount };
  if (num(fields.discountPercent) > 0) {
    const extra = (1 - (100 - num(fields.discountPercent)) / (100 - md)) * 100;
    return { markdownPercent: md, discountPercent: extra > 0.0001 ? tidyPercent(extra) : 0, discountAmount: 0 };
  }
  const markdownAmount = round2((num(base) * md) / 100);
  const extra = round2(num(fields.discountAmount) - markdownAmount);
  return { markdownPercent: md, discountPercent: 0, discountAmount: extra > 0.005 ? extra : 0 };
}
