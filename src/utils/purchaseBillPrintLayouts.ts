import {
  collectSizesOnBill,
  pivotSaleItemsBySize,
  resolveInvoiceSizeColumns,
  type InvoiceSizePivotLine,
} from "@/utils/invoiceSizePivot";

export type PurchaseBillPdfItemLayout = "standard" | "size-grid" | "barcode";

export type PurchaseBillPrintLine = {
  id: string;
  productName: string;
  brand?: string;
  color?: string;
  size?: string;
  barcode?: string;
  hsn?: string;
  qty: number;
  purPrice: number;
  gstPercent: number;
  lineTotal: number;
};

export type PurchaseBillPrintLineInput = {
  id: string;
  product_name?: string | null;
  brand?: string | null;
  color?: string | null;
  style?: string | null;
  product_style?: string | null;
  size?: string | null;
  barcode?: string | null;
  hsn_code?: string | null;
  qty?: number | null;
  pur_price?: number | null;
  gst_per?: number | null;
  line_total?: number | null;
};

const PURCHASE_BILL_PDF_LAYOUT_KEY = "purchase_bill_pdf_item_layout";

export function readPurchaseBillPdfItemLayout(orgId?: string | null): PurchaseBillPdfItemLayout {
  try {
    const raw = localStorage.getItem(`${PURCHASE_BILL_PDF_LAYOUT_KEY}:${orgId || "default"}`);
    if (raw === "size-grid" || raw === "barcode" || raw === "standard") return raw;
  } catch {
    /* ignore */
  }
  return "standard";
}

export function persistPurchaseBillPdfItemLayout(
  layout: PurchaseBillPdfItemLayout,
  orgId?: string | null,
): void {
  try {
    localStorage.setItem(`${PURCHASE_BILL_PDF_LAYOUT_KEY}:${orgId || "default"}`, layout);
  } catch {
    /* ignore */
  }
}

export function formatPurchaseBillProductSubtitle(item: PurchaseBillPrintLine): string {
  const parts = [item.brand, item.size, item.color].filter(Boolean);
  return parts.join(" / ");
}

export function mapPurchaseItemsToPrintLines(
  items: PurchaseBillPrintLineInput[],
): PurchaseBillPrintLine[] {
  return items.map((item) => ({
    id: item.id,
    productName: (item.product_name || "").trim() || "—",
    brand: item.brand?.trim() || undefined,
    color: item.color?.trim() || undefined,
    size: item.size?.trim() || undefined,
    barcode: item.barcode?.trim() || undefined,
    hsn: item.hsn_code?.trim() || undefined,
    qty: Number(item.qty) || 0,
    purPrice: Number(item.pur_price) || 0,
    gstPercent: Number(item.gst_per) || 0,
    lineTotal: Number(item.line_total) || 0,
  }));
}

function toPivotLines(lines: PurchaseBillPrintLine[]): InvoiceSizePivotLine[] {
  return lines.map((line) => ({
    particulars: line.productName,
    color: line.color,
    brand: line.brand,
    hsn: line.hsn,
    gstPercent: line.gstPercent,
    rate: line.purPrice,
    size: line.size || "",
    qty: line.qty,
    total: line.lineTotal,
  }));
}

export function buildPurchaseBillSizeGrid(lines: PurchaseBillPrintLine[]) {
  const pivotLines = toPivotLines(lines);
  const columns = resolveInvoiceSizeColumns(pivotLines);
  const pivot = pivotSaleItemsBySize(pivotLines, columns);
  return { columns, ...pivot };
}

export function purchaseBillPrintSizeColumns(lines: PurchaseBillPrintLine[]): string[] {
  return collectSizesOnBill(toPivotLines(lines));
}
