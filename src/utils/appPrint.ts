// Universal print helper. Uses Electron silent printing when running inside the
// desktop app, and falls back to the normal browser print flow on the web.
// This is additive: existing web printing keeps working unchanged.

import {
  receiptElectronPageSizeMicrons,
  wrapReceiptHtmlForElectron,
} from "@/utils/thermalReceiptPrintDocument";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const electronAPI = (window as any).electronAPI;

export type AppPrintType = "invoice" | "receipt" | "barcode" | "report";

// localStorage keys for the desktop printer preferences (set in Settings).
export const PRINT_PREF_KEYS = {
  invoicePrinter: "ezzy_invoice_printer",
  thermalPrinter: "ezzy_thermal_printer",
  barcodePrinter: "ezzy_barcode_printer",
  autoPrint: "ezzy_auto_print",
  copies: "ezzy_print_copies",
} as const;

export interface AppPrintOptions {
  type: AppPrintType;
  /** HTML content to print. If omitted, the current page is printed. */
  html?: string;
  copies?: number;
  /** 58mm vs 80mm when type is receipt (Electron). */
  thermalPaper?: PosThermalPaper;
  /** Override default page size for this print type (Electron). */
  pageSize?: string | { width: number; height: number };
  /** Electron only: true = silent to chosen printer; false = system dialog with preview. Default true. */
  silent?: boolean;
  /** Called instead of window.print() in web mode (e.g. open a preview window). */
  onFallback?: () => void;
}

export interface AppPrintResult {
  success: boolean;
  method: "electron" | "browser";
  error?: string | null;
}

export function isElectron(): boolean {
  return !!electronAPI?.isElectron;
}

function printerForType(type: AppPrintType): string {
  const key = {
    invoice: PRINT_PREF_KEYS.invoicePrinter,
    receipt: PRINT_PREF_KEYS.thermalPrinter,
    barcode: PRINT_PREF_KEYS.barcodePrinter,
    report: PRINT_PREF_KEYS.invoicePrinter,
  }[type];
  return localStorage.getItem(key) || "";
}

function pageSizeForType(
  type: AppPrintType,
  thermalPaper: PosThermalPaper = "80mm",
): string | { width: number; height: number } {
  // Electron page sizes are in microns for custom sizes.
  if (type === "receipt") {
    return receiptElectronPageSizeMicrons(thermalPaper);
  }
  return {
    invoice: "A4",
    barcode: { width: 50000, height: 25000 }, // 50x25mm label
    report: "A4",
  }[type];
}

function marginsForType(type: AppPrintType) {
  return {
    invoice: { marginType: "default" as const },
    receipt: { marginType: "none" as const },
    barcode: { marginType: "none" as const },
    report: { marginType: "default" as const },
  }[type];
}

/**
 * Print using Electron silent print when available, otherwise the browser.
 */
export async function appPrint(options: AppPrintOptions): Promise<AppPrintResult> {
  if (!isElectron()) {
    if (options.onFallback) {
      options.onFallback();
    } else if (options.html) {
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(options.html);
        win.document.close();
        win.focus();
        win.print();
      }
    } else {
      window.print();
    }
    return { success: true, method: "browser" };
  }

  const printerName = printerForType(options.type);
  const thermalPaper = options.thermalPaper ?? "80mm";
  const pageSize =
    options.pageSize ??
    pageSizeForType(options.type, options.type === "receipt" ? thermalPaper : undefined);
  const margins = marginsForType(options.type);
  const copies = options.copies || Number(localStorage.getItem(PRINT_PREF_KEYS.copies)) || 1;
  const silent = options.silent !== false;

  const isReceipt = options.type === "receipt";
  const printHtml =
    options.html && isReceipt
      ? wrapReceiptHtmlForElectron(options.html)
      : options.html;

  try {
    const result = printHtml
      ? await electronAPI.printHtml({
          html: printHtml,
          printerName,
          pageSize,
          copies,
          margins,
          silent,
          printKind: isReceipt ? "receipt" : options.type,
          preferCSSPageSize: isReceipt,
        })
      : await electronAPI.silentPrint({ printerName, pageSize, copies, margins });
    return { success: !!result?.success, method: "electron", error: result?.error ?? null };
  } catch (err) {
    return { success: false, method: "electron", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Whether auto-print after save is enabled (desktop only). */
export function isDesktopAutoPrintEnabled(): boolean {
  return isElectron() && localStorage.getItem(PRINT_PREF_KEYS.autoPrint) === "true";
}

/** Desktop app has a receipt or invoice printer chosen in Settings. */
export function isDesktopSilentPrintConfigured(): boolean {
  if (!isElectron()) return false;
  return !!(
    localStorage.getItem(PRINT_PREF_KEYS.thermalPrinter) ||
    localStorage.getItem(PRINT_PREF_KEYS.invoicePrinter)
  );
}

/** Barcode / label printer selected in Desktop Print Settings. */
export function isDesktopBarcodePrintConfigured(): boolean {
  return isElectron() && !!localStorage.getItem(PRINT_PREF_KEYS.barcodePrinter);
}
