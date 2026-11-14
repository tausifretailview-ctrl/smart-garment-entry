import type { LabelDesignConfig, LabelItem } from "@/types/labelTypes";
import { sheetPresets, type SheetType } from "@/lib/barcode/sheetPresets";
import type { ExportLabelsPdfContext, LabelDesignFormat } from "@/lib/barcode/exportLabelsPdf";

/**
 * Barcode Printing sheet preview / print area: fills the target element ("printArea",
 * "previewArea" or "standardInlinePreviewArea") with the label pages for the chosen sheet.
 * Plain DOM work, moved out of BarcodePrinting.tsx unchanged (Plan Phase 4, S4); the screen
 * passes in what the preview reads.
 */
export interface RenderLabelSheetContext {
  labelItems: LabelItem[];
  sheetType: SheetType;
  designFormat: LabelDesignFormat;
  labelConfig: LabelDesignConfig;
  customRows: number;
  startPosition: number;
  topOffset: number;
  leftOffset: number;
  bottomOffset: number;
  rightOffset: number;
  getLabelHTML: ExportLabelsPdfContext["getLabelHTML"];
  hasAbsolutePositioning: ExportLabelsPdfContext["hasAbsolutePositioning"];
  getA4SheetDimensions: ExportLabelsPdfContext["getA4SheetDimensions"];
  getSheetPageMargins: ExportLabelsPdfContext["getSheetPageMargins"];
  getThermalMultiUpCols: () => number;
  getThermalMultiUpGap: () => number;
  isThermal1Up: () => boolean;
  isThermalMultiUp: () => boolean;
}

export function renderLabelSheet(targetElementId: string, ctx: RenderLabelSheetContext): void {
  const {
    bottomOffset,
    customRows,
    designFormat,
    getA4SheetDimensions,
    getLabelHTML,
    getSheetPageMargins,
    getThermalMultiUpCols,
    getThermalMultiUpGap,
    hasAbsolutePositioning,
    isThermal1Up,
    isThermalMultiUp,
    labelConfig,
    labelItems,
    leftOffset,
    rightOffset,
    sheetType,
    startPosition,
    topOffset,
  } = ctx;
  const printArea = document.getElementById(targetElementId);
  if (!printArea) return;

  const isInlineStandardPreview = targetElementId === "standardInlinePreviewArea";
  const isPreviewMode = targetElementId === "previewArea" || isInlineStandardPreview;

  if (isInlineStandardPreview) {
    printArea.className = "barcode-standard-preview-canvas";
  } else if (targetElementId === "previewArea") {
    printArea.className = "";
  }

  // getA4SheetDimensions coerces NovaJet 48×24 gap to 0 (Gap=1 breaks pitch).
  const a4Dims = getA4SheetDimensions();
  const dimensions = {
    cols: a4Dims.cols,
    width: a4Dims.width,
    height: a4Dims.height,
    gap: a4Dims.gap,
  };
  
  printArea.innerHTML = "";

  const appendScaledA4Page = (pageEl: HTMLElement) => {
    if (!isInlineStandardPreview) {
      printArea.appendChild(pageEl);
      return;
    }
    const scale = 0.52;
    const wrap = document.createElement("div");
    wrap.className = "barcode-a4-inline-scale-wrap";
    wrap.style.cssText = `
      width: calc(210mm * ${scale});
      height: calc(297mm * ${scale});
      margin: 0 auto;
      overflow: hidden;
    `;
    pageEl.style.transform = `scale(${scale})`;
    pageEl.style.transformOrigin = "top left";
    wrap.appendChild(pageEl);
    printArea.appendChild(wrap);
  };

  // Calculate total labels (only for preview mode)
  const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  
  // Calculate labels per page (only for preview mode)
  let numPages = 0;
  if (isPreviewMode) {
    if (isThermal1Up()) {
      // Thermal 1UP: each label is its own page, no A4 pagination
      numPages = totalLabels;
    } else {
      const availableHeight = 297 - topOffset - bottomOffset;
      const explicitRows = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
      const rowsPerPage = explicitRows ? explicitRows : Math.floor(availableHeight / (dimensions.height + dimensions.gap));
      const labelsPerPage = dimensions.cols * Math.max(1, rowsPerPage);
      numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
    }
  }

  // Generate all labels as an array
  const allLabels: { html: string; item: LabelItem }[] = [];
  labelItems.forEach((item) => {
    const qty = Number(item.qty) || 0;
    for (let i = 0; i < qty; i++) {
      allLabels.push({ html: getLabelHTML(item, designFormat), item });
    }
  });

  if (isPreviewMode && !isThermal1Up() && !isThermalMultiUp() && numPages === 0) {
    const availableHeight = 297 - topOffset - bottomOffset;
    const explicitRowsP = sheetType === "custom" ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
    const rowsPerPage = explicitRowsP
      ? explicitRowsP
      : Math.max(1, Math.floor(availableHeight / (dimensions.height + dimensions.gap)));
    const labelsPerPage = dimensions.cols * rowsPerPage;
    const previewMargins = getSheetPageMargins();

    const summary = document.createElement("div");
    summary.className = "barcode-a4-preview-summary";
    summary.style.cssText =
      "margin-bottom: 12px; padding: 10px 12px; background: hsl(var(--muted)); border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; color: hsl(var(--foreground));";
    summary.textContent =
      totalLabels === 0
        ? `A4 sheet layout — ${dimensions.width}×${dimensions.height}mm · ${dimensions.cols}×${rowsPerPage} grid (${labelsPerPage} labels per page)`
        : `A4 sheet layout — add label quantities to preview printed content`;
    printArea.appendChild(summary);

    const pageWrap = document.createElement("div");
    pageWrap.className = "barcode-a4-page-frame";
    pageWrap.style.cssText =
      "width: 210mm; min-height: 297mm; box-sizing: border-box; border: 2px solid #64748b; background: #fff; margin: 0 auto; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);";

    const gridDiv = document.createElement("div");
    gridDiv.className = "label-grid barcode-a4-layout-grid";
    gridDiv.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
      grid-template-rows: repeat(${rowsPerPage}, ${dimensions.height}mm);
      gap: ${dimensions.gap}mm;
      margin: ${previewMargins.marginTop}mm ${previewMargins.marginRight}mm ${previewMargins.marginBottom}mm ${previewMargins.marginLeft}mm;
    `;

    for (let i = 0; i < labelsPerPage; i++) {
      const slot = i + 1;
      const isSkipped = slot < startPosition;
      const cell = document.createElement("div");
      cell.style.cssText = `
        width: ${dimensions.width}mm;
        height: ${dimensions.height}mm;
        border: 1px dashed ${isSkipped ? "#cbd5e1" : "#94a3b8"};
        background: ${isSkipped ? "#f1f5f9" : "#ffffff"};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        box-sizing: border-box;
      `;
      cell.textContent = isSkipped ? "—" : String(slot);
      gridDiv.appendChild(cell);
    }

    pageWrap.appendChild(gridDiv);
    appendScaledA4Page(pageWrap);
    return;
  }

  if (isPreviewMode && numPages > 0) {
    // Preview mode: Show pages with separators
    const isThermalPreview = isThermal1Up();
    const availableHeight = 297 - topOffset - bottomOffset;
    const explicitRowsP = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
    const rowsPerPage = isThermalPreview ? 1 : (explicitRowsP ? explicitRowsP : Math.floor(availableHeight / (dimensions.height + dimensions.gap)));
    const labelsPerPage = isThermalPreview ? 1 : dimensions.cols * Math.max(1, rowsPerPage);

    // Add total count at the top
    const totalCounter = document.createElement("div");
    totalCounter.className = "total-page-counter";
    totalCounter.style.cssText = `
      margin-bottom: 15px;
      padding: 12px;
      background: hsl(var(--primary) / 0.1);
      border: 1px solid hsl(var(--primary) / 0.2);
      border-radius: 8px;
      text-align: center;
      font-weight: 700;
      font-size: 16px;
      color: hsl(var(--primary));
    `;
    totalCounter.textContent = `Total: ${totalLabels} labels across ${numPages} page${numPages > 1 ? 's' : ''}`;
    printArea.appendChild(totalCounter);

    // Create pages with page numbers
    for (let page = 0; page < numPages; page++) {
      // Add page counter before each page
      const pageSeparator = document.createElement("div");
      pageSeparator.className = "page-separator";
      pageSeparator.style.cssText = `
        margin: ${page > 0 ? '20px' : '0'} 0 10px 0;
        padding: 10px;
        background: hsl(var(--muted));
        border-radius: 6px;
        text-align: center;
        font-weight: 600;
        font-size: 14px;
        color: hsl(var(--muted-foreground));
      `;
      pageSeparator.textContent = `Page ${page + 1} of ${numPages}`;
      printArea.appendChild(pageSeparator);

      // Create grid for this page
      const gridDiv = document.createElement("div");
      gridDiv.className = "label-grid";
      
      if (isThermalPreview) {
        // Thermal 1UP: single label per page block
        gridDiv.style.cssText = `
          display: block;
          width: ${dimensions.width}mm;
          height: ${dimensions.height}mm;
          padding-top: ${topOffset}mm;
          padding-left: ${leftOffset}mm;
          padding-bottom: ${bottomOffset}mm;
          padding-right: ${rightOffset}mm;
          box-sizing: border-box;
          margin-bottom: ${page < numPages - 1 ? '10px' : '0'};
          border: 1px dashed hsl(var(--border));
        `;
      } else {
        const previewMargins = getSheetPageMargins();
        gridDiv.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
          grid-template-rows: repeat(${rowsPerPage}, ${dimensions.height}mm);
          gap: ${dimensions.gap}mm;
          margin: ${previewMargins.marginTop}mm ${previewMargins.marginRight}mm ${page < numPages - 1 ? '20px' : previewMargins.marginBottom + 'mm'} ${previewMargins.marginLeft}mm;
        `;
      }

      // Add labels for this page
      const startIdx = page * labelsPerPage;
      const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
      
      // Check if using absolute positioning for cell styling
      const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
      
      for (let i = startIdx; i < endIdx; i++) {
        const cell = document.createElement("div");
        cell.className = "label-cell";
        
        if (useAbsoluteLayout) {
          cell.style.cssText = `
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            font-family: Arial, sans-serif;
            position: relative;
            overflow: visible;
            box-sizing: border-box;
          `;
        } else {
          cell.style.cssText = `
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            font-family: Arial, sans-serif;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 2px;
            box-sizing: border-box;
            line-height: 1.1;
          `;
        }
        cell.innerHTML = allLabels[i].html;
        gridDiv.appendChild(cell);
      }

      printArea.appendChild(gridDiv);
    }
  } else {
    // Print mode: Create separate grids per page for proper page breaks
    // For thermal/1-up: each label is its own page; for A4: calculate rows per page
    const labelsPerPage = isThermal1Up()
      ? 1
      : isThermalMultiUp()
      ? getThermalMultiUpCols()
      : (() => {
          const availableHeight = 297 - topOffset - bottomOffset;
          const explicitRows = sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || null);
          const rowsPerPage = explicitRows ? explicitRows : Math.floor(availableHeight / (dimensions.height + dimensions.gap));
          return dimensions.cols * Math.max(1, rowsPerPage);
        })();
    const numPrintPages = allLabels.length > 0 ? Math.ceil(allLabels.length / labelsPerPage) : 0;
    
    // Check if using absolute positioning for cell styling
    const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);

    for (let page = 0; page < numPrintPages; page++) {
      // Calculate indices first so we can use them for grid-template-rows
      const startIdx = page * labelsPerPage;
      const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
      const rowsOnPage = Math.ceil((endIdx - startIdx) / dimensions.cols);

      const gridDiv = document.createElement("div");
      gridDiv.className = isThermal1Up() ? "label-grid thermal-page" : "label-grid";
      gridDiv.style.cssText = isThermal1Up()
        ? `
            display: block;
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            margin: 0;
            padding-top: ${topOffset}mm;
            padding-left: ${leftOffset}mm;
            padding-bottom: ${bottomOffset}mm;
            padding-right: ${rightOffset}mm;
            box-sizing: border-box;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid-page;
            page-break-after: always;
            break-after: page;
          `
        : isThermalMultiUp()
        ? `
            display: flex;
            flex-wrap: nowrap;
            width: ${dimensions.width * getThermalMultiUpCols() + getThermalMultiUpGap() * Math.max(0, getThermalMultiUpCols() - 1)}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            margin: 0;
            padding: 0;
            gap: ${getThermalMultiUpGap()}mm;
            box-sizing: border-box;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid-page;
            page-break-after: always;
            break-after: page;
          `
        : (() => {
             const pageMargins = getSheetPageMargins();
             return `
             display: grid;
             grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
             grid-template-rows: repeat(${rowsOnPage}, ${dimensions.height}mm);
             gap: ${dimensions.gap}mm;
             align-content: start;
             width: ${dimensions.cols * dimensions.width + (dimensions.cols - 1) * dimensions.gap}mm;
             height: ${rowsOnPage * dimensions.height + (rowsOnPage - 1) * dimensions.gap}mm;
             margin: ${pageMargins.marginTop}mm ${pageMargins.marginRight}mm ${pageMargins.marginBottom}mm ${pageMargins.marginLeft}mm;
             page-break-after: always;
             break-after: page;
           `;
           })();

      if (isThermal1Up() && page > 0) {
        gridDiv.style.pageBreakBefore = 'always';
        gridDiv.style.breakBefore = 'page';
      }
      
      // Don't add page break after last page
      if (page === numPrintPages - 1) {
        gridDiv.style.pageBreakAfter = 'auto';
        gridDiv.style.breakAfter = 'auto';
      }
      
      for (let i = startIdx; i < endIdx; i++) {
        const cell = document.createElement("div");
        cell.className = "label-cell";
        
        if (useAbsoluteLayout) {
          // Absolute positioning layout - matches BarTenderLabelDesigner
          cell.style.cssText = `
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            font-family: Arial, sans-serif;
            position: relative;
            overflow: visible;
            box-sizing: border-box;
          `;
        } else {
          // Legacy flow-based layout
          cell.style.cssText = `
            width: ${dimensions.width}mm;
            height: ${dimensions.height}mm;
            min-height: ${dimensions.height}mm;
            max-height: ${dimensions.height}mm;
            font-family: Arial, sans-serif;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 2px;
            box-sizing: border-box;
            line-height: 1.1;
          `;
        }
        cell.innerHTML = allLabels[i].html;
        gridDiv.appendChild(cell);
      }

      printArea.appendChild(gridDiv);
    }
  }
  // Barcodes are now pre-rendered as images in getLabelHTML, no setTimeout needed
}
