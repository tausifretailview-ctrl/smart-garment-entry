import JsBarcode from "jsbarcode";

interface BarcodeItem {
  sku_id: string;
  product_name: string;
  brand: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  barcode: string;
  qty: number;
  bill_number?: string;
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
  fieldOrder: string[];
}

interface PrintOptions {
  sheetType?: 'novajet48' | 'novajet40' | 'novajet65' | 'a4_12x4';
  topOffset?: number;
  leftOffset?: number;
  labelConfig?: LabelConfig;
}

const sheetPresets = {
  novajet48: { cols: 8, width: "33mm", height: "19mm", gap: "1mm" },
  novajet40: { cols: 8, width: "35mm", height: "25mm", gap: "1mm" },
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
    brand: { show: true, fontSize: 8, bold: true },
    productName: { show: true, fontSize: 9, bold: false },
    color: { show: false, fontSize: 8, bold: false },
    style: { show: false, fontSize: 8, bold: false },
    size: { show: true, fontSize: 9, bold: false },
    price: { show: true, fontSize: 9, bold: true },
    barcode: { show: true, fontSize: 8, bold: false },
    barcodeText: { show: true, fontSize: 7, bold: false },
    billNumber: { show: false, fontSize: 7, bold: false },
    fieldOrder: []
  };
  
  let html = '';
  
  if (config.brand.show) {
    html += `<div class="brand" style="font-size: ${config.brand.fontSize}px; font-weight: ${config.brand.bold ? 'bold' : 'normal'};">SMART INVENTORY</div>`;
  }
  if (config.productName.show) {
    html += `<div class="prod" style="font-size: ${config.productName.fontSize}px; font-weight: ${config.productName.bold ? 'bold' : 'normal'};">${item.product_name} (${item.size})</div>`;
  }
  if (config.price.show) {
    html += `<div class="mrp" style="font-size: ${config.price.fontSize}px; font-weight: ${config.price.bold ? 'bold' : 'normal'};">MRP: ₹${item.sale_price}</div>`;
  }
  if (config.barcode.show) {
    html += `<svg class="barcode" data-code="${barcode}"></svg>`;
  }
  if (config.barcodeText.show) {
    html += `<div class="meta" style="font-size: ${config.barcodeText.fontSize}px; font-weight: ${config.barcodeText.bold ? 'bold' : 'normal'};">${barcode}</div>`;
  }
  if (config.billNumber.show && item.bill_number) {
    html += `<div class="bill" style="font-size: ${config.billNumber.fontSize}px; font-weight: ${config.billNumber.bold ? 'bold' : 'normal'};">Bill: ${item.bill_number}</div>`;
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
  } = options;

  // Open a dedicated print window so the preview is never blank
  const printWindow = window.open('', '_blank', 'width=1024,height=768');
  if (!printWindow) {
    throw new Error('Unable to open print window for barcode printing');
  }

  const doc = printWindow.document;
  doc.open();
  doc.write('<html><head><title>Barcode Labels</title></head><body></body></html>');
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
      padding: 2mm;
      box-sizing: border-box;
      page-break-inside: avoid;
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
    const dimensions = sheetPresets[sheetType];

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

    // Wait for DOM to be ready, then render barcodes
    await new Promise((resolve) => {
      setTimeout(() => {
        const barcodes = printContainer.querySelectorAll('svg.barcode');
        barcodes.forEach((svg) => {
          const code = (svg as HTMLElement).dataset.code;
          if (code) {
            try {
              JsBarcode(svg, code, {
                format: 'CODE128',
                fontSize: 9,
                height: 24,
                width: 1.5,
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
      }, 200);
    });

    // Trigger print dialog
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Close the helper window shortly after print to keep UX clean
      setTimeout(() => {
        printWindow.close();
      }, 500);
    }, 200);
  } catch (error) {
    // If anything goes wrong, make sure the window is closed and rethrow
    try {
      printWindow.close();
    } catch {}
    throw error;
  }
};
