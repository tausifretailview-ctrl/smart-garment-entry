import JsBarcode from "jsbarcode";

// Pre-render barcode to image data URL using canvas - PERMANENT FIX for barcode lines
const renderBarcodeToDataURL = (code: string, height: number = 30, width: number = 1.5): string => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      height: height,
      width: width,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to render barcode:', code, error);
    return '';
  }
};

interface BarcodeItem {
  sku_id: string;
  product_name: string;
  brand: string;
  category?: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  mrp?: number;
  pur_price?: number;
  purchase_code?: string;
  barcode: string;
  qty: number;
  bill_number?: string;
  business_name?: string;
  supplier_code?: string;
}

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  textAlign?: 'left' | 'center' | 'right';
  x?: number; // X position in mm
  y?: number; // Y position in mm
  width?: number; // Width as percentage
  height?: number; // Height in mm
  lineHeight?: number;
}

interface LabelConfig {
  brand: LabelFieldConfig;
  productName: LabelFieldConfig;
  color: LabelFieldConfig;
  style: LabelFieldConfig;
  size: LabelFieldConfig;
  price: LabelFieldConfig;
  mrp?: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  fieldOrder: string[];
  barcodeHeight?: number;
  barcodeWidth?: number;
}

interface PrintOptions {
  sheetType?: 'novajet48' | 'novajet40' | 'novajet65' | 'a4_12x4' | 'a4_35x37' |
    'thermal_50x30_1up' | 'thermal_50x25_1up' | 'thermal_38x25_1up' |
    'thermal_50x30_2up' | 'thermal_50x25_2up' | 'thermal_38x25_2up' | 'custom';
  topOffset?: number;
  leftOffset?: number;
  labelConfig?: LabelConfig;
  customDimensions?: {
    width: number;
    height: number;
    cols: number;
    gap: number;
  };
}

const sheetPresets: Record<string, { cols: number; rows?: number; width: string; height: string; gap: string; thermal?: boolean }> = {
  // A4 Sheet Presets
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "auto" },
  a4_35x37: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "auto" },
  novajet65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm" },
  a4_12x4: { cols: 4, width: "50mm", height: "24mm", gap: "1mm" },
  // Thermal Roll Presets (1UP)
  thermal_50x30_1up: { cols: 1, width: "50mm", height: "30mm", gap: "0mm", thermal: true },
  thermal_50x25_1up: { cols: 1, width: "50mm", height: "25mm", gap: "0mm", thermal: true },
  thermal_38x25_1up: { cols: 1, width: "38mm", height: "25mm", gap: "0mm", thermal: true },
  // Thermal Roll Presets (2UP)
  thermal_50x30_2up: { cols: 2, width: "50mm", height: "30mm", gap: "2mm", thermal: true },
  thermal_50x25_2up: { cols: 2, width: "50mm", height: "25mm", gap: "2mm", thermal: true },
  thermal_38x25_2up: { cols: 2, width: "38mm", height: "25mm", gap: "2mm", thermal: true },
};

// Check if config has absolute positioning (x/y defined)
const hasAbsolutePositioning = (config: LabelConfig): boolean => {
  const fields = ['brand', 'productName', 'color', 'style', 'size', 'price', 'barcode', 'barcodeText', 'billNumber', 'supplierCode', 'purchaseCode'];
  return fields.some(fieldKey => {
    const field = config[fieldKey as keyof LabelConfig] as LabelFieldConfig | undefined;
    return field && (field.x !== undefined || field.y !== undefined);
  });
};

// Generate HTML for absolute positioned label (matching designer)
const getAbsolutePositionedLabelHTML = (
  item: BarcodeItem,
  labelConfig: LabelConfig,
  labelWidthMm: number,
  labelHeightMm: number
): string => {
  const fieldMap: Record<string, { content: string; key: string }> = {
    brand: { content: item.brand || '', key: 'brand' },
    productName: { content: item.product_name || '', key: 'productName' },
    color: { content: item.color || '', key: 'color' },
    style: { content: item.style || '', key: 'style' },
    size: { content: item.size || '', key: 'size' },
    price: { content: `₹${item.sale_price}`, key: 'price' },
    barcode: { content: item.barcode, key: 'barcode' },
    barcodeText: { content: item.barcode, key: 'barcodeText' },
    billNumber: { content: item.bill_number || '', key: 'billNumber' },
    supplierCode: { content: item.supplier_code || '', key: 'supplierCode' },
    purchaseCode: { content: item.purchase_code || '', key: 'purchaseCode' },
  };

  let fieldsHtml = '';

  Object.entries(fieldMap).forEach(([fieldKey, { content, key }]) => {
    const field = labelConfig[fieldKey as keyof LabelConfig] as LabelFieldConfig | undefined;
    if (!field || !field.show || !content) return;

    const x = field.x ?? 0;
    const y = field.y ?? 0;
    const widthPercent = field.width ?? 100;
    const widthMm = (widthPercent / 100) * labelWidthMm;
    const heightStyle = field.height ? `height: ${field.height}mm;` : '';

    if (fieldKey === 'barcode') {
      // Pre-render barcode as image for reliable printing
      const barcodeHeightMm = Math.max(6, (labelConfig.barcodeHeight || 30) * 0.4);
      const barcodeDataUrl = renderBarcodeToDataURL(content, labelConfig.barcodeHeight || 30, labelConfig.barcodeWidth || 1.5);
      fieldsHtml += `
        <div style="
          position: absolute;
          left: ${x}mm;
          top: ${y}mm;
          width: ${widthMm}mm;
          height: ${barcodeHeightMm}mm;
          display: flex;
          justify-content: ${field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center'};
          align-items: center;
          overflow: visible;
        ">
          ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="height: ${barcodeHeightMm}mm; max-width: 100%; display: block;" alt="barcode" />` : `<span style="font-size: 8px;">${content}</span>`}
        </div>
      `;
    } else {
      // Text field
      fieldsHtml += `
        <div style="
          position: absolute;
          left: ${x}mm;
          top: ${y}mm;
          width: ${widthMm}mm;
          ${heightStyle}
          font-size: ${field.fontSize}px;
          font-weight: ${field.bold ? 'bold' : 'normal'};
          text-align: ${field.textAlign || 'center'};
          line-height: ${field.lineHeight || 1.1};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${content}</div>
      `;
    }
  });

  return fieldsHtml;
};

// VasyERP-style thermal label layout for 50x25mm
const getThermalLabelHTML = (
  item: BarcodeItem,
  labelConfig?: LabelConfig
): string => {
  const barcode = item.barcode;
  const mrp = item.mrp || item.sale_price;
  const ourPrice = item.sale_price;
  const productWithSize = item.product_name;
  const brand = item.brand || '';
  
  // Compact thermal layout matching VasyERP style
  return `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 1mm 1.5mm; box-sizing: border-box; font-family: Arial, sans-serif;">
      <div style="font-size: 8px; font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${productWithSize}</div>
      <div style="font-size: 7px; text-align: center; font-weight: bold;">MRP: ₹${mrp}</div>
      <div style="font-size: 7px; text-align: center; font-weight: bold;">Our Price: ₹${ourPrice}</div>
      <div style="display: flex; justify-content: center; align-items: center; flex: 1; min-height: 8mm;">
        ${(() => {
          const barcodeDataUrl = renderBarcodeToDataURL(barcode, 30, 1.5);
          return barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="height: 8mm; max-width: 100%;" alt="barcode" />` : `<span style="font-size: 8px;">${barcode}</span>`;
        })()}
      </div>
      <div style="font-size: 7px; text-align: center; font-weight: bold;">${barcode}</div>
      <div style="font-size: 6px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${brand}</div>
    </div>
  `;
};

// Legacy flow-based layout
const getLegacyLabelHTML = (
  item: BarcodeItem,
  labelConfig?: LabelConfig
): string => {
  const barcode = item.barcode;
  
  // Use default config if not provided
  const defaultConfig = {
    brand: { show: false, fontSize: 8, bold: true, textAlign: 'center' as const },
    productName: { show: true, fontSize: 11, bold: true, textAlign: 'center' as const },
    color: { show: true, fontSize: 10, bold: true, textAlign: 'center' as const },
    style: { show: true, fontSize: 10, bold: true, textAlign: 'center' as const },
    size: { show: true, fontSize: 10, bold: true, textAlign: 'center' as const },
    price: { show: true, fontSize: 11, bold: true, textAlign: 'center' as const },
    barcode: { show: true, fontSize: 8, bold: false, textAlign: 'center' as const },
    barcodeText: { show: true, fontSize: 9, bold: true, textAlign: 'center' as const },
    billNumber: { show: false, fontSize: 7, bold: false, textAlign: 'center' as const },
    supplierCode: { show: true, fontSize: 7, bold: false, textAlign: 'center' as const },
    purchaseCode: { show: true, fontSize: 7, bold: false, textAlign: 'center' as const },
    fieldOrder: []
  };
  
  const config = labelConfig ? {
    ...defaultConfig,
    ...labelConfig,
    purchaseCode: labelConfig.purchaseCode || defaultConfig.purchaseCode,
    supplierCode: labelConfig.supplierCode || defaultConfig.supplierCode,
  } : defaultConfig;
  
  let html = '';
  
  if (item.business_name) {
    html += `<div class="business-name" style="font-size: 8px; font-weight: bold; margin-bottom: 2mm; text-align: ${config.supplierCode.textAlign || 'center'};">${item.business_name}</div>`;
  }
  
  if (config.supplierCode.show && item.supplier_code) {
    html += `<div class="supplier-code" style="font-size: ${config.supplierCode.fontSize}px; font-weight: ${config.supplierCode.bold ? 'bold' : 'normal'}; margin-bottom: 1mm; text-align: ${config.supplierCode.textAlign || 'center'}; color: #666;">Supplier: ${item.supplier_code}</div>`;
  }
  
  if (config.productName.show) {
    html += `<div class="prod" style="font-size: ${config.productName.fontSize}px; font-weight: ${config.productName.bold ? 'bold' : 'normal'}; text-align: ${config.productName.textAlign || 'center'}; margin-bottom: 3mm;">${item.product_name}</div>`;
  }
  if (config.price.show) {
    html += `<div class="mrp" style="font-size: ${config.price.fontSize}px; font-weight: ${config.price.bold ? 'bold' : 'normal'}; text-align: ${config.price.textAlign || 'center'}; margin-bottom: 3mm;">MRP: ₹${item.sale_price}</div>`;
  }
  if (config.barcode.show) {
    const barcodeDataUrl = renderBarcodeToDataURL(barcode, 35, 2);
    html += barcodeDataUrl 
      ? `<img src="${barcodeDataUrl}" style="margin-bottom: 2mm; max-width: 100%; display: block; margin-left: auto; margin-right: auto;" alt="barcode" />`
      : `<div style="font-size: 10px; text-align: center; margin-bottom: 2mm;">${barcode}</div>`;
  }
  html += `<div class="meta" style="font-size: ${config.barcodeText.fontSize}px; font-weight: ${config.barcodeText.bold ? 'bold' : 'normal'}; text-align: ${config.barcodeText.textAlign || 'center'}; margin-bottom: 1mm;">${barcode}</div>`;
  
  if (config.purchaseCode.show && item.purchase_code) {
    html += `<div class="purchase-code" style="font-size: ${config.purchaseCode.fontSize}px; font-weight: ${config.purchaseCode.bold ? 'bold' : 'normal'}; text-align: ${config.purchaseCode.textAlign || 'center'}; margin-bottom: 1mm; color: #666;">Code: ${item.purchase_code}</div>`;
  }
  
  if (config.billNumber.show && item.bill_number) {
    html += `<div class="bill" style="font-size: ${config.billNumber.fontSize}px; font-weight: ${config.billNumber.bold ? 'bold' : 'normal'}; text-align: ${config.billNumber.textAlign || 'center'}; margin-top: 1.5mm;">Bill: ${item.bill_number}</div>`;
  }
  
  return html;
};

export const printBarcodesDirectly = async (
  items: BarcodeItem[],
  options: PrintOptions = {}
): Promise<void> => {
  const {
    sheetType = 'a4_12x4',
    topOffset = 0,
    leftOffset = 0,
    labelConfig,
    customDimensions,
  } = options;

  const isThermal = sheetType.startsWith('thermal_');
  const is1Up = sheetType.includes('_1up');
  const preset = sheetPresets[sheetType];

  // Calculate dimensions first (needed for print instructions)
  const dimensions = sheetType === 'custom' && customDimensions
    ? { 
        cols: customDimensions.cols, 
        width: `${customDimensions.width}mm`, 
        height: `${customDimensions.height}mm`, 
        gap: `${customDimensions.gap}mm` 
      }
    : preset || sheetPresets['a4_12x4'];

  const labelWidth = parseFloat(dimensions.width);
  const labelHeight = parseFloat(dimensions.height);
  const gapValue = parseFloat(dimensions.gap);

  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    throw new Error('Unable to open print window for barcode printing');
  }

  const doc = printWindow.document;
  doc.open();
  
  // For thermal printers, add print instructions banner (hidden when printing)
  const printInstructions = isThermal ? `
    <div id="print-instructions" style="
      background: #FEF3C7;
      border: 1px solid #F59E0B;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 10px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #92400E;
    ">
      <strong>🖨️ Thermal Printer Settings:</strong><br/>
      1. Set <b>Margins</b> to "<b>None</b>"<br/>
      2. Set <b>Paper size</b> to "<b>${labelWidth}mm × ${labelHeight}mm</b>" (or your custom stock)<br/>
      3. Uncheck "<b>Headers and footers</b>"<br/>
      4. For best results: Click "<b>More settings</b>" → "<b>Print using system dialog</b>" (Ctrl+Shift+P)
    </div>
  ` : '';
  
  doc.write(`
    <html>
      <head>
        <title>Barcode Labels - ${isThermal ? `${labelWidth}×${labelHeight}mm` : 'A4'}</title>
        <style>
          @media print {
            #print-instructions { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${printInstructions}
      </body>
    </html>
  `);
  doc.close();

  const printContainer = doc.createElement('div');
  printContainer.id = 'barcode-print-container';

  // Check if using absolute positioning
  const useAbsolutePositioning = labelConfig && hasAbsolutePositioning(labelConfig);

  const style = doc.createElement('style');
  
  if (isThermal && is1Up) {
    // Thermal 1UP: Each label is a separate page with strict page size enforcement
    style.textContent = `
      *, *::before, *::after {
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      @page {
        size: ${labelWidth}mm ${labelHeight}mm !important;
        margin: 0mm 0mm 0mm 0mm !important;
        padding: 0mm !important;
      }
      html {
        margin: 0 !important;
        padding: 0 !important;
        width: ${labelWidth}mm !important;
        height: auto !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${labelWidth}mm !important;
        font-family: Arial, sans-serif;
        background: white;
      }
      .thermal-page {
        width: ${labelWidth}mm !important;
        height: ${labelHeight}mm !important;
        min-height: ${labelHeight}mm !important;
        max-height: ${labelHeight}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        ${useAbsolutePositioning ? 'position: relative !important;' : ''}
      }
      .thermal-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      @media print {
        @page {
          size: ${labelWidth}mm ${labelHeight}mm !important;
          margin: 0mm !important;
        }
        html, body {
          width: ${labelWidth}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .thermal-page {
          width: ${labelWidth}mm !important;
          height: ${labelHeight}mm !important;
          min-height: ${labelHeight}mm !important;
          max-height: ${labelHeight}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .thermal-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
      @media screen {
        body {
          background: #f0f0f0;
          padding: 10px !important;
        }
        .thermal-page {
          border: 1px dashed #999;
          margin-bottom: 8px !important;
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
      }
    `;
  } else if (isThermal) {
    // Thermal 2UP: Labels side by side with strict page size enforcement
    const pageWidth = (labelWidth * dimensions.cols) + (gapValue * (dimensions.cols - 1));
    style.textContent = `
      *, *::before, *::after {
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      @page {
        size: ${pageWidth}mm ${labelHeight}mm !important;
        margin: 0mm 0mm 0mm 0mm !important;
        padding: 0mm !important;
      }
      html {
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageWidth}mm !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageWidth}mm !important;
        font-family: Arial, sans-serif;
        background: white;
      }
      .label-row {
        display: flex !important;
        gap: ${gapValue}mm;
        width: ${pageWidth}mm !important;
        height: ${labelHeight}mm !important;
        min-height: ${labelHeight}mm !important;
        max-height: ${labelHeight}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .label-row:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .label-cell {
        width: ${labelWidth}mm !important;
        height: ${labelHeight}mm !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        ${useAbsolutePositioning ? 'position: relative !important;' : ''}
      }
      @media print {
        @page {
          size: ${pageWidth}mm ${labelHeight}mm !important;
          margin: 0mm !important;
        }
        html, body {
          width: ${pageWidth}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .label-row {
          width: ${pageWidth}mm !important;
          height: ${labelHeight}mm !important;
        }
      }
      @media screen {
        body {
          background: #f0f0f0;
          padding: 10px !important;
        }
        .label-row {
          border: 1px dashed #999;
          margin-bottom: 8px !important;
          background: white;
        }
      }
    `;
  } else {
    // A4 Sheet: Calculated exact positioning for perfect alignment
    const isNovajet40 = sheetType === 'novajet40' || sheetType === 'a4_35x37';
    const pageWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const cols = dimensions.cols;
    const rows = preset?.rows || 8; // Default 8 rows for novajet40
    
    // Calculate exact margins and gaps for even distribution
    const totalLabelWidth = cols * labelWidth;
    const totalLabelHeight = rows * labelHeight;
    const horizontalSpace = pageWidth - totalLabelWidth;
    const verticalSpace = pageHeight - totalLabelHeight;
    
    // Distribute space evenly: margin on edges + gaps between labels
    const hMargin = horizontalSpace / (cols + 1);
    const vMargin = verticalSpace / (rows + 1);
    
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      @page {
        size: A4;
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        width: ${pageWidth}mm;
      }
      .a4-page {
        width: ${pageWidth}mm;
        height: ${pageHeight}mm;
        position: relative;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .a4-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .label-cell {
        position: absolute;
        width: ${labelWidth}mm;
        height: ${labelHeight}mm;
        border: 1px solid #ddd;
        ${useAbsolutePositioning ? '' : `
          display: flex;
          flex-direction: column;
          align-items: ${isNovajet40 ? 'flex-start' : 'center'};
          justify-content: ${isNovajet40 ? 'flex-start' : 'center'};
          text-align: ${isNovajet40 ? 'left' : 'center'};
        `}
        padding: ${useAbsolutePositioning ? '0' : (isNovajet40 ? '1mm 1.5mm' : '0.5mm 1.5mm')};
        box-sizing: border-box;
        line-height: 1.4;
        overflow: hidden;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .label-cell {
          border: none !important;
        }
        .a4-page {
          width: ${pageWidth}mm !important;
          height: ${pageHeight}mm !important;
        }
      }
      @media screen {
        body {
          background: #f0f0f0;
          padding: 10px !important;
        }
        .a4-page {
          background: white;
          margin-bottom: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
      }
    `;
  }

  doc.head.appendChild(style);
  doc.body.appendChild(printContainer);
  
  try {
    if (isThermal && is1Up) {
      // Thermal 1UP: Each label is wrapped in its own page div
      items.forEach((item) => {
        const qty = Number(item.qty) || 0;
        for (let i = 0; i < qty; i++) {
          const pageDiv = doc.createElement('div');
          pageDiv.className = 'thermal-page';
          
          if (useAbsolutePositioning && labelConfig) {
            pageDiv.style.position = 'relative';
            pageDiv.innerHTML = getAbsolutePositionedLabelHTML(item, labelConfig, labelWidth, labelHeight);
          } else {
            pageDiv.innerHTML = getThermalLabelHTML(item, labelConfig);
          }
          printContainer.appendChild(pageDiv);
        }
      });
    } else if (isThermal) {
      // Thermal 2UP: Group labels into rows
      const allLabels: Array<{ item: BarcodeItem; html: string }> = [];
      items.forEach((item) => {
        const qty = Number(item.qty) || 0;
        for (let i = 0; i < qty; i++) {
          const html = useAbsolutePositioning && labelConfig
            ? getAbsolutePositionedLabelHTML(item, labelConfig, labelWidth, labelHeight)
            : getThermalLabelHTML(item, labelConfig);
          allLabels.push({ item, html });
        }
      });

      for (let i = 0; i < allLabels.length; i += dimensions.cols) {
        const rowDiv = doc.createElement('div');
        rowDiv.className = 'label-row';
        
        for (let j = 0; j < dimensions.cols; j++) {
          const cell = doc.createElement('div');
          cell.className = 'label-cell';
          if (i + j < allLabels.length) {
            cell.innerHTML = allLabels[i + j].html;
          }
          rowDiv.appendChild(cell);
        }
        printContainer.appendChild(rowDiv);
      }
    } else {
      // A4 Sheet: Calculated exact positioning for perfect alignment
      const currentPreset = sheetPresets[sheetType];
      const cols = dimensions.cols;
      const rows = currentPreset?.rows || 8;
      const labelsPerPage = cols * rows;
      const pageWidth = 210;
      const pageHeight = 297;
      
      // Calculate exact positioning
      const totalLabelWidth = cols * labelWidth;
      const totalLabelHeight = rows * labelHeight;
      const horizontalSpace = pageWidth - totalLabelWidth;
      const verticalSpace = pageHeight - totalLabelHeight;
      const hMargin = horizontalSpace / (cols + 1);
      const vMargin = verticalSpace / (rows + 1);
      
      // Collect all labels first
      const allLabels: string[] = [];
      items.forEach((item) => {
        const qty = Number(item.qty) || 0;
        for (let i = 0; i < qty; i++) {
          const html = useAbsolutePositioning && labelConfig
            ? getAbsolutePositionedLabelHTML(item, labelConfig, labelWidth, labelHeight)
            : getLegacyLabelHTML(item, labelConfig);
          allLabels.push(html);
        }
      });

      // Create pages with exact calculated positions
      for (let pageStart = 0; pageStart < allLabels.length; pageStart += labelsPerPage) {
        const pageDiv = doc.createElement('div');
        pageDiv.className = 'a4-page';
        
        const pageLabels = allLabels.slice(pageStart, pageStart + labelsPerPage);
        pageLabels.forEach((html, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          
          // Calculate exact position in mm
          const x = hMargin + col * (labelWidth + hMargin) + (leftOffset || 0);
          const y = vMargin + row * (labelHeight + vMargin) + (topOffset || 0);
          
          const cell = doc.createElement('div');
          cell.className = 'label-cell';
          cell.style.left = `${x}mm`;
          cell.style.top = `${y}mm`;
          if (useAbsolutePositioning) {
            cell.style.position = 'relative';
          }
          cell.innerHTML = html;
          pageDiv.appendChild(cell);
        });
        
        printContainer.appendChild(pageDiv);
      }
    }

    // Barcodes are now pre-rendered as images, no need to wait for JsBarcode library
    // Just wait for images to load
    await new Promise<void>((resolve) => {
      const images = printContainer.querySelectorAll('img');
      if (images.length === 0) {
        resolve();
        return;
      }
      
      let loadedCount = 0;
      const checkAllLoaded = () => {
        loadedCount++;
        if (loadedCount >= images.length) {
          resolve();
        }
      };
      
      images.forEach((img) => {
        if (img.complete) {
          checkAllLoaded();
        } else {
          img.onload = checkAllLoaded;
          img.onerror = checkAllLoaded;
        }
      });
      
      // Fallback timeout
      setTimeout(resolve, 2000);
    });

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        printWindow.close();
      }, 500);
    }, 200);
  } catch (error) {
    try {
      printWindow.close();
    } catch {}
    throw error;
  }
};
