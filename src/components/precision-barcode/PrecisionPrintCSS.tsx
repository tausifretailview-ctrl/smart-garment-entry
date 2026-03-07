import { useEffect } from "react";

interface PrecisionPrintCSSProps {
  labelWidth: number;
  labelHeight: number;
  mode: "thermal" | "a4";
}

export function PrecisionPrintCSS({ labelWidth, labelHeight, mode }: PrecisionPrintCSSProps) {
  useEffect(() => {
    const styleId = "precision-print-css";
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
          padding-bottom: 0 !important;
          width: ${mode === "thermal" ? `${labelWidth}mm` : "auto"} !important;
          height: ${mode === "thermal" ? `${labelHeight}mm` : "auto"} !important;
          overflow: hidden !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
        }
        .precision-print-area > div:last-child {
          page-break-after: auto !important;
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
  }, [labelWidth, labelHeight, mode]);

  return null;
}
