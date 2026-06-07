import { useEffect } from "react";

interface PrecisionPrintCSSProps {
  labelWidth: number;
  labelHeight: number;
  mode: "thermal" | "a4";
  thermalCols?: number;
  /**
   * When false (default) the `<style>` element is NOT injected into
   * `document.head`. This prevents the precision `@page` rule and the
   * `body * { visibility: hidden }` rule from leaking into unrelated
   * print jobs (e.g. thermal receipts from POS) while this component is
   * mounted on a backgrounded tab.
   */
  active?: boolean;
}

export function PrecisionPrintCSS({ labelWidth, labelHeight, mode, thermalCols = 1, active = false }: PrecisionPrintCSSProps) {
  const isThermal2Up = mode === "thermal" && thermalCols > 1;
  useEffect(() => {
    const styleId = "precision-print-css";
    if (!active) {
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
      return;
    }
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    const pageSize =
      mode === "thermal"
        ? `${labelWidth}mm ${labelHeight}mm`
        : "210mm 297mm";

    style.textContent = `
      @media print {
        @page {
          size: ${pageSize};
          margin: 0 !important;
          padding: 0 !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${mode === "thermal" ? `${labelWidth}mm` : "210mm"};
          height: auto;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body * {
          visibility: hidden;
        }
        .precision-print-area,
        .precision-print-area * {
          visibility: visible !important;
        }
        .precision-print-area {
          position: absolute;
          left: 0;
          top: 0;
          margin: 0;
          padding: 0;
          width: ${mode === "thermal" ? `${labelWidth}mm` : "210mm"};
        }
        .precision-print-area > div {
          margin: 0 !important;
          width: ${mode === "thermal" ? `${labelWidth}mm` : "210mm"} !important;
          height: ${mode === "thermal" ? `${labelHeight}mm` : "297mm"} !important;
          min-height: ${mode === "thermal" ? `${labelHeight}mm` : "297mm"} !important;
          max-height: ${mode === "thermal" ? `${labelHeight}mm` : "297mm"} !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          position: relative !important;
          display: ${isThermal2Up ? "flex" : "block"} !important;
          ${isThermal2Up ? "flex-wrap: nowrap !important; align-items: stretch !important;" : ""}
          page-break-after: always !important;
          page-break-inside: avoid !important;
          break-after: page !important;
          break-inside: avoid !important;
        }
        .precision-print-area > .precision-thermal-page-2up > div {
          flex: 0 0 auto !important;
          overflow: hidden !important;
        }
        .precision-print-area > div:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
        .precision-print-area > div > div {
          box-sizing: border-box !important;
          align-content: start !important;
          align-items: start !important;
        }
        .precision-label-container {
          position: relative !important;
        }
        .precision-barcode-svg {
          image-rendering: pixelated;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;

    return () => {
      style?.remove();
    };
  }, [labelWidth, labelHeight, mode, thermalCols, isThermal2Up, active]);

  return null;
}
