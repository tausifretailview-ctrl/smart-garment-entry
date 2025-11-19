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

  // Create hidden print container
  const printContainer = document.createElement('div');
  printContainer.id = 'barcode-print-container';
  printContainer.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 210mm;
  `;

  // Add print-specific styles
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body * {
        visibility: hidden;
      }
      #barcode-print-container,
      #barcode-print-container * {
        visibility: visible;
      }
      #barcode-print-container {
        position: fixed;
        left: 0;
        top: 0;
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
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(printContainer);

  try {
    const dimensions = sheetPresets[sheetType];

    const gridDiv = document.createElement('div');
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
        const cell = document.createElement('div');
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
              const textEl = document.createElement('div');
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
    window.print();

    // Cleanup after a delay to allow print dialog to open
    setTimeout(() => {
      document.body.removeChild(printContainer);
      document.head.removeChild(style);
    }, 1000);
  } catch (error) {
    // Cleanup on error
    if (document.body.contains(printContainer)) {
      document.body.removeChild(printContainer);
    }
    if (document.head.contains(style)) {
      document.head.removeChild(style);
    }
    throw error;
  }
};
