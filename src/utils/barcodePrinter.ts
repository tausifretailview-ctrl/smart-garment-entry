import JsBarcode from "jsbarcode";

interface BarcodeItem {
  sku_id: string;
  product_name: string;
  brand: string;
  category?: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
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
  sheetType?: 'novajet48' | 'novajet40' | 'novajet65' | 'a4_12x4' | 
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

const sheetPresets: Record<string, { cols: number; width: string; height: string; gap: string; thermal?: boolean }> = {
  // A4 Sheet Presets
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 5, width: "39mm", height: "35mm", gap: "1.2mm" },
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
      // Barcode SVG
      fieldsHtml += `
        <div style="
          position: absolute;
          left: ${x}mm;
          top: ${y}mm;
          width: ${widthMm}mm;
          ${heightStyle}
          display: flex;
          justify-content: ${field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center'};
          align-items: center;
        ">
          <svg class="barcode" data-code="${content}" style="height: ${(labelConfig.barcodeHeight || 20) * 0.35}mm; max-width: 100%;"></svg>
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
    const descParts = [item.product_name];
    if (item.category) descParts.push(item.category);
    if (item.brand) descParts.push(item.brand);
    if (item.style) descParts.push(item.style);
    if (item.color) descParts.push(item.color);
    descParts.push(item.size);
    
    const productDesc = descParts.join(' - ');
    html += `<div class="prod" style="font-size: ${config.productName.fontSize}px; font-weight: ${config.productName.bold ? 'bold' : 'normal'}; text-align: ${config.productName.textAlign || 'center'}; margin-bottom: 3mm;">${productDesc}</div>`;
  }
  if (config.price.show) {
    html += `<div class="mrp" style="font-size: ${config.price.fontSize}px; font-weight: ${config.price.bold ? 'bold' : 'normal'}; text-align: ${config.price.textAlign || 'center'}; margin-bottom: 3mm;">MRP: ₹${item.sale_price}</div>`;
  }
  if (config.barcode.show) {
    html += `<svg class="barcode" data-code="${barcode}" style="margin-bottom: 2mm;"></svg>`;
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
  const preset = sheetPresets[sheetType];

  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    throw new Error('Unable to open print window for barcode printing');
  }

  const doc = printWindow.document;
  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Barcode Labels</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      </head>
      <body></body>
    </html>
  `);
  doc.close();

  const printContainer = doc.createElement('div');
  printContainer.id = 'barcode-print-container';
  
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
  
  const pageWidth = isThermal 
    ? (labelWidth * dimensions.cols) + (gapValue * (dimensions.cols - 1))
    : 210;
  
  printContainer.style.cssText = `
    width: ${pageWidth}mm;
    margin: 0;
    padding: 0;
  `;

  const labelCount = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const rows = Math.ceil(labelCount / dimensions.cols);
  const contentHeight = (rows * labelHeight) + ((rows - 1) * gapValue) + topOffset + 10;

  // Check if using absolute positioning
  const useAbsolutePositioning = labelConfig && hasAbsolutePositioning(labelConfig);

  const style = doc.createElement('style');
  style.textContent = `
    body {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .label-cell {
      border: ${isThermal ? 'none' : '1px solid #ddd'};
      ${useAbsolutePositioning ? 'position: relative;' : `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      `}
      padding: ${useAbsolutePositioning ? '0' : '0.5mm 1.5mm'};
      box-sizing: border-box;
      page-break-inside: avoid;
      line-height: 1.4;
      overflow: hidden;
    }
    .label-grid {
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
    }
    @page {
      size: ${pageWidth}mm ${isThermal ? labelHeight : contentHeight}mm;
      margin: 0;
    }
    @media print {
      html, body {
        width: ${pageWidth}mm;
        height: ${isThermal ? 'auto' : contentHeight + 'mm'};
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      * {
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
      }
      ${isThermal ? `
      .label-cell {
        page-break-after: ${dimensions.cols === 1 ? 'always' : 'avoid'};
      }
      ` : ''}
    }
  `;

  doc.head.appendChild(style);
  doc.body.appendChild(printContainer);
  
  try {
    const gridDiv = doc.createElement('div');
    gridDiv.className = 'label-grid';
    gridDiv.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width});
      grid-auto-rows: ${dimensions.height};
      gap: ${dimensions.gap};
      padding-top: ${topOffset}mm;
      padding-left: ${leftOffset}mm;
      ${isThermal ? 'margin: 0;' : ''}
    `;

    items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      for (let i = 0; i < qty; i++) {
        const cell = doc.createElement('div');
        cell.className = 'label-cell';
        cell.style.width = dimensions.width;
        cell.style.height = dimensions.height;
        
        if (useAbsolutePositioning && labelConfig) {
          cell.innerHTML = getAbsolutePositionedLabelHTML(item, labelConfig, labelWidth, labelHeight);
        } else {
          cell.innerHTML = getLegacyLabelHTML(item, labelConfig);
        }
        gridDiv.appendChild(cell);
      }
    });

    printContainer.appendChild(gridDiv);

    await new Promise((resolve) => {
      const checkJsBarcode = () => {
        if ((printWindow as any).JsBarcode) {
          const barcodes = printContainer.querySelectorAll('svg.barcode');
          barcodes.forEach((svg) => {
            const code = (svg as HTMLElement).dataset.code;
            if (code) {
              try {
                (printWindow as any).JsBarcode(svg, code, {
                  format: 'CODE128',
                  fontSize: 10,
                  height: labelConfig?.barcodeHeight || 28,
                  width: labelConfig?.barcodeWidth || 1.8,
                  textMargin: 0,
                  margin: 0,
                  displayValue: false,
                });
              } catch (error) {
                console.error('Barcode generation failed for code:', code, error);
                const textEl = doc.createElement('div');
                textEl.textContent = code;
                textEl.style.cssText = 'font-size: 10px; font-weight: bold;';
                svg.parentElement?.replaceChild(textEl, svg);
              }
            }
          });
          resolve(true);
        } else {
          setTimeout(checkJsBarcode, 100);
        }
      };
      setTimeout(checkJsBarcode, 300);
    });

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        printWindow.close();
      }, 500);
    }, 300);
  } catch (error) {
    try {
      printWindow.close();
    } catch {}
    throw error;
  }
};
