/**
 * Browser print (react-to-print / Ctrl+P) for thermal receipts.
 *
 * Receipt page styles used `@page { size: 80mm auto }`. That is not valid CSS (`size` takes one
 * or two lengths, or `auto` on its own), so Chrome drops the rule and lays the receipt out on
 * whatever paper the print dialog has selected. With A4 / Letter selected the 80 mm receipt sits
 * in the left third of an A4 page and the thermal driver shrinks the whole page onto the roll:
 * a tiny ("zoomed out") receipt, on and off depending on the paper Windows / Chrome picked
 * (Trendzo POS, Nov 2026).
 *
 * At print time we measure the receipt and give the page a real size: roll width × content
 * height, so the layout no longer depends on the selected paper and nothing blank is fed after
 * the receipt.
 *
 * Only on computers where the shop switched it on (Settings → POS print, kept per computer:
 * src/lib/thermalPagePreference.ts). With a roll paper selected in the printer driver, a page
 * shorter than the paper is centred by Chrome, which left a blank gap above the receipt; there
 * the printer's own paper (no page size) is right.
 */
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import { detectThermalPaperFromElement } from "@/utils/thermalReceiptPrintDocument";
import { isThermalPageSizedToReceipt } from "@/lib/thermalPagePreference";

/** `size: 80mm auto` / `size: 58mm auto` — invalid, ignored by browsers. */
export const THERMAL_AUTO_PAGE_SIZE_RE = /size\s*:\s*(58|80)mm\s+auto\b/i;

/** Receipt roots the print styles size (same list as the thermal print CSS). */
export const THERMAL_RECEIPT_ROOT_SELECTOR = [
  ".thermal-print-80mm",
  ".thermal-receipt-container",
  ".modern-thermal-receipt",
  ".kids-thermal-receipt-80mm",
  ".kids-camp-thermal-receipt-80mm",
  ".vastrakala-thermal-receipt-80mm",
  ".tvs-thermal-receipt-80mm",
  ".payment-receipt-thermal",
  ".sale-return-thermal",
].join(", ");

const PX_PER_MM = 96 / 25.4;
const MIN_HEIGHT_MM = 40;
const MAX_HEIGHT_MM = 3000;

/** Roll width × content height (mm), with headroom so print fonts never push past the page. */
export function thermalMeasuredPageSize(paper: PosThermalPaper, contentHeightPx: number): string {
  const width = paper === "58mm" ? "58mm" : "80mm";
  const mm = Number.isFinite(contentHeightPx) && contentHeightPx > 0 ? contentHeightPx / PX_PER_MM : 0;
  const height = Math.min(MAX_HEIGHT_MM, Math.max(MIN_HEIGHT_MM, Math.ceil(mm * 1.05 + 10)));
  return `${width} ${height}mm`;
}

/**
 * Should this print get a measured thermal page? Yes when the page style uses the invalid
 * `Xmm auto` size, or sets no page size at all and the content is a thermal receipt. An explicit
 * valid size (A4, A5, 210mm 148mm, labels) is left alone.
 */
export function needsThermalPageSize(pageStyle: string | undefined, hasReceiptRoot: boolean): boolean {
  const style = pageStyle ?? "";
  if (THERMAL_AUTO_PAGE_SIZE_RE.test(style)) return true;
  const explicitSize = /@page[^{]*\{[^}]*\bsize\s*:/i.test(style);
  return !explicitSize && hasReceiptRoot;
}

function paperFromPageStyle(pageStyle: string | undefined): PosThermalPaper | null {
  const m = THERMAL_AUTO_PAGE_SIZE_RE.exec(pageStyle ?? "");
  if (!m) return null;
  return m[1] === "58" ? "58mm" : "80mm";
}

/**
 * Add `@page { size: <roll> <height>mm }` to the print document (react-to-print iframe).
 * Returns the size written, or null when this print is not a thermal receipt.
 */
export function applyThermalPageSize(
  doc: Document,
  pageStyle?: string,
  sizeToReceipt: boolean = isThermalPageSizedToReceipt(),
): string | null {
  if (!sizeToReceipt) return null;
  const body = doc.body;
  if (!body) return null;
  const root = body.querySelector<HTMLElement>(THERMAL_RECEIPT_ROOT_SELECTOR);
  if (!needsThermalPageSize(pageStyle, !!root)) return null;

  const paper = paperFromPageStyle(pageStyle) ?? (root ? detectThermalPaperFromElement(root) : "80mm");
  const width = paper === "58mm" ? "58mm" : "80mm";

  // Lay the document out at roll width while measuring (the print iframe is window-wide).
  const html = doc.documentElement;
  const prev = { html: html.style.width, body: body.style.width };
  html.style.width = width;
  body.style.width = width;
  let heightPx = 0;
  try {
    // Where the printed content ends (body height can be the whole window, so measure children).
    const top = html.getBoundingClientRect().top;
    const bottomOf = (el: Element) => el.getBoundingClientRect().bottom - top;
    heightPx = root ? Math.max(root.scrollHeight, bottomOf(root)) : 0;
    for (const child of Array.from(body.children)) {
      if (child.tagName === "STYLE" || child.tagName === "SCRIPT") continue;
      heightPx = Math.max(heightPx, bottomOf(child));
    }
  } finally {
    html.style.width = prev.html;
    body.style.width = prev.body;
  }

  const size = thermalMeasuredPageSize(paper, heightPx);
  doc.getElementById("ezzy-thermal-page-size")?.remove();
  const style = doc.createElement("style");
  style.id = "ezzy-thermal-page-size";
  // Last @page rule wins for `size`; margins stay as the page style set them.
  style.textContent = `@page { size: ${size}; }`;
  (doc.head ?? html).appendChild(style);
  return size;
}
