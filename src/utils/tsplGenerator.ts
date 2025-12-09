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
  supplierCode?: string;
  style?: string;
}

// Template field configuration (matches LabelFieldConfig in BarcodePrinting)
export interface TSPLFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  lineHeight?: number;
  row?: number;
}

// Template design configuration (matches LabelDesignConfig in BarcodePrinting)
export interface TSPLTemplateConfig {
  brand: TSPLFieldConfig;
  productName: TSPLFieldConfig;
  color: TSPLFieldConfig;
  style: TSPLFieldConfig;
  size: TSPLFieldConfig;
  price: TSPLFieldConfig;
  barcode: TSPLFieldConfig;
  barcodeText: TSPLFieldConfig;
  billNumber: TSPLFieldConfig;
  supplierCode: TSPLFieldConfig;
  purchaseCode: TSPLFieldConfig;
  fieldOrder: string[];
  barcodeHeight?: number;
  barcodeWidth?: number;
}

// Convert mm to dots (203 DPI = 8 dots per mm)
const mmToDots = (mm: number, dpi: number = 203): number => {
  return Math.round(mm * (dpi / 25.4));
};

// Map font size (7-14px) to TSPL font (1-5)
const mapFontSize = (fontSize: number): { font: string; xMul: number; yMul: number } => {
  if (fontSize <= 7) return { font: '1', xMul: 1, yMul: 1 };
  if (fontSize <= 8) return { font: '2', xMul: 1, yMul: 1 };
  if (fontSize <= 9) return { font: '3', xMul: 1, yMul: 1 };
  if (fontSize <= 10) return { font: '2', xMul: 2, yMul: 2 };
  if (fontSize <= 11) return { font: '3', xMul: 2, yMul: 2 };
  if (fontSize <= 12) return { font: '4', xMul: 2, yMul: 2 };
  return { font: '5', xMul: 2, yMul: 2 };
};

// Get line height in dots based on font size
const getLineHeight = (fontSize: number): number => {
  const baseHeight = fontSize <= 8 ? 16 : fontSize <= 10 ? 20 : fontSize <= 12 ? 24 : 28;
  return baseHeight;
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
  const readable = item.readable ?? 0; // No text below barcode by default
  const narrow = item.narrow || 2;
  const wide = item.wide || 2;
  return `BARCODE ${item.x},${item.y},"${item.type}",${item.height},${readable},0,${narrow},${wide},"${item.data}"`;
};

// Get field content based on field key
const getFieldContent = (fieldKey: string, data: LabelData): string => {
  switch (fieldKey) {
    case 'brand': return data.brand || '';
    case 'productName': return data.productName || '';
    case 'color': return data.color ? `Color: ${data.color}` : '';
    case 'style': return data.style || '';
    case 'size': return data.size || '';
    case 'price': return data.salePrice ? `Rs.${data.salePrice}` : '';
    case 'barcodeText': return data.barcode || '';
    case 'billNumber': return data.billNumber || '';
    case 'supplierCode': return data.supplierCode || '';
    case 'purchaseCode': return data.purchaseCode || '';
    default: return '';
  }
};

// Generate template-aware TSPL label
export const generateTSPLLabelFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  copies: number = 1
): string => {
  const commands: string[] = [];
  
  // Label setup
  commands.push(generateSizeCommand(labelConfig.width, labelConfig.height));
  commands.push(generateGapCommand(labelConfig.gap));
  commands.push('DIRECTION 1');
  commands.push('CLS'); // Clear buffer
  
  const labelWidthDots = mmToDots(labelConfig.width);
  const labelHeightDots = mmToDots(labelConfig.height);
  
  // Track Y position and row groupings
  let yPos = 8;
  const xMargin = 8;
  
  // Group fields by row for horizontal layout
  const rowGroups = new Map<number, { fieldKey: string; config: TSPLFieldConfig }[]>();
  
  // Process fields in order
  for (const fieldKey of templateConfig.fieldOrder) {
    if (fieldKey === 'barcode') continue; // Handle barcode separately
    
    const fieldConfig = templateConfig[fieldKey as keyof TSPLTemplateConfig] as TSPLFieldConfig;
    if (!fieldConfig || !fieldConfig.show) continue;
    
    const row = fieldConfig.row ?? -1;
    if (row >= 0) {
      if (!rowGroups.has(row)) {
        rowGroups.set(row, []);
      }
      rowGroups.get(row)!.push({ fieldKey, config: fieldConfig });
    } else {
      // Single field row - use y position if specified
      const content = getFieldContent(fieldKey, data);
      if (!content) continue;
      
      const fontInfo = mapFontSize(fieldConfig.fontSize);
      const textY = fieldConfig.y !== undefined ? mmToDots(fieldConfig.y) : yPos;
      
      // Calculate X position based on alignment and width
      let textX = xMargin;
      const fieldWidth = fieldConfig.width !== undefined ? (labelWidthDots * fieldConfig.width / 100) : labelWidthDots - (xMargin * 2);
      const textWidth = content.length * (fieldConfig.fontSize * 0.6);
      
      if (fieldConfig.textAlign === 'center') {
        textX = Math.max(xMargin, (labelWidthDots - mmToDots(textWidth)) / 2);
      } else if (fieldConfig.textAlign === 'right') {
        textX = Math.max(xMargin, labelWidthDots - xMargin - mmToDots(textWidth));
      } else if (fieldConfig.x !== undefined) {
        textX = mmToDots(fieldConfig.x);
      }
      
      commands.push(`TEXT ${textX},${textY},"${fontInfo.font}",0,${fontInfo.xMul},${fontInfo.yMul},"${content.substring(0, 30)}"`);
      
      if (fieldConfig.y === undefined) {
        yPos += getLineHeight(fieldConfig.fontSize) + (fieldConfig.paddingBottom || 0);
      }
    }
  }
  
  // Process row-grouped fields (fields on same horizontal line)
  for (const [rowNum, fields] of rowGroups) {
    // Sort by x position
    fields.sort((a, b) => (a.config.x || 0) - (b.config.x || 0));
    
    const rowY = fields[0].config.y !== undefined ? mmToDots(fields[0].config.y) : yPos;
    
    for (const { fieldKey, config } of fields) {
      const content = getFieldContent(fieldKey, data);
      if (!content) continue;
      
      const fontInfo = mapFontSize(config.fontSize);
      const fieldX = config.x !== undefined ? mmToDots(config.x) : xMargin;
      const fieldWidth = config.width !== undefined ? (labelWidthDots * config.width / 100) : (labelWidthDots / 2);
      
      let textX = fieldX;
      if (config.textAlign === 'center') {
        textX = fieldX + (fieldWidth / 2) - (content.length * 3);
      } else if (config.textAlign === 'right') {
        textX = fieldX + fieldWidth - (content.length * 6);
      }
      
      commands.push(`TEXT ${Math.max(4, textX)},${rowY},"${fontInfo.font}",0,${fontInfo.xMul},${fontInfo.yMul},"${content.substring(0, 20)}"`);
    }
    
    if (fields[0].config.y === undefined) {
      yPos += getLineHeight(fields[0].config.fontSize) + 4;
    }
  }
  
  // Handle barcode based on template settings
  const barcodeConfig = templateConfig.barcode;
  if (barcodeConfig?.show && data.barcode) {
    const barcodeY = barcodeConfig.y !== undefined ? mmToDots(barcodeConfig.y) : yPos;
    const barcodeHeight = templateConfig.barcodeHeight || 30;
    const barcodeNarrow = Math.max(1, Math.round((templateConfig.barcodeWidth || 1.5)));
    
    // Calculate X position for barcode
    let barcodeX = xMargin;
    if (barcodeConfig.textAlign === 'center') {
      barcodeX = Math.max(xMargin, (labelWidthDots - (data.barcode.length * barcodeNarrow * 11)) / 2);
    }
    
    commands.push(generateBarcodeCommand({
      x: barcodeX,
      y: barcodeY,
      type: '128',
      height: barcodeHeight,
      data: data.barcode,
      readable: 0, // No built-in text
      narrow: barcodeNarrow,
      wide: barcodeNarrow,
    }));
    
    yPos = barcodeY + barcodeHeight + 4;
  }
  
  // Handle barcode text if separate from barcode
  const barcodeTextConfig = templateConfig.barcodeText;
  if (barcodeTextConfig?.show && data.barcode) {
    const textY = barcodeTextConfig.y !== undefined ? mmToDots(barcodeTextConfig.y) : yPos;
    const fontInfo = mapFontSize(barcodeTextConfig.fontSize);
    
    let textX = xMargin;
    if (barcodeTextConfig.textAlign === 'center') {
      textX = Math.max(xMargin, (labelWidthDots - (data.barcode.length * 6)) / 2);
    }
    
    commands.push(`TEXT ${textX},${textY},"${fontInfo.font}",0,${fontInfo.xMul},${fontInfo.yMul},"${data.barcode}"`);
  }
  
  // Print command
  commands.push(`PRINT ${copies},1`);
  commands.push('END');
  
  return commands.join('\n');
};

// Generate batch of labels using template
export const generateTSPLBatchFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  items: Array<{ data: LabelData; quantity: number }>
): string => {
  const allCommands: string[] = [];
  
  items.forEach(item => {
    if (item.quantity > 0) {
      const labelCommands = generateTSPLLabelFromTemplate(labelConfig, templateConfig, item.data, item.quantity);
      allCommands.push(labelCommands);
    }
  });
  
  return allCommands.join('\n\n');
};

// Legacy function for backward compatibility (uses hardcoded layout)
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
      priceText = `MRP: Rs.${data.mrp} | Rs.${data.salePrice}`;
    } else if (data.salePrice) {
      priceText = `Rs.${data.salePrice}`;
    } else if (data.mrp) {
      priceText = `MRP: Rs.${data.mrp}`;
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

// Generate batch of labels (legacy)
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
