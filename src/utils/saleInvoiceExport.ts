import type * as XLSXType from "xlsx";
import { format } from "date-fns";
import { deliverFileBlob, type FileDeliveryResult } from "@/utils/mobileDocumentDelivery";
import type { InvoicePdfPageFormat } from "@/utils/invoiceElementToPdf";

/** One bill line as shown on the Sale Bill screen (or the saved invoice). */
export interface SaleInvoiceExportLine {
  productName: string;
  size?: string;
  color?: string;
  barcode?: string;
  hsn?: string;
  qty: number;
  mrp?: number;
  rate: number;
  discountPercent?: number;
  gstPercent?: number;
  total: number;
}

/** Everything the Sale Bill "Excel" button writes. */
export interface SaleInvoiceExportData {
  businessName: string;
  /** Saved invoice number, or "DRAFT" for a bill not saved yet. */
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  taxType?: "inclusive" | "exclusive" | string;
  paymentMethod?: string | null;
  notes?: string;
  lines: SaleInvoiceExportLine[];
  /** Totals in display order. Gross, Discount and Net Payable are always written; others only when not 0. */
  summary: Array<{ label: string; amount: number; always?: boolean }>;
}

export const SALE_INVOICE_EXPORT_HEADERS = [
  "Sr",
  "Product",
  "Size",
  "Color",
  "Barcode",
  "HSN",
  "Qty",
  "MRP",
  "Rate",
  "Disc %",
  "GST %",
  "Total",
] as const;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 || 0;

/** `Invoice_INV-26-27-15_19112026` — safe on Windows, Android and macOS. */
export function saleInvoiceExportFileBase(billNo: string, date: Date): string {
  const safeNo = (billNo || "DRAFT").trim().replace(/[/\\?%*:|"<>\s]+/g, "-") || "DRAFT";
  const stamp = Number.isNaN(date?.getTime?.()) ? "" : `_${format(date, "ddMMyyyy")}`;
  return `Invoice_${safeNo}${stamp}`;
}

/** Sale bill format setting → PDF page format used for the export. */
export function saleInvoicePdfPageFormat(billFormat: string | null | undefined): InvoicePdfPageFormat {
  const f = (billFormat || "a4").toLowerCase();
  if (f === "thermal") return "thermal";
  if (f === "a5" || f === "a5-horizontal") return "a5";
  return "a4";
}

/** Rows (array of arrays) for the Excel sheet: header block, item table, totals. */
export function buildSaleInvoiceSheetRows(data: SaleInvoiceExportData): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push([data.businessName || "Invoice"]);
  rows.push([data.billNo === "DRAFT" ? "SALE INVOICE (DRAFT — NOT SAVED)" : "SALE INVOICE"]);
  rows.push([]);
  rows.push(["Invoice No", data.billNo || "DRAFT", "", "Date", format(data.date, "dd-MM-yyyy")]);
  if (data.customerName) rows.push(["Customer", data.customerName]);
  if (data.customerPhone) rows.push(["Mobile", data.customerPhone]);
  if (data.customerAddress) rows.push(["Address", data.customerAddress]);
  if (data.customerGstin) rows.push(["GSTIN", data.customerGstin]);
  if (data.taxType) rows.push(["Tax Type", data.taxType === "exclusive" ? "Exclusive GST" : "Inclusive GST"]);
  if (data.paymentMethod) rows.push(["Payment", data.paymentMethod]);
  rows.push([]);
  rows.push([...SALE_INVOICE_EXPORT_HEADERS]);

  let totalQty = 0;
  data.lines.forEach((l, i) => {
    totalQty += Number(l.qty) || 0;
    rows.push([
      i + 1,
      l.productName || "",
      l.size || "",
      l.color || "",
      l.barcode || "",
      l.hsn || "",
      Number(l.qty) || 0,
      round2(l.mrp ?? 0),
      round2(l.rate),
      round2(l.discountPercent ?? 0),
      round2(l.gstPercent ?? 0),
      round2(l.total),
    ]);
  });
  rows.push(["", "Total", "", "", "", "", round2(totalQty), "", "", "", "", round2(data.lines.reduce((s, l) => s + (Number(l.total) || 0), 0))]);
  rows.push([]);

  for (const s of data.summary) {
    const amount = round2(s.amount);
    if (!s.always && amount === 0) continue;
    rows.push(["", "", "", "", "", "", "", "", "", "", s.label, amount]);
  }
  if (data.notes?.trim()) {
    rows.push([]);
    rows.push(["Notes", data.notes.trim()]);
  }
  return rows;
}

let xlsxPromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxPromise ??= import("xlsx"));

/** Build the .xlsx and hand it to the browser / phone share sheet. */
export async function downloadSaleInvoiceExcel(data: SaleInvoiceExportData): Promise<FileDeliveryResult> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(buildSaleInvoiceSheetRows(data));
  ws["!cols"] = [
    { wch: 5 }, { wch: 34 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
    { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return deliverFileBlob(
    new Blob([out], { type: mime }),
    `${saleInvoiceExportFileBase(data.billNo, data.date)}.xlsx`,
    mime,
    { preferDownload: true },
  );
}
