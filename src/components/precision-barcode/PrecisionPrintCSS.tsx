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
