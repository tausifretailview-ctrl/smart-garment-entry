import type { LabelDesignConfig, LabelFieldConfig, LabelItem } from "@/types/labelTypes";
import {
  labelFieldAllowsMultiline,
  legacyBarcodeHeightMm,
  renderBarcodeSvgString,
  resolveBarcodeSlotMm,
} from "@/utils/barcodeLabelLayout";
import { formatLabelSaleDiscPercent } from "@/utils/labelDesignerPlaceholders";
import { escapeHtml } from "@/utils/escapeHtml";
import type { LabelDesignFormat } from "@/lib/barcode/exportLabelsPdf";
import type { LabelData, TSPLTemplateConfig } from "@/utils/tsplGenerator";

/**
 * Barcode Printing: the HTML of one label for the sheet layouts (print, preview, PDF export).
 * Moved out of BarcodePrinting.tsx unchanged (Plan Phase 4, S4).
 */

/** A random valid EAN-8, used when an item has no barcode. */
export const genEAN8 = (): string => {
  const seven = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
  const sum = seven[0] * 3 + seven[1] + seven[2] * 3 + seven[3] + seven[4] * 3 + seven[5] + seven[6] * 3;
  const chk = (10 - (sum % 10)) % 10;
  return seven.join("") + String(chk);
};

/** True when any field of the design carries x / y (designer layout, not stacked rows). */
export const hasAbsolutePositioning = (config: LabelDesignConfig): boolean => {
  return config.fieldOrder.some(fieldKey => {
    const field = config[fieldKey] as LabelFieldConfig;
    return field && (field.x !== undefined || field.y !== undefined);
  });
};

// Barcode as an inline SVG string (vector, no blur).
const renderBarcodeToSVG = (
  code: string,
  slotWidthMm: number,
  slotHeightMm: number,
  lineWidth: number = 1.5,
): string => renderBarcodeSvgString(code, slotWidthMm, slotHeightMm, lineWidth);

export interface LabelHtmlContext {
  labelConfig: LabelDesignConfig;
  businessName: string;
  labelWidthMm: number;
  labelHeightMm: number;
}

export function buildLabelHtml(item: LabelItem, format: LabelDesignFormat, ctx: LabelHtmlContext): string {
  const barcode = item.barcode || genEAN8();
  const { labelConfig: config, businessName, labelWidthMm, labelHeightMm } = ctx;

  // Get field content matching BarTenderLabelDesigner.getFieldContent exactly
  const getFieldContent = (fieldKey: keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>) => {
    switch (fieldKey) {
      case 'brand': 
        return item.brand || businessName || 'Brand';
      case 'businessName':
        return businessName || '';
      case 'productName':
        return item.product_name;
      case 'category':
        return item.category || '';
      case 'color': 
        return item.color || '';
      case 'style': 
        return item.style || '';
      case 'price': 
        return `Rs.${item.sale_price}`;
      case 'mrp':
        return item.mrp ? `MRP: ${item.mrp}` : '';
      case 'saleDiscPercent':
        return formatLabelSaleDiscPercent(item.sale_disc_percent);
      case 'barcode':
        return barcode;
      case 'barcodeText': 
        return barcode;
      case 'billNumber': 
        return item.bill_number || '';
      case 'supplierCode': 
        return item.supplier_code || '';
      case 'purchaseCode': 
        return item.purchase_code || '';
      case 'supplierInvoiceNo':
        return item.supplier_invoice_no || '';
      case 'size': 
        return item.size || '';
      default: 
        return '';
    }
  };

  // Check if using absolute positioning (matching BarTenderLabelDesigner)
  if (hasAbsolutePositioning(config)) {
    // Generate HTML with absolute positioning matching the designer exactly
    let fieldsHtml = '';

    config.fieldOrder.forEach((fieldKey) => {
      const field = config[fieldKey] as LabelFieldConfig;
      if (!field.show) return;

      const content = getFieldContent(fieldKey);
      if (!content) return;

      const x = field.x ?? 0;
      const y = field.y ?? 0;
      const widthPercent = field.width ?? 100;
      const widthMm = (widthPercent / 100) * labelWidthMm;
      const heightStyle = field.height ? `height: ${field.height}mm;` : '';

      if (fieldKey === 'barcode') {
        const barcodeWidth = config.barcodeWidth || 1.5;
        const labelData: LabelData = {
          productName: item.product_name,
          brand: item.brand,
          category: item.category,
          style: item.style,
          color: item.color,
          size: item.size,
          mrp: item.mrp,
          saleDiscPercent: item.sale_disc_percent,
          salePrice: item.sale_price,
          barcode,
          billNumber: item.bill_number,
          purchaseCode: item.purchase_code,
          supplierCode: item.supplier_code,
          supplierInvoiceNo: item.supplier_invoice_no,
          businessName,
        };
        const barcodeSlot = resolveBarcodeSlotMm(
          { width: labelWidthMm, height: labelHeightMm },
          config as unknown as TSPLTemplateConfig,
          labelData,
        );
        const barcodeHeightMm = barcodeSlot.heightMm;
        const barcodeSvg = renderBarcodeToSVG(barcode, barcodeSlot.widthMm, barcodeHeightMm, barcodeWidth);
        
        fieldsHtml += `
          <div style="
            position: absolute;
            left: ${x}mm;
            top: ${y}mm;
            width: ${widthMm}mm;
            height: ${barcodeHeightMm}mm;
            display: flex;
            justify-content: ${field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center'};
            align-items: flex-start;
            overflow: hidden;
          ">
            ${barcodeSvg ? `<div style="height: ${barcodeHeightMm}mm; max-width: 100%; display: flex; align-items: flex-start; flex-shrink: 0;">${barcodeSvg}</div>` : `<span style="font-size: 8px;">${escapeHtml(barcode)}</span>`}
          </div>
        `;
      } else {
        const allowsMultiline = labelFieldAllowsMultiline(field);
        // Text field with absolute positioning
        fieldsHtml += `
          <div style="
            position: absolute;
            left: ${x}mm;
            top: ${y}mm;
            width: ${widthMm}mm;
            ${heightStyle}
            font-size: ${field.fontSize}px;
            font-weight: ${field.bold ? 'bold' : 'normal'};
            ${field.fontFamily ? `font-family: ${field.fontFamily};` : ''}
            text-align: ${field.textAlign || 'center'};
            line-height: ${field.lineHeight || 1.1};
            white-space: ${allowsMultiline ? 'normal' : 'nowrap'};
            ${allowsMultiline ? 'word-break: break-word;' : ''}
            overflow: hidden;
            ${allowsMultiline ? '' : 'text-overflow: ellipsis;'}
          ">${escapeHtml(content)}</div>
        `;
      }
    });

    return fieldsHtml;
  }

  // Legacy flow-based layout for configs without absolute positioning
  const getStyle = (field: LabelFieldConfig, extraStyles: string = '') => {
    const paddingTop = field.paddingTop ?? 0;
    const paddingBottom = field.paddingBottom ?? 0;
    const paddingLeft = field.paddingLeft ?? 0;
    const paddingRight = field.paddingRight ?? 0;
    return `font-size: ${field.fontSize}px; font-weight: ${field.bold ? 'bold' : 'normal'};${field.fontFamily ? ` font-family: ${field.fontFamily};` : ''} text-align: ${field.textAlign || 'center'}; padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px; line-height: 1.1; width: 100%; box-sizing: border-box;${extraStyles}`;
  };

  let html = '';
  
  config.fieldOrder.forEach((fieldKey) => {
    const field = config[fieldKey] as LabelFieldConfig;
    
    if (!field.show) return;
    
    const content = getFieldContent(fieldKey);
    if (!content) return;
    
    if (fieldKey === 'barcode') {
      const bcPaddingTop = field.paddingTop ?? 0;
      const bcPaddingBottom = field.paddingBottom ?? 0;
      const bcPaddingLeft = field.paddingLeft ?? 0;
      const bcPaddingRight = field.paddingRight ?? 0;
      const barcodeWidth = config.barcodeWidth || 1.8;
      const barcodeHeightMm = legacyBarcodeHeightMm(config.barcodeHeight, labelHeightMm);
      const barcodeSvg = renderBarcodeToSVG(barcode, labelWidthMm, barcodeHeightMm, barcodeWidth);
      
      if (barcodeSvg) {
        html += `<div style="display: flex; justify-content: center; margin: ${bcPaddingTop}px auto ${bcPaddingBottom}px auto; padding-left: ${bcPaddingLeft}px; padding-right: ${bcPaddingRight}px; height: ${barcodeHeightMm}mm; overflow: hidden;">${barcodeSvg}</div>`;
      } else {
        html += `<div style="text-align: center; font-size: 10px; font-weight: bold;">${escapeHtml(barcode)}</div>`;
      }
    } else {
      html += `<div class="${fieldKey}" style="${getStyle(field)}">${escapeHtml(content)}</div>`;
    }
  });

  return html;
}
