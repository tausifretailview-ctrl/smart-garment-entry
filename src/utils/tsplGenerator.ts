// TSPL Command Generator for TSC Thermal Printers
// Generates raw TSPL/TSPL2 commands for direct printing

export interface TSPLLabelConfig {
  width: number; // in mm
  height: number; // in mm
  gap: number; // gap between labels in mm
}

export interface TSPLTextItem {
  x: number; // x position in dots (8 dots = 1mm for 203dpi)
  y: number; // y position in dots
  text: string;
  fontSize: number; // 1-8 for built-in fonts
  bold?: boolean;
  rotation?: 0 | 90 | 180 | 270;
}

export interface TSPLBarcodeItem {
  x: number;
  y: number;
  type: '128' | '39' | 'EAN13' | 'EAN8' | 'UPCA';
  height: number; // barcode height in dots
  data: string;
  readable?: 0 | 1 | 2 | 3; // 0=no text, 1=align left, 2=center, 3=right
  narrow?: number; // narrow bar width
  wide?: number; // wide bar width
}

export interface LabelData {
  productName?: string;
  brand?: string;
  size?: string;
  color?: string;
  mrp?: number;
  salePrice?: number;
  barcode?: string;
  billNumber?: string;
  purchaseCode?: string;
}

// Convert mm to dots (203 DPI = 8 dots per mm)
const mmToDots = (mm: number, dpi: number = 203): number => {
  return Math.round(mm * (dpi / 25.4));
};

// Generate TSPL SIZE command
export const generateSizeCommand = (width: number, height: number): string => {
  return `SIZE ${width} mm, ${height} mm`;
};

// Generate TSPL GAP command
export const generateGapCommand = (gap: number, offset: number = 0): string => {
  return `GAP ${gap} mm, ${offset} mm`;
};

// Generate TSPL TEXT command
export const generateTextCommand = (item: TSPLTextItem): string => {
  const rotation = item.rotation || 0;
  const font = item.bold ? '3' : '2'; // Font 3 is bolder
  return `TEXT ${item.x},${item.y},"${font}",${rotation},1,1,"${item.text}"`;
};

// Generate TSPL BARCODE command
export const generateBarcodeCommand = (item: TSPLBarcodeItem): string => {
  const readable = item.readable ?? 2; // default center aligned text
  const narrow = item.narrow || 2;
  const wide = item.wide || 2;
  return `BARCODE ${item.x},${item.y},"${item.type}",${item.height},${readable},0,${narrow},${wide},"${item.data}"`;
};

// Generate complete TSPL label for thermal printing
export const generateTSPLLabel = (
  labelConfig: TSPLLabelConfig,
  data: LabelData,
  copies: number = 1
): string => {
  const commands: string[] = [];
  
  // Label setup
  commands.push(generateSizeCommand(labelConfig.width, labelConfig.height));
  commands.push(generateGapCommand(labelConfig.gap));
  commands.push('DIRECTION 1');
  commands.push('CLS'); // Clear buffer
  
  // Calculate positions based on label size (in dots, 8 dots = 1mm at 203 DPI)
  const labelWidthDots = mmToDots(labelConfig.width);
  const labelHeightDots = mmToDots(labelConfig.height);
  
  let yPos = 8; // Start position
  const xMargin = 16; // Left margin in dots (2mm)
  
  // Product Name + Size (first line)
  if (data.productName || data.size) {
    const nameText = data.size 
      ? `${data.productName || ''} - ${data.size}`.trim()
      : data.productName || '';
    if (nameText) {
      commands.push(generateTextCommand({
        x: xMargin,
        y: yPos,
        text: nameText.substring(0, 25), // Limit length
        fontSize: 2,
        bold: true
      }));
      yPos += 24;
    }
  }
  
  // Brand (if available)
  if (data.brand) {
    commands.push(generateTextCommand({
      x: xMargin,
      y: yPos,
      text: data.brand.substring(0, 20),
      fontSize: 1
    }));
    yPos += 16;
  }
  
  // Color (if available)
  if (data.color) {
    commands.push(generateTextCommand({
      x: xMargin,
      y: yPos,
      text: `Color: ${data.color}`,
      fontSize: 1
    }));
    yPos += 16;
  }
  
  // Prices - MRP and Sale Price on same line if both exist
  if (data.mrp || data.salePrice) {
    let priceText = '';
    if (data.mrp && data.salePrice && data.mrp !== data.salePrice) {
      priceText = `MRP: ₹${data.mrp} | ₹${data.salePrice}`;
    } else if (data.salePrice) {
      priceText = `₹${data.salePrice}`;
    } else if (data.mrp) {
      priceText = `MRP: ₹${data.mrp}`;
    }
    
    if (priceText) {
      commands.push(generateTextCommand({
        x: xMargin,
        y: yPos,
        text: priceText,
        fontSize: 2,
        bold: true
      }));
      yPos += 24;
    }
  }
  
  // Barcode
  if (data.barcode) {
    // Position barcode
    const barcodeHeight = Math.min(40, labelHeightDots - yPos - 32);
    if (barcodeHeight > 20) {
      commands.push(generateBarcodeCommand({
        x: xMargin,
        y: yPos,
        type: '128',
        height: barcodeHeight,
        data: data.barcode,
        readable: 2 // Center aligned text below barcode
      }));
    }
  }
  
  // Print command
  commands.push(`PRINT ${copies},1`);
  commands.push('END');
  
  return commands.join('\n');
};

// Generate batch of labels
export const generateTSPLBatch = (
  labelConfig: TSPLLabelConfig,
  items: Array<{ data: LabelData; quantity: number }>
): string => {
  const allCommands: string[] = [];
  
  items.forEach(item => {
    if (item.quantity > 0) {
      const labelCommands = generateTSPLLabel(labelConfig, item.data, item.quantity);
      allCommands.push(labelCommands);
    }
  });
  
  return allCommands.join('\n\n');
};

// Preset configurations for common label sizes
export const TSPL_PRESETS: Record<string, TSPLLabelConfig> = {
  '50x25': { width: 50, height: 25, gap: 2 },
  '50x30': { width: 50, height: 30, gap: 2 },
  '38x25': { width: 38, height: 25, gap: 2 },
  '40x20': { width: 40, height: 20, gap: 2 },
  '60x30': { width: 60, height: 30, gap: 3 },
  '60x40': { width: 60, height: 40, gap: 3 },
  '75x50': { width: 75, height: 50, gap: 3 },
  '100x50': { width: 100, height: 50, gap: 3 },
};
