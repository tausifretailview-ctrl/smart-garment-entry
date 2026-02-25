// TSPL Command Generator for TSC Thermal Printers
// Generates raw TSPL/TSPL2 commands for direct printing

export interface TSPLLabelConfig {
  width: number; // in mm
  height: number; // in mm
  gap: number; // gap between labels in mm
  dpi?: number; // printer DPI (default: 203, use 300 for TSC DA 310)
  direction?: 0 | 1; // print direction (default: 1 for most TSC printers)
  speed?: number; // print speed 1-6 (default: 4)
  density?: number; // print density 1-15 (default: 8)
  gapMode?: 'gap' | 'continuous' | 'bline'; // gap sensing mode
  topOffset?: number; // vertical offset in mm to compensate for printer shift (default: 2)
  leftOffset?: number; // horizontal offset in mm (default: 0)
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
  businessName?: string;
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
  businessName?: TSPLFieldConfig;
  productName: TSPLFieldConfig;
  color: TSPLFieldConfig;
  style: TSPLFieldConfig;
  size: TSPLFieldConfig;
  price: TSPLFieldConfig;
  mrp: TSPLFieldConfig;
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

// Map font size (7-14px) to TSPL font parameters
// For TSC printers: Font 1 = 8x12, Font 2 = 12x20, Font 3 = 16x24, Font 4 = 24x32, Font 5 = 32x48
const mapFontSize = (fontSize: number, bold: boolean = false): { font: string; xMul: number; yMul: number } => {
  // More accurate font mapping for visual consistency
  if (fontSize <= 6) return { font: '1', xMul: 1, yMul: 1 };
  if (fontSize <= 7) return { font: '2', xMul: 1, yMul: 1 };
  if (fontSize <= 8) return { font: bold ? '3' : '2', xMul: 1, yMul: 1 };
  if (fontSize <= 9) return { font: '3', xMul: 1, yMul: 1 };
  if (fontSize <= 10) return { font: bold ? '4' : '3', xMul: 1, yMul: 1 };
  if (fontSize <= 12) return { font: '4', xMul: 1, yMul: 1 };
  return { font: '5', xMul: 1, yMul: 1 };
};

// Get character width/height in dots for TSPL built-in fonts
const getFontMetrics = (font: string): { charWidth: number; charHeight: number } => {
  switch (font) {
    case '1': return { charWidth: 8, charHeight: 12 };
    case '2': return { charWidth: 12, charHeight: 20 };
    case '3': return { charWidth: 16, charHeight: 24 };
    case '4': return { charWidth: 24, charHeight: 32 };
    case '5': return { charWidth: 32, charHeight: 48 };
    default: return { charWidth: 12, charHeight: 20 };
  }
};

// Get approximate text width in dots based on mapped TSPL font
const getTextWidthDots = (text: string, fontSize: number, bold: boolean = false): number => {
  const { font } = mapFontSize(fontSize, bold);
  const { charWidth } = getFontMetrics(font);
  return text.length * charWidth;
};

// Get approximate text height in dots based on mapped TSPL font
const getTextHeightDots = (fontSize: number, bold: boolean = false): number => {
  const { font } = mapFontSize(fontSize, bold);
  const { charHeight } = getFontMetrics(font);
  return charHeight;
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
    case 'businessName': return data.businessName || '';
    case 'productName': return data.productName || '';
    case 'color': return data.color || '';
    case 'style': return data.style || '';
    case 'size': return data.size || '';
    case 'price': return data.salePrice ? `Rs.${data.salePrice}` : '';
    case 'mrp': return data.mrp ? `MRP Rs.${data.mrp}` : '';
    case 'barcodeText': return data.barcode || '';
    case 'billNumber': return data.billNumber || '';
    case 'supplierCode': return data.supplierCode || '';
    case 'purchaseCode': return data.purchaseCode || '';
    default: return '';
  }
};

// Clamp position within label boundaries with margin
const clampPosition = (
  pos: number, 
  max: number, 
  fieldName: string, 
  axis: 'x' | 'y'
): number => {
  const margin = axis === 'y' ? 2 : 3; // mm margin from edge
  const clamped = Math.max(0, Math.min(pos, max - margin));
  if (pos !== clamped) {
    console.warn(`TSPL: ${fieldName} ${axis} position clamped: ${pos}mm -> ${clamped}mm (label ${axis === 'x' ? 'width' : 'height'}: ${max}mm)`);
  }
  return clamped;
};

// Auto-scale font size for smaller labels
const getScaledFontSize = (fontSize: number, labelHeight: number): number => {
  if (labelHeight <= 20) {
    // Very small labels - reduce font size
    return Math.max(6, fontSize - 2);
  } else if (labelHeight <= 25) {
    // Small labels - slightly reduce font size
    return Math.max(6, fontSize - 1);
  }
  return fontSize;
};

// Generate template-aware TSPL label with ABSOLUTE x/y positioning matching preview exactly
export const generateTSPLLabelFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  copies: number = 1
): string => {
  const commands: string[] = [];
  
  // Get DPI and direction from config (defaults: 203 DPI, DIRECTION 1)
  const dpi = labelConfig.dpi || 203;
  const direction = labelConfig.direction ?? 1; // Default to 1 (standard for most TSC printers)
  
  // Label setup
  commands.push(generateSizeCommand(labelConfig.width, labelConfig.height));
  
  // Gap mode: gap (default), continuous, or black mark
  const gapMode = labelConfig.gapMode || 'gap';
  if (gapMode === 'continuous') {
    commands.push('GAP 0 mm, 0 mm');
  } else if (gapMode === 'bline') {
    commands.push(`BLINE ${labelConfig.gap} mm, 0 mm`);
  } else {
    commands.push(generateGapCommand(labelConfig.gap));
  }
  
  commands.push(`DIRECTION ${direction}`);
  
  // Add OFFSET to compensate for printer's physical print origin shift
  // OFFSET and SHIFT commands take values in dots
  const topOffsetMm = labelConfig.topOffset ?? 2;
  const leftOffsetMm = labelConfig.leftOffset ?? 0;
  if (topOffsetMm !== 0) {
    const topOffsetDots = mmToDots(topOffsetMm, dpi);
    commands.push(`OFFSET ${topOffsetDots}`);
  }
  if (leftOffsetMm !== 0) {
    const leftOffsetDots = mmToDots(leftOffsetMm, dpi);
    commands.push(`SHIFT ${leftOffsetDots}`);
  }
  
  // Speed and density for printer compatibility
  if (labelConfig.speed) {
    commands.push(`SPEED ${labelConfig.speed}`);
  }
  if (labelConfig.density) {
    commands.push(`DENSITY ${labelConfig.density}`);
  }
  
  commands.push('CODEPAGE UTF-8');
  commands.push('CLS'); // Clear buffer
  
  const labelWidthDots = mmToDots(labelConfig.width, dpi);
  const labelHeightDots = mmToDots(labelConfig.height, dpi);
  const isCompactLabel = labelConfig.width <= 40 && labelConfig.height <= 25;
  const compactTopPaddingDots = isCompactLabel ? mmToDots(0.8, dpi) : 0;
  const compactBottomPaddingDots = isCompactLabel ? mmToDots(0.8, dpi) : 0;

  // For compact labels, always print shop name at top if available
  const shouldAutoPrintBusinessName = isCompactLabel && !!data.businessName && !templateConfig.businessName?.show;
  if (shouldAutoPrintBusinessName) {
    const autoBusinessFontSize = getScaledFontSize(8, labelConfig.height);
    const autoBusinessFont = mapFontSize(autoBusinessFontSize, true);
    const autoBusinessWidth = getTextWidthDots(data.businessName as string, autoBusinessFontSize, true);
    const autoBusinessX = Math.max(0, Math.round((labelWidthDots - autoBusinessWidth) / 2));

    commands.push(`TEXT ${autoBusinessX},${compactTopPaddingDots},"${autoBusinessFont.font}",0,${autoBusinessFont.xMul},${autoBusinessFont.yMul},"${(data.businessName as string).substring(0, 32)}"`);
  }
  
  // Process each field using its ABSOLUTE x/y coordinates from the template
  for (const fieldKey of templateConfig.fieldOrder) {
    if (fieldKey === 'barcode') {
      // Handle barcode with absolute positioning
      const barcodeConfig = templateConfig.barcode;
      if (barcodeConfig?.show && data.barcode) {
        // Clamp barcode position within label bounds
        const clampedX = clampPosition(barcodeConfig.x ?? 0, labelConfig.width, 'barcode', 'x');
        const clampedY = clampPosition(barcodeConfig.y ?? 0, labelConfig.height, 'barcode', 'y');
        
        const barcodeX = mmToDots(clampedX, dpi);
        const barcodeY = mmToDots(clampedY, dpi);
        
        // Scale barcode height properly to match preview
        // Designer slider range is 15-60, we need to convert to mm then dots
        // The slider value represents percentage of label height (roughly)
        // For a 50x25mm label with slider=25: target height = 25% of 25mm = 6.25mm = ~50 dots
        const sliderValue = templateConfig.barcodeHeight || 30;
        const barcodeHeightMm = (sliderValue / 100) * labelConfig.height * 1.5; // Scale factor to match preview
        
        // For smaller labels, reduce minimum barcode height
        const minBarcodeHeight = labelConfig.height <= 20 ? 20 : labelConfig.height <= 25 ? 25 : 30;

        // Reserve space for barcode text at bottom on compact labels to prevent clipping/overlap
        let reservedBottomDots = isCompactLabel ? mmToDots(1.2, dpi) : mmToDots(0.6, dpi);
        const barcodeTextConfig = templateConfig.barcodeText;
        if (barcodeTextConfig?.show && data.barcode) {
          const scaledBarcodeTextSize = getScaledFontSize(barcodeTextConfig.fontSize, labelConfig.height);
          const barcodeTextHeightDots = getTextHeightDots(scaledBarcodeTextSize, barcodeTextConfig.bold);
          reservedBottomDots = barcodeTextHeightDots + (isCompactLabel ? mmToDots(1.0, dpi) : mmToDots(0.6, dpi));
        }

        const maxBarcodeHeightDots = Math.max(
          mmToDots(4, dpi),
          labelHeightDots - barcodeY - reservedBottomDots
        );

        const barcodeHeightDots = Math.max(
          minBarcodeHeight,
          Math.min(Math.round(mmToDots(barcodeHeightMm, dpi)), maxBarcodeHeightDots)
        );
        
        const barcodeNarrow = Math.max(1, Math.round(templateConfig.barcodeWidth || 1.5));
        
        // Calculate barcode width for centering within field width if specified
        const barcodeModules = (data.barcode.length + 4) * 11;
        const barcodeWidthDots = barcodeModules * barcodeNarrow;
        
        let finalBarcodeX = barcodeX;
        
        // If field width is specified, center barcode within it
        // Width is stored as percentage of label width (0-100), convert to dots
        if (barcodeConfig.width) {
          let fieldWidthDots = labelWidthDots;
          if (barcodeConfig.width > labelConfig.width) {
            // It's a percentage value (e.g., 100 = 100% of label width)
            fieldWidthDots = mmToDots((barcodeConfig.width / 100) * labelConfig.width, dpi);
          } else {
            // It's already in mm
            fieldWidthDots = mmToDots(barcodeConfig.width, dpi);
          }
          
          if (barcodeConfig.textAlign === 'center') {
            finalBarcodeX = barcodeX + Math.max(0, (fieldWidthDots - barcodeWidthDots) / 2);
          } else if (barcodeConfig.textAlign === 'right') {
            finalBarcodeX = barcodeX + fieldWidthDots - barcodeWidthDots;
          }
        } else {
          // If no width specified, center on label
          finalBarcodeX = Math.max(0, (labelWidthDots - barcodeWidthDots) / 2);
        }
        
        commands.push(generateBarcodeCommand({
          x: Math.round(finalBarcodeX),
          y: barcodeY,
          type: '128',
          height: barcodeHeightDots,
          data: data.barcode,
          readable: 0, // No built-in text, we add barcodeText separately
          narrow: barcodeNarrow,
          wide: barcodeNarrow,
        }));
      }
      continue;
    }
    
    const fieldConfig = templateConfig[fieldKey as keyof TSPLTemplateConfig] as TSPLFieldConfig;
    if (!fieldConfig || !fieldConfig.show) continue;
    
    const content = getFieldContent(fieldKey, data);
    if (!content) continue;
    
    // Clamp field positions within label bounds
    const clampedX = clampPosition(fieldConfig.x ?? 0, labelConfig.width, fieldKey, 'x');
    const clampedY = clampPosition(fieldConfig.y ?? 0, labelConfig.height, fieldKey, 'y');
    
    // Skip fields that would be completely off-label (y position too close to bottom)
    if (clampedY >= labelConfig.height - 1) {
      console.warn(`TSPL: Skipping ${fieldKey} - position off label`);
      continue;
    }
    
    // Use ABSOLUTE x/y coordinates from the field config (convert mm to dots)
    const fieldX = mmToDots(clampedX, dpi);
    const fieldY = mmToDots(clampedY, dpi);
    
    // Width is stored as percentage of label width (0-100), convert to dots
    // If width > labelConfig.width, treat it as percentage
    let fieldWidth = labelWidthDots;
    if (fieldConfig.width) {
      if (fieldConfig.width > labelConfig.width) {
        // It's a percentage value (e.g., 100 = 100% of label width)
        fieldWidth = mmToDots((fieldConfig.width / 100) * labelConfig.width, dpi);
      } else {
        // It's already in mm
        fieldWidth = mmToDots(fieldConfig.width, dpi);
      }
    }
    
    // Auto-scale font size for smaller labels
    const scaledFontSize = getScaledFontSize(fieldConfig.fontSize, labelConfig.height);
    const fontInfo = mapFontSize(scaledFontSize, fieldConfig.bold);
    const textWidthDots = getTextWidthDots(content, scaledFontSize, fieldConfig.bold);
    const textHeightDots = getTextHeightDots(scaledFontSize, fieldConfig.bold);
    
    // Calculate final X position based on text alignment within field
    let textX = fieldX;
    
    if (fieldConfig.textAlign === 'center') {
      textX = fieldX + Math.max(0, (fieldWidth - textWidthDots) / 2);
    } else if (fieldConfig.textAlign === 'right') {
      textX = fieldX + Math.max(0, fieldWidth - textWidthDots);
    }
    
    // Compact-label safety: avoid top clipping and keep barcode text at bottom
    let textY = fieldY;
    if (isCompactLabel && textY < compactTopPaddingDots) {
      textY = compactTopPaddingDots;
    }

    if (fieldKey === 'barcodeText' && isCompactLabel) {
      textY = Math.max(textY, labelHeightDots - textHeightDots - compactBottomPaddingDots);
    }

    const maxTextY = Math.max(0, labelHeightDots - textHeightDots - compactBottomPaddingDots);
    textY = Math.min(textY, maxTextY);
    
    // Ensure text doesn't start outside label bounds (but allow it to extend to edge)
    textX = Math.max(0, textX);
    
    // Truncate text if it exceeds label width
    const { charWidth } = getFontMetrics(fontInfo.font);
    const maxChars = Math.floor((labelWidthDots - textX) / charWidth);
    const hardCap = content.length > 40 ? 40 : content.length;
    const safeMaxChars = Math.max(1, Math.min(maxChars, hardCap));
    const truncatedContent = content.substring(0, safeMaxChars);
    
    commands.push(`TEXT ${Math.round(textX)},${Math.round(textY)},"${fontInfo.font}",0,${fontInfo.xMul},${fontInfo.yMul},"${truncatedContent}"`);
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
  
  const gapMode = labelConfig.gapMode || 'gap';
  if (gapMode === 'continuous') {
    commands.push('GAP 0 mm, 0 mm');
  } else if (gapMode === 'bline') {
    commands.push(`BLINE ${labelConfig.gap} mm, 0 mm`);
  } else {
    commands.push(generateGapCommand(labelConfig.gap));
  }
  
  commands.push(`DIRECTION ${labelConfig.direction ?? 0}`);
  
  if (labelConfig.speed) {
    commands.push(`SPEED ${labelConfig.speed}`);
  }
  if (labelConfig.density) {
    commands.push(`DENSITY ${labelConfig.density}`);
  }
  
  commands.push('CODEPAGE UTF-8');
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
