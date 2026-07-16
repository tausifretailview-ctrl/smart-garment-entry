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
  const isThermalMultiUp = !opts.isA4 && thermalCols > 1;
  const isThermal1Up = !opts.isA4 && thermalCols === 1;
  const thermalRowWidth = isThermalMultiUp ? pageWidth : `${labelWidthMm}mm`;
  const pageSelector = opts.isA4
    ? ".precision-print-area > div"
    : ".precision-print-area > .precision-thermal-page, .precision-print-area > div";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${pageSize}; margin: 0 !important; padding: 0 !important; }
    @page :first { size: ${pageSize}; margin: 0 !important; padding: 0 !important; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${pageWidth};
      height: auto;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .precision-print-area {
      margin: 0;
      padding: 0;
      width: ${pageWidth};
    }
    ${pageSelector} {
      margin: 0 !important;
      padding: 0 !important;
      width: ${opts.isA4 ? pageWidth : thermalRowWidth} !important;
      height: ${areaHeight} !important;
      min-height: ${areaHeight} !important;
      max-height: ${areaHeight} !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      position: relative !important;
      display: ${isThermalMultiUp ? "flex" : "block"} !important;
      ${isThermalMultiUp ? "flex-wrap: nowrap !important; align-items: stretch !important;" : ""}
      align-content: flex-start !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
      break-after: page !important;
      break-inside: avoid !important;
      transform: none !important;
      transform-origin: top left !important;
    }
    .precision-print-area > .precision-thermal-page-2up > div {
      flex: 0 0 auto !important;
      overflow: hidden !important;
      width: ${labelWidthMm}mm !important;
      max-width: ${labelWidthMm}mm !important;
      position: relative !important;
    }
    .precision-print-area > .precision-thermal-page:last-child,
    .precision-print-area > div:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .precision-label-container {
      width: ${labelWidthMm}mm !important;
      height: ${areaHeight} !important;
      max-width: ${labelWidthMm}mm !important;
      max-height: ${areaHeight} !important;
      overflow: hidden !important;
      transform: none !important;
      transform-origin: top left !important;
      ${isThermalMultiUp
        ? `position: relative !important;
      flex: 0 0 auto !important;`
        : `position: absolute !important;
      top: 0 !important;
      left: 0 !important;`}
    }
    ${isThermal1Up ? `
    @media print {
      html, body {
        width: ${labelWidthMm}mm !important;
        max-width: ${labelWidthMm}mm !important;
      }
    }` : ""}
    .precision-barcode-svg {
      image-rendering: pixelated;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      flex-shrink: 0 !important;
      height: auto !important;
      max-height: none !important;
    }
  </style></head><body><div class="precision-print-area">${labelInnerHtml}</div></body></html>`;
}
