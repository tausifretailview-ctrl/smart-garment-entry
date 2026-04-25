import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JsBarcode from 'jsbarcode';
import { LabelDesignConfig, LabelFieldConfig, LabelItem, FieldKey } from '@/types/labelTypes';

const mmToPt = (mm: number): number => mm * 2.8346;

const barcodeToDataURL = (barcode: string, targetWidthMm: number, heightPx: number): string | null => {
  try {
    const canvas = document.createElement('canvas');
    // Use high DPI (300) to prevent line distortion when scaling in PDF
    const targetWidthPx = Math.round(targetWidthMm * 300 / 25.4); // mm to px at 300 DPI
    const targetHeightPx = Math.round(heightPx * 300 / 96); // scale height proportionally
    JsBarcode(canvas, barcode, {
      format: 'CODE128',
      width: Math.max(1, Math.round(targetWidthPx / barcode.length / 11)), // auto-fit line width
      height: targetHeightPx,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch { return null; }
};

// Map field keys to item data — matches PrecisionLabelPreview exactly
const getFieldContent = (key: FieldKey, item: LabelItem, customTextValue?: string, businessName?: string): string => {
  switch (key) {
    case 'productName': return item.product_name || '';
    case 'brand': return item.brand || '';
    case 'category': return item.category || '';
    case 'color': return item.color || '';
    case 'style': return item.style || '';
    case 'size': return item.size || '';
    case 'price': return `Rs.${item.sale_price}`;
    case 'mrp': return item.mrp ? `MRP: ${item.mrp}` : '';
    case 'qty': return item.qty ? `${item.qty} ${item.uom || 'NOS'}` : '';
    case 'barcodeText': return item.barcode || '';
    case 'billNumber': return item.bill_number || '';
    case 'supplierCode': return item.supplier_code || '';
    case 'purchaseCode': return item.purchase_code || '';
    case 'customText': return customTextValue || '';
    case 'businessName': return businessName || item.businessName || '';
    default: return '';
  }
};

export interface A4SheetOptions {
  labelWidthMm: number;
  labelHeightMm: number;
  cols: number;
  rows: number;
  gapMm: number;
  topOffsetMm?: number;
  leftOffsetMm?: number;
  labelConfig: LabelDesignConfig;
  businessName?: string;
}

export const generateA4LabelPdf = async (
  items: LabelItem[],
  options: A4SheetOptions
): Promise<Uint8Array> => {
  const {
    labelWidthMm, labelHeightMm, cols, rows, gapMm,
    topOffsetMm: rawTopOffsetMm = 0,
    leftOffsetMm: rawLeftOffsetMm = 0,
    labelConfig, businessName = '',
  } = options;

  // Enforce a minimum printable-area margin to prevent column 1 / row 1
  // labels from rendering inside the printer's non-printable margin.
  // Most consumer/office printers reserve 3-5mm on all edges.
  const MIN_PRINTABLE_MARGIN_MM = 5;
  const topOffsetMm = Math.max(rawTopOffsetMm, MIN_PRINTABLE_MARGIN_MM);
  const leftOffsetMm = Math.max(rawLeftOffsetMm, MIN_PRINTABLE_MARGIN_MM);

  // Informational warning if layout exceeds A4 dimensions
  const totalWidthMm = leftOffsetMm + cols * labelWidthMm + (cols - 1) * gapMm;
  const totalHeightMm = topOffsetMm + rows * labelHeightMm + (rows - 1) * gapMm;
  if (totalWidthMm > 210 || totalHeightMm > 297) {
    console.warn(
      `[a4LabelPdf] Layout may exceed A4 page bounds: ${totalWidthMm.toFixed(1)}mm x ${totalHeightMm.toFixed(1)}mm (A4 = 210x297mm)`
    );
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = mmToPt(210);
  const PAGE_H = mmToPt(297);
  const labelW = mmToPt(labelWidthMm);
  const labelH = mmToPt(labelHeightMm);
  const gap = mmToPt(gapMm);
  const marginLeft = mmToPt(leftOffsetMm);
  const marginTop = mmToPt(topOffsetMm);

  const allLabels: LabelItem[] = [];
  items.forEach(item => {
    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) allLabels.push(item);
  });

  const labelsPerPage = cols * rows;
  const totalPages = Math.ceil(allLabels.length / labelsPerPage);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const pageLabels = allLabels.slice(pageIdx * labelsPerPage, (pageIdx + 1) * labelsPerPage);

    for (let i = 0; i < pageLabels.length; i++) {
      const item = pageLabels[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = marginLeft + col * (labelW + gap);
      const y = PAGE_H - marginTop - (row + 1) * labelH - row * gap;

      // Draw label border
      page.drawRectangle({ x, y, width: labelW, height: labelH,
        borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5, opacity: 1 });

      // Helper: convert mm position within label to PDF coordinates
      const toX = (fieldXmm: number) => x + mmToPt(fieldXmm);
      // PDF y is bottom-up, field y is top-down within label
      const toY = (fieldYmm: number, fontSizePt: number) => y + labelH - mmToPt(fieldYmm) - fontSizePt;

      // Render text fields using config x/y positions (precision layout)
      const fieldKeys: FieldKey[] = (labelConfig.fieldOrder || []).filter(
        k => k !== 'barcode' && labelConfig[k]?.show
      );

      for (const key of fieldKeys) {
        const field = labelConfig[key] as LabelFieldConfig;
        if (!field || !field.show) continue;

        const content = getFieldContent(key, item, labelConfig.customTextValue, businessName);
        if (!content) continue;

        const f = field.bold ? fontBold : font;
        // Convert px fontSize to pt (1px ≈ 0.75pt)
        const fsPt = Math.max(4, Math.min(14, field.fontSize * 0.75));

        const fieldX = field.x ?? 0;
        const fieldY = field.y ?? 0;

        const pdfX = toX(fieldX);
        const pdfY = toY(fieldY, fsPt);

        // Field width is stored by the label designer as a percentage of the
        // label width (20-100), not as millimetres. Match the Standard Printing
        // HTML renderer so left/right-half fields do not print on the wrong side.
        const availableWidthMm = Math.max(1, labelWidthMm - fieldX);
        const requestedWidthMm = ((field.width ?? 100) / 100) * labelWidthMm;
        const maxWidthMm = Math.min(requestedWidthMm, availableWidthMm);
        const maxWidthPt = mmToPt(maxWidthMm);
        
        let displayText = content;
        try {
          while (displayText.length > 1 && f.widthOfTextAtSize(displayText, fsPt) > maxWidthPt) {
            displayText = displayText.slice(0, -1);
          }
        } catch { /* skip invalid chars */ }

        // Handle text alignment
        const textAlign = field.textAlign || 'left';
        let drawX = pdfX;
        try {
          const textW = f.widthOfTextAtSize(displayText, fsPt);
          if (textAlign === 'center') {
            drawX = pdfX + (maxWidthPt - textW) / 2;
          } else if (textAlign === 'right') {
            drawX = pdfX + maxWidthPt - textW;
          }
        } catch { /* use left */ }

        try {
          page.drawText(displayText, {
            x: drawX, y: pdfY,
            size: fsPt, font: f, color: rgb(0, 0, 0),
          });

          // Draw strikethrough line if enabled
          if (field.strikethrough) {
            const textW = f.widthOfTextAtSize(displayText, fsPt);
            const offsetY = (field.strikethroughOffsetY ?? 0) * fsPt * 0.01;
            const lineY = pdfY + fsPt * 0.35 - offsetY;
            page.drawLine({
              start: { x: drawX, y: lineY },
              end: { x: drawX + textW, y: lineY },
              thickness: Math.max(0.5, fsPt * 0.06),
              color: rgb(0, 0, 0),
            });
          }
        } catch { /* skip invalid chars */ }
      }

      // Render barcode using config position
      const barcodeConfig = labelConfig.barcode;
      if (barcodeConfig?.show && item.barcode) {
        const bcX = barcodeConfig.x ?? 1;
        const bcY = barcodeConfig.y ?? (labelHeightMm * 0.35);
        const bcAvailableWidthMm = Math.max(1, labelWidthMm - bcX);
        const bcRequestedWidthMm = barcodeConfig.width !== undefined
          ? (barcodeConfig.width / 100) * labelWidthMm
          : bcAvailableWidthMm;
        const bcWidthMm = Math.min(bcRequestedWidthMm, bcAvailableWidthMm);
        const barcodeHeightPx = labelConfig.barcodeHeight ?? Math.max(15, labelHeightMm * 0.3 * 3.78);
        const bcHeightMm = barcodeHeightPx / 3.7795;

        const dataUrl = barcodeToDataURL(item.barcode, bcWidthMm, barcodeHeightPx);
        if (dataUrl) {
          try {
            const pngData = await pdfDoc.embedPng(
              Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0))
            );
            const pdfBcX = toX(bcX);
            const pdfBcY = y + labelH - mmToPt(bcY) - mmToPt(bcHeightMm);
            page.drawImage(pngData, {
              x: pdfBcX,
              y: pdfBcY,
              width: mmToPt(bcWidthMm),
              height: mmToPt(bcHeightMm),
            });
          } catch { /* skip */ }
        }
      }
    }
  }

  return await pdfDoc.save();
};
