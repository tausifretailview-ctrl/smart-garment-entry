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
}

interface PrintOptions {
  sheetType?: 'novajet48' | 'novajet40' | 'novajet65' | 'a4_12x4' | 'custom';
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

const sheetPresets = {
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 5, width: "40mm", height: "32mm", gap: "2mm" },
  novajet65: { cols: 5, width: "38mm", height: "21mm", gap: "1mm" },
  a4_12x4: { cols: 4, width: "50mm", height: "24mm", gap: "1mm" },
};

const getLabelHTML = (
  item: BarcodeItem,
  labelConfig?: LabelConfig
): string => {
  const barcode = item.barcode;
  
  // Use default config if not provided
  const config = labelConfig || {
    brand: { show: false, fontSize: 8, bold: true },
    productName: { show: true, fontSize: 11, bold: true },
    color: { show: true, fontSize: 10, bold: true },
    style: { show: true, fontSize: 10, bold: true },
    size: { show: true, fontSize: 10, bold: true },
    price: { show: true, fontSize: 11, bold: true },
    barcode: { show: true, fontSize: 8, bold: false },
    barcodeText: { show: true, fontSize: 9, bold: true },
    billNumber: { show: false, fontSize: 7, bold: false },
    supplierCode: { show: true, fontSize: 7, bold: false },
    purchaseCode: { show: false, fontSize: 7, bold: false },
    fieldOrder: []
  };
  
  let html = '';
  
  // Add business name at the top if provided
  if (item.business_name) {
    html += `<div class="business-name" style="font-size: 8px; font-weight: bold; margin-bottom: 2mm; text-align: center;">${item.business_name}</div>`;
  }
  
  // Supplier Code
  if (config.supplierCode.show && item.supplier_code) {
    html += `<div class="supplier-code" style="font-size: ${config.supplierCode.fontSize}px; font-weight: ${config.supplierCode.bold ? 'bold' : 'normal'}; margin-bottom: 1mm; text-align: center; color: #666;">Supplier: ${item.supplier_code}</div>`;
  }
  
  // Product Description: ProductName - Category - Brand - Style - Color - Size
  if (config.productName.show) {
    const descParts = [item.product_name];
    if (item.category) descParts.push(item.category);
    if (item.brand) descParts.push(item.brand);
    if (item.style) descParts.push(item.style);
    if (item.color) descParts.push(item.color);
    descParts.push(item.size);
    
    const productDesc = descParts.join(' - ');
    html += `<div class="prod" style="font-size: ${config.productName.fontSize}px; font-weight: ${config.productName.bold ? 'bold' : 'normal'}; margin-bottom: 3mm;">${productDesc}</div>`;
  }
  if (config.price.show) {
    html += `<div class="mrp" style="font-size: ${config.price.fontSize}px; font-weight: ${config.price.bold ? 'bold' : 'normal'}; margin-bottom: 3mm;">MRP: ₹${item.sale_price}</div>`;
  }
  if (config.barcode.show) {
    html += `<svg class="barcode" data-code="${barcode}" style="margin-bottom: 2mm;"></svg>`;
  }
  // Always show barcode text (number)
  html += `<div class="meta" style="font-size: ${config.barcodeText.fontSize}px; font-weight: ${config.barcodeText.bold ? 'bold' : 'normal'}; margin-bottom: 1mm;">${barcode}</div>`;
  
  // Purchase Code
  if (config.purchaseCode.show && item.purchase_code) {
    html += `<div class="purchase-code" style="font-size: ${config.purchaseCode.fontSize}px; font-weight: ${config.purchaseCode.bold ? 'bold' : 'normal'}; margin-bottom: 1mm; text-align: center; color: #666;">Code: ${item.purchase_code}</div>`;
  }
  
  if (config.billNumber.show && item.bill_number) {
    html += `<div class="bill" style="font-size: ${config.billNumber.fontSize}px; font-weight: ${config.billNumber.bold ? 'bold' : 'normal'}; margin-top: 1.5mm;">Bill: ${item.bill_number}</div>`;
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

  // Open a dedicated print window so the preview is never blank
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
  printContainer.style.cssText = `
    width: 210mm;
    margin: 0;
    padding: 0;
  `;

  const style = doc.createElement('style');
  style.textContent = `
    body {
      margin: 0;
      padding: 10mm;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .label-cell {
      border: 1px solid #ddd;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3mm;
      box-sizing: border-box;
      page-break-inside: avoid;
      line-height: 1.4;
    }
    .label-grid {
      page-break-after: auto;
    }
    @page {
      size: A4;
      margin: 0;
    }
  `;

  doc.head.appendChild(style);
  doc.body.appendChild(printContainer);

  try {
    const dimensions = sheetType === 'custom' && customDimensions
      ? { 
          cols: customDimensions.cols, 
          width: `${customDimensions.width}mm`, 
          height: `${customDimensions.height}mm`, 
          gap: `${customDimensions.gap}mm` 
        }
      : sheetPresets[sheetType];

    const gridDiv = doc.createElement('div');
    gridDiv.className = 'label-grid';
    gridDiv.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${dimensions.cols}, ${dimensions.width});
      grid-auto-rows: ${dimensions.height};
      gap: ${dimensions.gap};
      padding-top: ${topOffset}mm;
      padding-left: ${leftOffset}mm;
    `;

    // Generate label cells
    items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      for (let i = 0; i < qty; i++) {
        const cell = doc.createElement('div');
        cell.className = 'label-cell';
        cell.innerHTML = getLabelHTML(item, labelConfig);
        gridDiv.appendChild(cell);
      }
    });

    printContainer.appendChild(gridDiv);

    // Wait for JsBarcode library to load, then render barcodes
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
                  height: 28,
                  width: 1.8,
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
          // Retry after 100ms if JsBarcode isn't loaded yet
          setTimeout(checkJsBarcode, 100);
        }
      };
      // Start checking after a short delay to allow script loading
      setTimeout(checkJsBarcode, 300);
    });

    // Trigger print dialog after barcodes are rendered
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Close the helper window shortly after print to keep UX clean
      setTimeout(() => {
        printWindow.close();
      }, 500);
    }, 300);
  } catch (error) {
    // If anything goes wrong, make sure the window is closed and rethrow
    try {
      printWindow.close();
    } catch {}
    throw error;
  }
};
