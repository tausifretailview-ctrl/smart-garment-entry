import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JsBarcode from 'jsbarcode';
import { LabelDesignConfig, LabelItem } from '@/types/labelTypes';

const mmToPt = (mm: number): number => mm * 2.8346;

const barcodeToDataURL = (barcode: string, widthPx: number, heightPx: number): string | null => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, barcode, {
      format: 'CODE128',
      width: Math.max(1, widthPx / 100),
      height: heightPx,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch { return null; }
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
    topOffsetMm = 0, leftOffsetMm = 0,
    labelConfig, businessName = '',
  } = options;

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

      page.drawRectangle({ x, y, width: labelW, height: labelH,
        borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5, opacity: 1 });

      let cursorY = y + labelH - mmToPt(1);

      const drawField = (text: string, fsizePx: number, bold: boolean) => {
        if (!text) return;
        const f = bold ? fontBold : font;
        const fs = fsizePx * 0.75;
        const clampedFs = Math.max(4, Math.min(fs, 12));
        cursorY -= clampedFs + 1;
        if (cursorY < y + mmToPt(5)) return;
        try {
          const textW = f.widthOfTextAtSize(text, clampedFs);
          const drawX = x + (labelW - textW) / 2;
          page.drawText(text.substring(0, 35), {
            x: Math.max(x + 1, drawX), y: cursorY,
            size: clampedFs, font: f, color: rgb(0, 0, 0),
          });
        } catch { /* skip invalid chars */ }
      };

      for (const fieldKey of labelConfig.fieldOrder) {
        const field = labelConfig[fieldKey as keyof LabelDesignConfig] as any;
        if (!field?.show) continue;

        if (fieldKey === 'barcode') {
          const barcodeH = mmToPt(Math.max(5, labelHeightMm * 0.3));
          const barcodeY = y + mmToPt(2);
          const barcodeW = labelW - mmToPt(2);
          const dataUrl = barcodeToDataURL(item.barcode, 200, 60);
          if (dataUrl) {
            try {
              const pngData = await pdfDoc.embedPng(
                Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0))
              );
              page.drawImage(pngData, { x: x + mmToPt(1), y: barcodeY, width: barcodeW, height: barcodeH });
            } catch { /* skip */ }
          }
          continue;
        }

        if (fieldKey === 'barcodeText') continue;

        let text = '';
        switch (fieldKey) {
          case 'brand': text = item.brand || ''; break;
          case 'businessName': text = businessName || ''; break;
          case 'productName': text = item.product_name || ''; break;
          case 'category': text = item.category || ''; break;
          case 'color': text = item.color || ''; break;
          case 'style': text = item.style || ''; break;
          case 'size': text = item.size || ''; break;
          case 'price': text = `₹${item.sale_price}`; break;
          case 'mrp': text = item.mrp ? `MRP ₹${item.mrp}` : ''; break;
          case 'billNumber': text = item.bill_number || ''; break;
          case 'supplierCode': text = item.supplier_code || ''; break;
          case 'purchaseCode': text = item.purchase_code || ''; break;
          case 'customText': text = labelConfig.customTextValue || ''; break;
        }
        if (text) drawField(text, field.fontSize || 9, field.bold || false);
      }

      if (item.barcode) {
        try {
          const fs = 6;
          const tw = font.widthOfTextAtSize(item.barcode, fs);
          page.drawText(item.barcode, {
            x: x + (labelW - tw) / 2, y: y + mmToPt(0.5),
            size: fs, font, color: rgb(0, 0, 0),
          });
        } catch { /* skip */ }
      }
    }
  }

  return await pdfDoc.save();
};
