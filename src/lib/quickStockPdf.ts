/**
 * Quick Stock → PDF (A4 portrait), one row per size, with the product photo when there is one.
 * Rows with no photo keep the plain layout; the Photo column only appears when any row has one.
 */
import { format } from "date-fns";
import { fitImageInBox, isUsableImageUrl, loadImagesForPdf } from "@/lib/productImages";

export type QuickStockPdfRow = {
  product: string;
  barcode: string;
  size: string;
  stock: number;
  purPrice?: number | null;
  mrp?: number | null;
  salePrice?: number | null;
  imageUrl?: string | null;
};

const money = (n?: number | null) => (n == null || Number.isNaN(Number(n)) ? "-" : `Rs.${Number(n).toLocaleString("en-IN")}`);

export async function exportQuickStockPdf(rows: QuickStockPdfRow[], opts: { title?: string; search?: string } = {}) {
  if (rows.length === 0) return;
  const { default: jsPDF } = await import("jspdf");
  const hasImages = rows.some((r) => isUsableImageUrl(r.imageUrl));
  const images = hasImages ? await loadImagesForPdf(rows.map((r) => r.imageUrl || ""), 200) : new Map();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 10;

  const cols: Array<{ key: string; label: string; w: number; align?: "left" | "center" | "right" }> = [
    ...(hasImages ? [{ key: "photo", label: "Photo", w: 16, align: "center" as const }] : []),
    { key: "product", label: "Product", w: 0 },
    { key: "barcode", label: "Barcode", w: 26 },
    { key: "size", label: "Size", w: 14, align: "center" },
    { key: "stock", label: "Stock", w: 14, align: "right" },
    { key: "pur", label: "Pur. Price", w: 20, align: "right" },
    { key: "mrp", label: "MRP", w: 18, align: "right" },
    { key: "sale", label: "Sale Price", w: 20, align: "right" },
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols.find((c) => c.key === "product")!.w = pageW - m * 2 - fixed;
  const headH = 7;
  const rowH = hasImages ? 15 : 7;
  const dy = hasImages ? 8.5 : 5;

  let y = m;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.title || "Quick Stock", m, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    [opts.search ? `Search: ${opts.search}` : "", `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`].filter(Boolean).join("   "),
    pageW - m,
    y + 4,
    { align: "right" },
  );
  y += 9;

  const header = () => {
    let x = m;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setDrawColor(200, 200, 200);
    for (const c of cols) {
      doc.setFillColor(37, 99, 235);
      doc.rect(x, y, c.w, headH, "FD");
      const tx = c.align === "right" ? x + c.w - 2 : c.align === "center" ? x + c.w / 2 : x + 2;
      doc.text(c.label, tx, y + 5, { align: c.align || "left" });
      x += c.w;
    }
    y += headH;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
  };
  header();

  let totalQty = 0;
  rows.forEach((r, i) => {
    if (y + rowH > pageH - 14) {
      doc.addPage();
      y = m;
      header();
    }
    totalQty += Number(r.stock) || 0;
    let x = m;
    const shade = i % 2 === 0 ? 249 : 255;
    for (const c of cols) {
      doc.setFillColor(shade, shade, shade);
      doc.rect(x, y, c.w, rowH, "FD");
      if (c.key === "photo") {
        const img = r.imageUrl ? images.get(r.imageUrl) : undefined;
        if (img) {
          const box = fitImageInBox(img, x + 1, y + 1, c.w - 2, rowH - 2);
          doc.addImage(img.dataUrl, "JPEG", box.x, box.y, box.w, box.h);
        }
      } else {
        const value =
          c.key === "product" ? r.product
          : c.key === "barcode" ? r.barcode || "-"
          : c.key === "size" ? r.size || "-"
          : c.key === "stock" ? String(r.stock)
          : c.key === "pur" ? money(r.purPrice)
          : c.key === "mrp" ? money(r.mrp)
          : money(r.salePrice);
        const lines = doc.splitTextToSize(value, c.w - 3) as string[];
        const tx = c.align === "right" ? x + c.w - 2 : c.align === "center" ? x + c.w / 2 : x + 2;
        doc.text(lines.slice(0, hasImages ? 2 : 1), tx, y + (lines.length > 1 && hasImages ? dy - 2 : dy), {
          align: c.align || "left",
        });
      }
      x += c.w;
    }
    y += rowH;
  });

  if (y + headH > pageH - 10) {
    doc.addPage();
    y = m;
  }
  doc.setFont("helvetica", "bold");
  doc.setFillColor(220, 252, 231);
  doc.rect(m, y, pageW - m * 2, headH, "FD");
  doc.text(`${rows.length} item${rows.length === 1 ? "" : "s"}   ·   Total Qty ${totalQty.toLocaleString("en-IN")}`, m + 2, y + 5);

  doc.save(`Quick_Stock_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
