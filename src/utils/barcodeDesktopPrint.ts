import { toast } from "sonner";
import {
  appPrint,
  isDesktopBarcodePrintConfigured,
  isElectron,
} from "@/utils/appPrint";

export { buildPrecisionLabelDocument } from "@/utils/precisionLabelPrintDocument";

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
