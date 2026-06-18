import { type PosThermalPaper, thermalReceiptRollPageSize } from '@/utils/invoicePrintFormat';
import {
  buildThermalReceiptPrintCss,
  detectThermalPaperFromElement,
} from '@/utils/thermalReceiptPrintDocument';

export type ExtractInvoiceHtmlOptions = {
  /** When set (e.g. from direct_print_pos_paper), overrides DOM detection. */
  thermalPaper?: PosThermalPaper;
};

interface PrintConfig {
  printerName: string;
  paperSize?: '58mm' | '80mm' | 'A4' | 'A5';
  copies?: number;
}

/**
 * QZ Tray bridge has been removed. These functions are kept as no-op stubs so
 * existing imports (useDirectPrint, Settings) keep compiling. None of them
 * attempt any WebSocket connection or load qz-tray.js.
 */
export const isQZReady = (): boolean => false;
export const waitForQZ = (): Promise<boolean> => Promise.resolve(false);
export const ensureQZConnection = async (): Promise<boolean> => false;
export const getQZPrinters = async (): Promise<string[]> => [];
export const printViaQZTray = async (
  _html: string,
  _config: PrintConfig,
): Promise<boolean> => false;

/**
 * Extract the rendered HTML from an invoice ref element.
 * Injects the app's full stylesheets so Tailwind classes render correctly
 * in the browser/Electron print window.
 */
export const extractInvoiceHTML = (
  ref: HTMLDivElement,
  options?: ExtractInvoiceHtmlOptions,
): string => {
  // Get the current app's stylesheet content to inject inline
  const getPageStylesheets = (): string => {
    const styles: string[] = [];
    try {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              styles.push(rules[j].cssText);
            }
          }
        } catch (e) {
          // Cross-origin stylesheet — skip
        }
      }
    } catch (e) {
      console.warn('Could not extract stylesheets:', e);
    }
    return styles.join('\n');
  };

  const outerHTML = ref.outerHTML;
  const allStyles = getPageStylesheets();
  const isThermal =
    ref.classList.contains('thermal-print-80mm') ||
    ref.classList.contains('thermal-receipt-container') ||
    ref.classList.contains('modern-thermal-receipt') ||
    ref.classList.contains('kids-thermal-receipt-80mm') ||
    !!ref.querySelector(
      '.thermal-print-80mm, .thermal-receipt-container, .modern-thermal-receipt, .kids-thermal-receipt-80mm',
    );
  const thermalPaper: PosThermalPaper = isThermal
    ? (options?.thermalPaper ?? detectThermalPaperFromElement(ref))
    : '80mm';
  const thermalPrintCss = isThermal ? buildThermalReceiptPrintCss(thermalPaper) : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; width: ${isThermal ? (thermalPaper === '58mm' ? '58mm' : '80mm') : 'auto'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; ${isThermal ? `size: ${thermalReceiptRollPageSize(thermalPaper)};` : ''} }
    ${allStyles}
    ${thermalPrintCss}
  </style>
</head>
<body>
  ${outerHTML}
</body>
</html>`;
};

/**
 * Print a test receipt to verify printer connectivity
 */
export const printTestReceipt = async (printerName: string, paperSize: '58mm' | '80mm' | 'A4' | 'A5' = '80mm'): Promise<boolean> => {
  void printerName;
  void paperSize;
  return false;
};
