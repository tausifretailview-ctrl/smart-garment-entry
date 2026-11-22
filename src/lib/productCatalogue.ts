/**
 * Product Catalogue: products with photo, sizes in stock and price, as an A4 PDF to send a customer
 * (WhatsApp / share / download). Pure helpers + the PDF writer; the page is ProductCatalogue.tsx.
 */
import { format } from "date-fns";
import { sizeMatrixKey, sortSizes } from "@/utils/sizeSort";
import { fitImageInBox, isUsableImageUrl, loadImagesForPdf, type PdfImage } from "@/lib/productImages";

export type CatalogueProduct = {
  id: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
  image_url?: string | null;
  default_sale_price?: number | null;
};

export type CatalogueVariant = {
  product_id: string;
  size?: string | null;
  color?: string | null;
  stock_qty?: number | null;
  sale_price?: number | null;
  mrp?: number | null;
};

export type CatalogueItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  style: string;
  imageUrl: string | null;
  /** Sizes with stock (every size when the stock filter is All or Out of stock), garment order. */
  sizes: string[];
  /** Quantity in hand per size, same order as `sizes`. */
  sizeStock: Array<{ size: string; qty: number }>;
  colors: string[];
  stock: number;
  salePrice: { min: number; max: number } | null;
  mrp: { min: number; max: number } | null;
};

export type CataloguePriceMode = "sale" | "mrp" | "both" | "none";

/** Stock filter buttons: in stock (default), low stock, out of stock, or everything. */
export type CatalogueStockFilter = "in" | "low" | "out" | "all";
/** A product with this many pieces or fewer (but some) counts as low stock. */
export const CATALOGUE_LOW_STOCK = 5;

export function catalogueStockStatus(stock: number): Exclude<CatalogueStockFilter, "all"> {
  if (stock <= 0) return "out";
  return stock <= CATALOGUE_LOW_STOCK ? "low" : "in";
}

/** Does a product with `stock` pieces pass the filter? "In stock" includes low stock. */
export function passesCatalogueStockFilter(stock: number, filter: CatalogueStockFilter): boolean {
  if (filter === "all") return true;
  if (filter === "out") return stock <= 0;
  if (filter === "low") return catalogueStockStatus(stock) === "low";
  return stock > 0;
}

const range = (values: number[]) => {
  const v = values.filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
};

export type CatalogueBuildOptions = {
  /** Stock filter; `onlyInStock` is the older on/off form (true = "in", false = "all"). */
  stock?: CatalogueStockFilter;
  onlyInStock?: boolean;
  onlyWithPhoto: boolean;
  images?: ReadonlyMap<string, string>;
};

export function buildCatalogueItems(
  products: CatalogueProduct[],
  variants: CatalogueVariant[],
  opts: CatalogueBuildOptions,
): CatalogueItem[] {
  const filter: CatalogueStockFilter = opts.stock ?? (opts.onlyInStock ? "in" : "all");
  const byProduct = new Map<string, CatalogueVariant[]>();
  for (const v of variants) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v);
    byProduct.set(v.product_id, list);
  }
  const items: CatalogueItem[] = [];
  for (const p of products) {
    const imageUrl = (isUsableImageUrl(p.image_url) ? p.image_url : opts.images?.get(p.id)) || null;
    if (opts.onlyWithPhoto && !imageUrl) continue;
    const all = byProduct.get(p.id) ?? [];
    const inStock = all.filter((v) => (Number(v.stock_qty) || 0) > 0);
    const stock = inStock.reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0);
    if (!passesCatalogueStockFilter(stock, filter)) continue;
    // In stock / low stock: only the sizes the shop can sell. All / out of stock: every size.
    const shown = filter === "in" || filter === "low" ? inStock : all;
    const qtyBySize = new Map<string, number>();
    for (const v of shown) {
      const size = sizeMatrixKey(v.size);
      if (!size || size === "—") continue;
      qtyBySize.set(size, (qtyBySize.get(size) ?? 0) + Math.max(0, Number(v.stock_qty) || 0));
    }
    const sizes = sortSizes([...qtyBySize.keys()]);
    const colors = [...new Set(shown.map((v) => (v.color || "").trim()).filter(Boolean))];
    if (colors.length === 0 && p.color?.trim()) colors.push(p.color.trim());
    items.push({
      id: p.id,
      name: p.product_name,
      brand: (p.brand || "").trim(),
      category: (p.category || "").trim(),
      style: (p.style || "").trim(),
      imageUrl,
      sizes,
      sizeStock: sizes.map((size) => ({ size, qty: qtyBySize.get(size) ?? 0 })),
      colors,
      stock,
      salePrice: range(shown.map((v) => Number(v.sale_price))) ?? range([Number(p.default_sale_price)]),
      mrp: range(shown.map((v) => Number(v.mrp))),
    });
  }
  return items;
}

/** How many of the loaded products fall under each stock filter button. */
export function catalogueStockCounts(
  products: CatalogueProduct[],
  variants: CatalogueVariant[],
  opts: Pick<CatalogueBuildOptions, "onlyWithPhoto" | "images">,
): Record<CatalogueStockFilter, number> {
  const counts: Record<CatalogueStockFilter, number> = { in: 0, low: 0, out: 0, all: 0 };
  for (const item of buildCatalogueItems(products, variants, { ...opts, stock: "all" })) {
    counts.all += 1;
    if (item.stock > 0) counts.in += 1;
    if (catalogueStockStatus(item.stock) === "low") counts.low += 1;
    if (item.stock <= 0) counts.out += 1;
  }
  return counts;
}

const rupees = (r: { min: number; max: number } | null) =>
  !r ? "" : r.min === r.max ? `Rs.${Math.round(r.min).toLocaleString("en-IN")}` : `Rs.${Math.round(r.min).toLocaleString("en-IN")} - ${Math.round(r.max).toLocaleString("en-IN")}`;

/** The price line printed on a card for the chosen mode ("" = none). */
export function cataloguePriceLine(item: CatalogueItem, mode: CataloguePriceMode): string {
  if (mode === "none") return "";
  const sale = rupees(item.salePrice);
  const mrp = rupees(item.mrp);
  if (mode === "sale") return sale;
  if (mode === "mrp") return mrp ? `MRP ${mrp}` : sale;
  if (sale && mrp && sale !== mrp) return `${sale}  (MRP ${mrp})`;
  return sale || (mrp ? `MRP ${mrp}` : "");
}

export type CatalogueShop = {
  name: string;
  phone?: string;
  address?: string;
  logoUrl?: string | null;
};

/** 3 × 3 cards per A4 page. */
export const CATALOGUE_COLS = 3;
export const CATALOGUE_ROWS = 3;

/** Writes the catalogue and returns it as a Blob (the page downloads or shares it). */
export async function buildProductCataloguePdf(
  items: CatalogueItem[],
  opts: { shop: CatalogueShop; title?: string; priceMode: CataloguePriceMode; showStock?: boolean; showSizes?: boolean },
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 10;
  const headerH = 20;
  const footerH = 8;
  const gap = 4;
  const cardW = (W - m * 2 - gap * (CATALOGUE_COLS - 1)) / CATALOGUE_COLS;
  const cardH = (H - m * 2 - headerH - footerH - gap * (CATALOGUE_ROWS - 1)) / CATALOGUE_ROWS;
  const photoH = cardH - 22;

  const images = await loadImagesForPdf(items.map((i) => i.imageUrl || ""), 520);
  const logo: PdfImage | undefined = opts.shop.logoUrl
    ? (await loadImagesForPdf([opts.shop.logoUrl], 240)).get(opts.shop.logoUrl)
    : undefined;
  const perPage = CATALOGUE_COLS * CATALOGUE_ROWS;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const title = opts.title?.trim() || "Product Catalogue";

  const header = () => {
    let x = m;
    if (logo) {
      const box = fitImageInBox(logo, m, m, 16, 16);
      doc.addImage(logo.dataUrl, "JPEG", box.x, box.y, box.w, box.h);
      x = m + 19;
    }
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(opts.shop.name || "", x, m + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    const sub = [opts.shop.address, opts.shop.phone ? `Ph: ${opts.shop.phone}` : ""].filter(Boolean).join("   ·   ");
    if (sub) doc.text((doc.splitTextToSize(sub, W - x - m - 50) as string[]).slice(0, 2), x, m + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 61, 62);
    doc.text(title, W - m, m + 6, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(format(new Date(), "dd MMM yyyy"), W - m, m + 11, { align: "right" });
    doc.setDrawColor(15, 61, 62);
    doc.setLineWidth(0.6);
    doc.line(m, m + headerH - 3, W - m, m + headerH - 3);
    doc.setLineWidth(0.2);
  };

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();
    header();
    const slice = items.slice(page * perPage, page * perPage + perPage);
    slice.forEach((item, i) => {
      const col = i % CATALOGUE_COLS;
      const row = Math.floor(i / CATALOGUE_COLS);
      const x = m + col * (cardW + gap);
      const y = m + headerH + row * (cardH + gap);
      doc.setDrawColor(209, 213, 219);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
      const img = item.imageUrl ? images.get(item.imageUrl) : undefined;
      if (img) {
        const box = fitImageInBox(img, x + 1.5, y + 1.5, cardW - 3, photoH - 1.5);
        doc.addImage(img.dataUrl, "JPEG", box.x, box.y, box.w, box.h);
      } else {
        doc.setFillColor(243, 244, 246);
        doc.rect(x + 1.5, y + 1.5, cardW - 3, photoH - 1.5, "F");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text("No photo", x + cardW / 2, y + photoH / 2, { align: "center" });
      }
      let ty = y + photoH + 4.5;
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text((doc.splitTextToSize(item.name, cardW - 4) as string[])[0], x + 2, ty);
      ty += 4.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(75, 85, 99);
      const meta = [item.brand, item.category, item.colors.slice(0, 3).join("/")].filter(Boolean).join(" · ");
      if (meta) doc.text((doc.splitTextToSize(meta, cardW - 4) as string[])[0], x + 2, ty);
      ty += 4;
      if (opts.showSizes !== false && item.sizes.length) {
        doc.setTextColor(31, 41, 55);
        doc.text((doc.splitTextToSize(`Sizes: ${item.sizes.join(", ")}`, cardW - 4) as string[])[0], x + 2, ty);
      }
      ty += 4.6;
      const price = cataloguePriceLine(item, opts.priceMode);
      if (price) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 61, 62);
        doc.text(price, x + 2, ty);
      }
      if (opts.showStock) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text(`Stock ${item.stock}`, x + cardW - 2, ty, { align: "right" });
      }
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`${opts.shop.name || ""}${opts.shop.phone ? `  ·  ${opts.shop.phone}` : ""}`, m, H - m + 2);
    doc.text(`Page ${page + 1} of ${pages}`, W - m, H - m + 2, { align: "right" });
  }
  return doc.output("blob");
}
