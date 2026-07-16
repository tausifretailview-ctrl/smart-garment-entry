import { toast } from "sonner";
import {
  appPrint,
  isDesktopBarcodePrintConfigured,
  isElectron,
} from "@/utils/appPrint";

export function buildPrecisionLabelDocument(
  labelInnerHtml: string,
  opts: {
    contentWidthMm: number;
    pageHeightMm: number;
    /** Per-label width for 1-up thermal (defaults to contentWidthMm). */
    labelWidthMm?: number;
    isA4: boolean;
    /** 2 = thermal 2-up row; must keep flex layout or labels stack as 1-up */
    thermalCols?: number;
  },
): string {
  const pageWidth = opts.isA4 ? "210mm" : `${opts.contentWidthMm}mm`;
  const pageSize = opts.isA4 ? "210mm 297mm" : `${opts.contentWidthMm}mm ${opts.pageHeightMm}mm`;
  const areaHeight = opts.isA4 ? "297mm" : `${opts.pageHeightMm}mm`;
  const labelWidthMm = opts.labelWidthMm ?? opts.contentWidthMm;
  const thermalCols = Math.max(1, opts.thermalCols ?? 1);
  const isThermal2Up = !opts.isA4 && thermalCols > 1;
  const pageSelector = opts.isA4
    ? ".precision-print-area > div"
    : ".precision-print-area > .precision-thermal-page, .precision-print-area > div";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${pageSize}; margin: 0 !important; padding: 0 !important; }
    @page :first { size: ${pageSize}; margin: 0 !important; padding: 0 !important; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${pageWidth}; height: auto;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .precision-print-area { margin: 0; padding: 0; width: ${pageWidth}; }
    ${pageSelector} {
      margin: 0 !important;
      width: ${opts.isA4 ? pageWidth : `${labelWidthMm}mm`} !important;
      height: ${areaHeight} !important;
      min-height: ${areaHeight} !important;
      max-height: ${areaHeight} !important;
      overflow: hidden !important; box-sizing: border-box !important;
      position: relative !important;
      display: ${isThermal2Up ? "flex" : "block"} !important;
      ${isThermal2Up ? "flex-wrap: nowrap !important; align-items: stretch !important;" : ""}
      align-content: start !important;
      page-break-after: always !important; page-break-inside: avoid !important;
      break-after: page !important; break-inside: avoid !important;
      transform: none !important;
    }
    .precision-print-area > .precision-thermal-page-2up > div {
      flex: 0 0 auto !important;
      overflow: hidden !important;
    }
    .precision-print-area > .precision-thermal-page:last-child,
    .precision-print-area > div:last-child {
      page-break-after: auto !important; break-after: auto !important;
    }
    .precision-label-container { position: relative !important; }
    .precision-barcode-svg {
      image-rendering: pixelated;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      flex-shrink: 0 !important;
      height: auto !important;
      max-height: none !important;
    }
  </style></head><body><div class="precision-print-area">${labelInnerHtml}</div></body></html>`;
}

export function buildStandardLabelDocument(
  innerHtml: string,
  opts: { pageWidthMm: number; pageHeightMm: number; extraHeadStyles: string },
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${opts.pageWidthMm}mm ${opts.pageHeightMm}mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${opts.pageWidthMm}mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${opts.extraHeadStyles}
  </style></head><body>${innerHtml}</body></html>`;
}

/**
 * Desktop app: silent print to Settings → Barcode printer when configured;
 * otherwise open the system print dialog (with preview) like the web app.
 */
export async function printBarcodeViaDesktop(
  htmlDocument: string,
  pageSize: string | { width: number; height: number },
): Promise<boolean> {
  if (!isElectron()) return false;

  const direct = isDesktopBarcodePrintConfigured();
  const result = await appPrint({
    type: "barcode",
    html: htmlDocument,
    pageSize,
    silent: direct,
  });

  if (result.method !== "electron") return false;

  if (result.success) {
    toast.success(
      direct
        ? "Labels sent to barcode printer"
        : "Use the print dialog preview, then confirm print",
    );
    return true;
  }

  if (result.error) {
    toast.error(result.error);
  }
  return false;
}
