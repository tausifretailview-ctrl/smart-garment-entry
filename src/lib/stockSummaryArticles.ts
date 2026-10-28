import { sortSizes } from "@/utils/sizeSort";

/** One variant row as shown on Stock Summary (same figures as Stock Report's get_stock_report). */
export interface StockSummaryVariant {
  id: string;
  product_name: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  size: string;
  barcode: string;
  uom: string;
  stock_qty: number;
  opening_qty: number;
  purchase_qty: number;
  purchase_return_qty: number;
  sales_qty: number;
  sale_return_qty: number;
  /** Sent to the owner's other shop (only filled when Settings > Stock Transfer is on). */
  transfer_out_qty?: number;
  sale_price: number;
  pur_price: number | null;
}

/**
 * full   – every size of the article is in stock
 * cut    – broken size set: some sizes in stock, others at zero (or below)
 * out    – no size in stock
 * single – only one size exists, so it cannot be "cut"
 */
export type ArticleSizeStatus = "full" | "cut" | "out" | "single";

export interface ArticleSizeCell {
  size: string;
  qty: number;
  variantIds: string[];
}

export interface StockSummaryArticle {
  key: string;
  productName: string;
  brand: string;
  category: string;
  style: string;
  /** Colours in this article (one when grouped by colour). */
  colors: string[];
  sizes: ArticleSizeCell[];
  totalStock: number;
  stockValue: number;
  saleValue: number;
  inStockSizes: string[];
  cutSizes: string[];
  status: ArticleSizeStatus;
  variantIds: string[];
}

export function articleStatus(cells: ArticleSizeCell[]): ArticleSizeStatus {
  if (cells.length === 0) return "out";
  const inStock = cells.filter((c) => c.qty > 0).length;
  if (inStock === 0) return "out";
  if (cells.length === 1) return "single";
  return inStock === cells.length ? "full" : "cut";
}

function norm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Group variants into articles (product + brand + style, and colour when `byColor`) with
 * stock per size. Sizes come from the article's own variants, so a size counts as cut
 * only when the shop stocked it before and it is now at zero.
 */
export function buildStockSummaryArticles(
  variants: StockSummaryVariant[],
  options: { byColor: boolean },
): StockSummaryArticle[] {
  const groups = new Map<
    string,
    {
      first: StockSummaryVariant;
      colors: string[];
      bySize: Map<string, ArticleSizeCell>;
      stockValue: number;
      saleValue: number;
      variantIds: string[];
    }
  >();

  for (const v of variants) {
    const parts = [norm(v.product_name), norm(v.brand), norm(v.style)];
    if (options.byColor) parts.push(norm(v.color));
    const key = parts.join("\u0001");
    let g = groups.get(key);
    if (!g) {
      g = { first: v, colors: [], bySize: new Map(), stockValue: 0, saleValue: 0, variantIds: [] };
      groups.set(key, g);
    }
    const color = v.color.trim();
    if (color && !g.colors.some((c) => norm(c) === norm(color))) g.colors.push(color);
    const sizeLabel = v.size.trim() || "—";
    const sizeKey = norm(sizeLabel);
    let cell = g.bySize.get(sizeKey);
    if (!cell) {
      cell = { size: sizeLabel, qty: 0, variantIds: [] };
      g.bySize.set(sizeKey, cell);
    }
    cell.qty += v.stock_qty;
    cell.variantIds.push(v.id);
    g.variantIds.push(v.id);
    g.stockValue += (v.pur_price || 0) * v.stock_qty;
    g.saleValue += (v.sale_price || 0) * v.stock_qty;
  }

  const articles: StockSummaryArticle[] = [];
  for (const [key, g] of groups) {
    const order = sortSizes([...g.bySize.values()].map((c) => c.size));
    const sizes = order.map((s) => g.bySize.get(norm(s))!);
    articles.push({
      key,
      productName: g.first.product_name,
      brand: g.first.brand,
      category: g.first.category,
      style: g.first.style,
      colors: g.colors,
      sizes,
      totalStock: sizes.reduce((s, c) => s + c.qty, 0),
      stockValue: g.stockValue,
      saleValue: g.saleValue,
      inStockSizes: sizes.filter((c) => c.qty > 0).map((c) => c.size),
      cutSizes: sizes.filter((c) => c.qty <= 0).map((c) => c.size),
      status: articleStatus(sizes),
      variantIds: g.variantIds,
    });
  }

  return articles.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.brand.localeCompare(b.brand) ||
      (a.colors[0] || "").localeCompare(b.colors[0] || ""),
  );
}

export interface ArticleStatusCounts {
  all: number;
  full: number;
  cut: number;
  out: number;
  single: number;
}

export function countArticleStatuses(articles: StockSummaryArticle[]): ArticleStatusCounts {
  const counts: ArticleStatusCounts = { all: articles.length, full: 0, cut: 0, out: 0, single: 0 };
  for (const a of articles) counts[a.status] += 1;
  return counts;
}
