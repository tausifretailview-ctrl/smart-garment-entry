import { toast } from "sonner";
import type jsPDFType from "jspdf";
import type html2canvasType from "html2canvas";
import { ensureLabelNarrowFontLoaded } from "@/utils/labelFontFace";
import { isPrecisionThermalSheetMode, type PrecisionPrintMode } from "@/utils/precisionThermalModes";
import type { LabelDesignConfig, LabelItem } from "@/types/labelTypes";
import { PrecisionLabelPreview } from "@/components/precision-barcode/PrecisionLabelPreview";
import { sheetPresets, type SheetType } from "@/lib/barcode/sheetPresets";
import type { NovaJetSheetBrand } from "@/utils/a4SheetLayout";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";

/**
 * Barcode Printing "Export PDF": Precision Pro thermal labels are drawn one canvas per label;
 * sheet layouts are drawn page by page. Moved out of BarcodePrinting.tsx unchanged
 * (Plan Phase 4, S4); the screen passes in what the export reads.
 */
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));
let html2canvasPromise: Promise<typeof html2canvasType> | null = null;
const loadHtml2Canvas = (): Promise<typeof html2canvasType> =>
  (html2canvasPromise ??= import("html2canvas").then((m) => m.default));

export type LabelDesignFormat = "BT1" | "BT2" | "BT3" | "BT4";

export interface ExportLabelsPdfContext {
  labelItems: LabelItem[];
  businessName: string;
  sheetType: SheetType;
  designFormat: LabelDesignFormat;
  labelConfig: LabelDesignConfig;
  productFieldSettings: ProductFieldsConfig;
  customWidth: number;
  customHeight: number;
  customCols: number;
  customRows: number;
  customGap: number;
  printScale: number;
  topOffset: number;
  precisionSettings: {
    enabled: boolean;
    xOffset: number;
    yOffset: number;
    vGap: number;
    hGap: number;
    labelWidth: number;
    labelHeight: number;
    a4Cols: number;
    a4Rows: number;
    printMode: PrecisionPrintMode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same loose shape as the screen's state
    labelConfig: any;
    thermalCols: number;
  };
  lockedPrintLayout: () => { mode: PrecisionPrintMode; cols: number };
  getLabelHTML: (item: LabelItem, format: LabelDesignFormat) => string;
  hasAbsolutePositioning: (config: LabelDesignConfig) => boolean;
  getAutoFitScale: () => number;
  getA4SheetDimensions: () => {
    cols: number;
    rows: number;
    width: number;
    height: number;
    gap: number;
    rawGap: number;
    rawWidth: number;
    novaJetBrand: NovaJetSheetBrand | null;
  };
  getSheetPageMargins: () => { marginTop: number; marginLeft: number; marginBottom: number; marginRight: number };
  getThermalMultiUpCols: () => number;
  getThermalMultiUpGap: () => number;
  isA4SheetType: () => boolean;
  isThermal1Up: () => boolean;
  isThermalMultiUp: () => boolean;
}

export async function exportLabelsPdf(ctx: ExportLabelsPdfContext): Promise<void> {
  const {
    businessName,
    customCols,
    customGap,
    customHeight,
    customRows,
    customWidth,
    designFormat,
    getA4SheetDimensions,
    getAutoFitScale,
    getLabelHTML,
    getSheetPageMargins,
    getThermalMultiUpCols,
    getThermalMultiUpGap,
    hasAbsolutePositioning,
    isA4SheetType,
    isThermal1Up,
    isThermalMultiUp,
    labelConfig,
    labelItems,
    lockedPrintLayout,
    precisionSettings,
    printScale,
    productFieldSettings,
    sheetType,
    topOffset,
  } = ctx;
  const html2canvas = await loadHtml2Canvas();
  const jsPDF = await loadJsPdf();
  const hasLabels = labelItems.some((item) => item.qty > 0);
  if (!hasLabels) {
    toast.error("Please add at least one label with quantity > 0");
    return;
  }

  // Validate custom dimensions if custom sheet type is selected
  if (sheetType === "custom") {
    if (customWidth <= 0 || customWidth > 300) {
      toast.error("Width must be between 0 and 300mm");
      return;
    }
    if (customHeight <= 0 || customHeight > 300) {
      toast.error("Height must be between 0 and 300mm");
      return;
    }
    if (customCols <= 0 || customCols > 20) {
      toast.error("Columns must be between 1 and 20");
      return;
    }
    if (customRows <= 0 || customRows > 50) {
      toast.error("Rows must be between 1 and 50");
      return;
    }
    if (customGap < 0 || customGap > 50) {
      toast.error("Gap must be between 0 and 50mm");
      return;
    }
  }

  // Precision Pro Thermal: use html2canvas on PrecisionLabelPreview per label
  if (precisionSettings.enabled && isPrecisionThermalSheetMode(lockedPrintLayout().mode)) {
    toast.info("Generating PDF...");
    try {
      const { labelWidth, labelHeight, xOffset, yOffset, vGap, labelConfig } = precisionSettings;
      const cols = lockedPrintLayout().cols;
      const horizontalGap = cols > 1 ? getThermalMultiUpGap() : 0;
      const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      if (totalLabels === 0) { toast.error("No labels to print"); return; }

      const pageW = labelWidth * cols + horizontalGap * Math.max(0, cols - 1);
      const pdf = cols > 1
        ? new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: [labelHeight, pageW],
          })
        : new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [pageW, labelHeight],
          });

      // Expand items by qty
      const allItems: LabelItem[] = [];
      labelItems.forEach(item => {
        for (let i = 0; i < (item.qty || 0); i++) allItems.push({ ...item, businessName });
      });

      // Create a hidden container
      const container = document.createElement("div");
      container.style.cssText = `position:absolute;left:-9999px;top:0;width:${pageW}mm;`;
      document.body.appendChild(container);

      // Dynamically import ReactDOM to render PrecisionLabelPreview into container per label
      const { createRoot } = await import("react-dom/client");
      const { createElement } = await import("react");
      const { PrecisionLabelPreview } = await import("@/components/precision-barcode/PrecisionLabelPreview");

      // Helper: render one label to canvas
      const renderLabelToCanvas = async (item: LabelItem): Promise<HTMLCanvasElement> => {
        container.innerHTML = "";
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `width:${labelWidth}mm;height:${labelHeight}mm;overflow:hidden;background:#fff;`;
        container.appendChild(wrapper);

        const root = createRoot(wrapper);
        // For PDF: do NOT apply xOffset/yOffset — those are for browser print calibration only
        // PDF placement is handled by addImage coordinates
        root.render(createElement(PrecisionLabelPreview, {
          item,
          width: labelWidth,
          height: labelHeight,
          xOffset: 0,
          yOffset: 0,
          config: labelConfig || undefined,
          productFieldSettings,
        }));

        await new Promise(resolve => setTimeout(resolve, 200));

        // Condensed (EzzyNarrow) glyphs must be ready before html2canvas
        // capture — 3s timeout, then capture anyway.
        await ensureLabelNarrowFontLoaded();

        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(wrapper, {
          scale: 8,  // High DPI for crisp, scannable barcodes
          backgroundColor: "#ffffff",
          logging: false,
          useCORS: true,
          width: labelWidth * 3.7795,
          height: labelHeight * 3.7795,
        });

        root.unmount();
        return canvas;
      };

      if (cols > 1) {
        for (let i = 0; i < allItems.length; i += cols) {
          if (i > 0) pdf.addPage();

          for (let c = 0; c < cols; c++) {
            const itemIdx = i + c;
            if (itemIdx >= allItems.length) break;
            const canvas = await renderLabelToCanvas(allItems[itemIdx]);
            pdf.addImage(
              canvas.toDataURL("image/png"),
              "PNG",
              c * (labelWidth + horizontalGap),
              0,
              labelWidth,
              labelHeight,
            );
          }
        }
      } else {
        // 1-Up: one label per page
        for (let i = 0; i < allItems.length; i++) {
          if (i > 0) pdf.addPage();
          const canvas = await renderLabelToCanvas(allItems[i]);
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, labelWidth, labelHeight);
        }
      }

      document.body.removeChild(container);
      const timestamp = new Date().toISOString().split("T")[0];
      pdf.save(`barcode-labels-${timestamp}.pdf`);
      toast.success(`PDF generated with ${allItems.length} label${allItems.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error("Precision PDF error:", err);
      toast.error("Failed to export PDF");
    }
    return;
  }

  toast.info("Generating PDF...");

  try {
    // Calculate total labels needed
    const totalLabels = labelItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    
    // A4 die-cut sheets (NovaJet MPL 48L/40L) must keep the exact die-cut pitch:
    // use the coerced dimensions and never auto-fit shrink them.
    const isDieCutA4 = isA4SheetType();
    const scaleFactor = isDieCutA4
      ? printScale / 100
      : (printScale / 100) * getAutoFitScale();
    const a4Dims = isDieCutA4 ? getA4SheetDimensions() : null;
    const baseDimensions = a4Dims
      ? {
          cols: a4Dims.cols,
          rows: a4Dims.rows,
          width: a4Dims.width,
          height: a4Dims.height,
          gap: a4Dims.gap,
        }
      : sheetType === "custom"
      ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
      : {
          cols: sheetPresets[sheetType].cols,
          rows: Math.ceil(totalLabels / sheetPresets[sheetType].cols),
          width: parseFloat(sheetPresets[sheetType].width),
          height: parseFloat(sheetPresets[sheetType].height),
          gap: parseFloat(sheetPresets[sheetType].gap)
        };
    
    // Apply scale to dimensions for PDF
    const dimensions = {
      ...baseDimensions,
      width: baseDimensions.width * scaleFactor,
      height: baseDimensions.height * scaleFactor,
      gap: baseDimensions.gap * scaleFactor
    };
    
    // Calculate how many rows fit on one page - use BASE dimensions (unscaled) for accurate page calculation
    // For thermal/1-up: each label is its own page; for A4: calculate rows per page
    const labelsPerPage = isThermal1Up()
      ? 1
      : isThermalMultiUp()
      ? getThermalMultiUpCols()
      : (() => {
          const explicitRows = a4Dims
            ? a4Dims.rows
            : sheetType === 'custom' ? customRows : ((sheetPresets[sheetType] as any)?.rows || 0);
          if (explicitRows > 0) return baseDimensions.cols * explicitRows;
          const availableHeight = 297 - 10;
          const rowsPerPage = Math.floor(availableHeight / (baseDimensions.height + baseDimensions.gap));
          return baseDimensions.cols * Math.max(1, rowsPerPage);
        })();
    
    // Calculate number of pages needed based on actual labels only
    const numPages = totalLabels > 0 ? Math.ceil(totalLabels / labelsPerPage) : 0;
    
    // Don't create PDF if no labels
    if (numPages === 0) {
      toast.error("No labels to print");
      return;
    }
    
    // Create PDF - use label dimensions for thermal, A4 for sheets
    const is1Up = isThermal1Up();
    const isMultiUp = isThermalMultiUp();
    const multiUpCols = getThermalMultiUpCols();
    const multiUpGap = getThermalMultiUpGap();

    if (isMultiUp) {
      baseDimensions.cols = multiUpCols;
      baseDimensions.gap = multiUpGap;
    }

    const pageWidthMm = is1Up
      ? baseDimensions.width
      : isMultiUp
      ? baseDimensions.width * multiUpCols + multiUpGap * Math.max(0, multiUpCols - 1)
      : 210;
    const pageHeightMm = (is1Up || isMultiUp)
      ? baseDimensions.height
      : 297;

    const pdf = is1Up
      ? new jsPDF({ orientation: "portrait", unit: "mm", format: [baseDimensions.width, baseDimensions.height] })
      : isMultiUp
      ? new jsPDF({ orientation: "landscape", unit: "mm", format: [pageHeightMm, pageWidthMm] })
      : new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Create temporary container for rendering each page
    const tempContainer = document.createElement("div");
    tempContainer.id = "pdfExportArea";
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    tempContainer.style.top = "0";
    tempContainer.style.width = isThermal1Up()
      ? `${baseDimensions.width}mm`
      : isThermalMultiUp()
      ? `${pageWidthMm}mm`
      : "210mm";
    document.body.appendChild(tempContainer);

    // Generate all labels as an array
    const allLabels: { html: string; item: LabelItem }[] = [];
    labelItems.forEach((item) => {
      const qty = Number(item.qty) || 0;
      for (let i = 0; i < qty; i++) {
        allLabels.push({ html: getLabelHTML(item, designFormat), item });
      }
    });

    // Process each page
    for (let page = 0; page < numPages; page++) {
      // Calculate labels for this page
      const startIdx = page * labelsPerPage;
      const endIdx = Math.min(startIdx + labelsPerPage, allLabels.length);
      
      // Skip if no labels for this page
      if (startIdx >= allLabels.length) {
        continue;
      }

      if (page > 0) {
        pdf.addPage();
      }

      // Clear temp container
      tempContainer.innerHTML = "";

      // Calculate actual rows on this page for height calculation
      const labelsOnThisPage = endIdx - startIdx;
      const rowsOnThisPage = Math.ceil(labelsOnThisPage / dimensions.cols);

      // Create grid for this page
      const gridDiv = document.createElement("div");
      gridDiv.className = "label-grid";
      if (is1Up || isMultiUp) {
        const thermalCols = isMultiUp ? multiUpCols : 1;
        gridDiv.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${thermalCols}, ${baseDimensions.width}mm);
          gap: ${multiUpGap}mm;
          width: ${pageWidthMm}mm;
          height: ${pageHeightMm}mm;
          overflow: hidden;
          box-sizing: border-box;
        `;
      } else {
        // Use the same A4 die-cut margins as browser print (NovaJet 48L top = 7.5mm).
        // Raw topOffset-only padding previously pinned the first rows to the page edge.
        const pageMargins = getSheetPageMargins();
        gridDiv.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width}mm);
          grid-template-rows: repeat(${rowsOnThisPage}, ${dimensions.height}mm);
          gap: ${dimensions.gap}mm;
          margin: ${pageMargins.marginTop}mm ${pageMargins.marginRight}mm ${pageMargins.marginBottom}mm ${pageMargins.marginLeft}mm;
          padding: 0;
          width: ${dimensions.cols * dimensions.width + (dimensions.cols - 1) * dimensions.gap}mm;
          height: ${rowsOnThisPage * dimensions.height + (rowsOnThisPage - 1) * dimensions.gap}mm;
          box-sizing: content-box;
          overflow: hidden;
        `;
      }
      
      // Check if using absolute positioning for cell styling
      const useAbsoluteLayout = hasAbsolutePositioning(labelConfig);
      
      for (let i = startIdx; i < endIdx; i++) {
        const cell = document.createElement("div");
        cell.className = "label-cell";
        
        // For thermal 2-Up: no borders, no padding — labels must fill cells exactly
        const isThermalMode = is1Up || isMultiUp;
        
        if (useAbsoluteLayout) {
          // Absolute positioning layout - matches BarTenderLabelDesigner
          cell.style.cssText = `
            width: ${isThermalMode ? baseDimensions.width : dimensions.width}mm;
            height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            min-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            max-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            font-family: Arial, sans-serif;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
            ${isThermalMode ? '' : 'border: 1px solid #e5e5e5;'}
            background: #fff;
            flex-shrink: 0;
          `;
        } else {
          // Legacy flow-based layout
          cell.style.cssText = `
            width: ${isThermalMode ? baseDimensions.width : dimensions.width}mm;
            height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            min-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            max-height: ${isThermalMode ? baseDimensions.height : dimensions.height}mm;
            font-family: Arial, sans-serif;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: ${isThermalMode ? '0' : '2px'};
            box-sizing: border-box;
            ${isThermalMode ? '' : 'border: 1px solid #e5e5e5;'}
            background: #fff;
            line-height: 1.1;
            flex-shrink: 0;
          `;
        }
        
        // Add style tag for inner elements to remove default spacing
        const styleTag = document.createElement("style");
        styleTag.textContent = `
          .label-cell div { line-height: 1.1; }
          .label-cell svg.barcode { display: block; margin: 0 auto; }
          .label-cell .barcode-text { line-height: 1; }
        `;
        cell.appendChild(styleTag);
        cell.innerHTML += allLabels[i].html;
        gridDiv.appendChild(cell);
      }

      tempContainer.appendChild(gridDiv);

      // SVG barcodes are already inline – no conversion needed.
      // Brief wait for DOM to settle before html2canvas capture.
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture this page with high quality - only capture actual content height
      const captureWidthMm = (is1Up || isMultiUp) ? pageWidthMm : 210;
      const captureHeightMm = (is1Up || isMultiUp) ? pageHeightMm : 297;
      const canvas = await html2canvas(tempContainer, {
        scale: (is1Up || isMultiUp) ? 8 : 3, // Higher scale for thermal labels — crisp barcodes
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: captureWidthMm * 3.78, // Convert mm to pixels (1mm = ~3.78px)
        height: captureHeightMm * 3.78,
      });

      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, captureWidthMm, captureHeightMm);
    }

    // Clean up
    document.body.removeChild(tempContainer);

    // Save PDF
    const timestamp = new Date().toISOString().split("T")[0];
    pdf.save(`barcode-labels-${timestamp}.pdf`);

    toast.success(`PDF generated with ${numPages} page${numPages > 1 ? 's' : ''}`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    toast.error("Failed to export PDF");
  }
}
