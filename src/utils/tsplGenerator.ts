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
  category?: string;
  businessName?: string;
  size?: string;
  color?: string;
  mrp?: number;
  salePrice?: number;
  barcode?: string;
  billNumber?: string;
  purchaseCode?: string;
  supplierCode?: string;
  supplierInvoiceNo?: string;
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
  supplierInvoiceNo?: TSPLFieldConfig;
  fieldOrder: string[];
  barcodeHeight?: number;
  barcodeWidth?: number;
}

export interface TSPLMultiUpLayout {
  cols: number;
  hGap: number;
  xOffset: number;
}

export function computeMultiUpStripWidthMm(
  singleLabelWidthMm: number,
  cols: number,
  hGap: number,
): number {
  const c = Math.max(1, cols);
  const gap = Math.max(0, hGap);
  return singleLabelWidthMm * c + gap * Math.max(0, c - 1);
}

interface TemplateLabelRenderOptions {
  dpi: number;
  columnOffsetMm?: number;
  contentWidthMm?: number;
}

function appendTsplSetupCommands(
  commands: string[],
  labelConfig: TSPLLabelConfig,
  pageWidthMm: number,
): number {
  const dpi = labelConfig.dpi || 203;
  const direction = labelConfig.direction ?? 1;

  commands.push(generateSizeCommand(pageWidthMm, labelConfig.height));

  const gapMode = labelConfig.gapMode || 'gap';
  if (gapMode === 'continuous') {
    commands.push('GAP 0 mm, 0 mm');
  } else if (gapMode === 'bline') {
    commands.push(`BLINE ${labelConfig.gap} mm, 0 mm`);
  } else {
    commands.push(generateGapCommand(labelConfig.gap));
  }

  commands.push(`DIRECTION ${direction}`);

  const topOffsetMm = labelConfig.topOffset ?? 0;
  const leftOffsetMm = labelConfig.leftOffset ?? 0;
  if (topOffsetMm !== 0) {
    commands.push(`OFFSET ${mmToDots(topOffsetMm, dpi)}`);
  }
  if (leftOffsetMm !== 0) {
    commands.push(`SHIFT ${mmToDots(leftOffsetMm, dpi)}`);
  }

  if (labelConfig.speed) {
    commands.push(`SPEED ${labelConfig.speed}`);
  }
  if (labelConfig.density) {
    commands.push(`DENSITY ${labelConfig.density}`);
  }

  commands.push('CODEPAGE UTF-8');
  commands.push('CLS');

  return dpi;
}

function appendTemplateLabelBody(
  commands: string[],
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  options: TemplateLabelRenderOptions,
): void {
  const dpi = options.dpi;
  const columnOffsetMm = options.columnOffsetMm ?? 0;
  const contentWidthMm = options.contentWidthMm ?? labelConfig.width;
  const contentHeightMm = labelConfig.height;

  const labelWidthDots = mmToDots(contentWidthMm, dpi);
  const labelHeightDots = mmToDots(contentHeightMm, dpi);
  const isCompactLabel = contentWidthMm <= 40 && contentHeightMm <= 25;

  const hasAbsolutePos = templateConfig.fieldOrder.some(fieldKey => {
    const field = templateConfig[fieldKey as keyof TSPLTemplateConfig] as TSPLFieldConfig;
    return field && (field.x !== undefined || field.y !== undefined);
  });

  const applyCompactAdjustments = isCompactLabel && !hasAbsolutePos;
  const compactTopPaddingDots = applyCompactAdjustments ? mmToDots(0.8, dpi) : 0;
  const compactBottomPaddingDots = applyCompactAdjustments ? mmToDots(0.8, dpi) : mmToDots(0.5, dpi);

  const shouldAutoPrintBusinessName = applyCompactAdjustments && !!data.businessName && !templateConfig.businessName?.show;
  if (shouldAutoPrintBusinessName) {
    const autoBusinessFontSize = getScaledFontSize(8, contentHeightMm, hasAbsolutePos);
    const autoBusinessFont = mapFontSize(autoBusinessFontSize, true);
    const autoBusinessWidth = getTextWidthDots(data.businessName as string, autoBusinessFontSize, true);
    const autoBusinessX = Math.max(0, Math.round((labelWidthDots - autoBusinessWidth) / 2));

    commands.push(`TEXT ${mmToDots(columnOffsetMm, dpi) + autoBusinessX},${compactTopPaddingDots},"${autoBusinessFont.font}",0,${autoBusinessFont.xMul},${autoBusinessFont.yMul},"${(data.businessName as string).substring(0, 32)}"`);
  }

  const postBarcodeLayout = computeLabelBarcodeLayout(
    { ...labelConfig, width: contentWidthMm, height: contentHeightMm },
    templateConfig,
    data,
    {
      dpi,
      hasAbsolutePos,
      applyCompactAdjustments,
      compactBottomPaddingDots,
    },
  );

  for (const fieldKey of templateConfig.fieldOrder) {
    if (fieldKey === 'barcode') {
      const barcodeConfig = templateConfig.barcode;
      if (barcodeConfig?.show && data.barcode) {
        const clampedX = clampPosition(barcodeConfig.x ?? 0, contentWidthMm, 'barcode', 'x');
        const clampedY = clampPosition(barcodeConfig.y ?? 0, contentHeightMm, 'barcode', 'y');

        const barcodeX = mmToDots(clampedX + columnOffsetMm, dpi);
        const barcodeY = postBarcodeLayout?.barcodeYDots ?? mmToDots(clampedY, dpi);
        const barcodeHeightDots = postBarcodeLayout?.barcodeHeightDots ?? mmToDots(3, dpi);

        const barcodeNarrow = Math.max(1, Math.round(templateConfig.barcodeWidth || 1.5));

        const barcodeModules = (data.barcode.length + 4) * 11;
        const barcodeWidthDots = barcodeModules * barcodeNarrow;

        let finalBarcodeX = barcodeX;

        if (barcodeConfig.width) {
          let fieldWidthDots = labelWidthDots;
          if (barcodeConfig.width > contentWidthMm) {
            fieldWidthDots = mmToDots((barcodeConfig.width / 100) * contentWidthMm, dpi);
          } else {
            fieldWidthDots = mmToDots(barcodeConfig.width, dpi);
          }

          if (barcodeConfig.textAlign === 'center') {
            finalBarcodeX = barcodeX + Math.max(0, (fieldWidthDots - barcodeWidthDots) / 2);
          } else if (barcodeConfig.textAlign === 'right') {
            finalBarcodeX = barcodeX + fieldWidthDots - barcodeWidthDots;
          }
        } else {
          finalBarcodeX = mmToDots(columnOffsetMm, dpi) + Math.max(0, (labelWidthDots - barcodeWidthDots) / 2);
        }

        commands.push(generateBarcodeCommand({
          x: Math.round(finalBarcodeX),
          y: barcodeY,
          type: '128',
          height: barcodeHeightDots,
          data: data.barcode,
          readable: 0,
          narrow: barcodeNarrow,
          wide: barcodeNarrow,
        }));
      }
      continue;
    }

    const fieldConfig = templateConfig[fieldKey as keyof TSPLTemplateConfig] as TSPLFieldConfig;
    if (!fieldConfig || !fieldConfig.show) continue;

    if (postBarcodeLayout?.skippedPostBarcodeFields.includes(fieldKey)) {
      console.warn(`TSPL: Skipping ${fieldKey} — no room below barcode on short label`);
      continue;
    }

    const content = getFieldContent(fieldKey, data);
    if (!content) continue;

    const rawX = fieldConfig.x ?? 0;
    const rawY = fieldConfig.y ?? 0;
    const clampedX = hasAbsolutePos ? Math.max(0, rawX) : clampPosition(rawX, contentWidthMm, fieldKey, 'x');
    const clampedY = hasAbsolutePos ? Math.max(0, rawY) : clampPosition(rawY, contentHeightMm, fieldKey, 'y');

    if (clampedY >= contentHeightMm - 1) {
      console.warn(`TSPL: Skipping ${fieldKey} - position off label`);
      continue;
    }

    const fieldX = mmToDots(clampedX + columnOffsetMm, dpi);
    const fieldY = mmToDots(clampedY, dpi);

    let fieldWidth = labelWidthDots;
    if (fieldConfig.width) {
      if (fieldConfig.width > contentWidthMm) {
        fieldWidth = mmToDots((fieldConfig.width / 100) * contentWidthMm, dpi);
      } else {
        fieldWidth = mmToDots(fieldConfig.width, dpi);
      }
    }

    const scaledFontSize = getScaledFontSize(fieldConfig.fontSize, contentHeightMm, hasAbsolutePos);
    const fontInfo = mapFontSize(scaledFontSize, fieldConfig.bold);
    const textWidthDots = getTextWidthDots(content, scaledFontSize, fieldConfig.bold);
    const textHeightDots = getTextHeightDots(scaledFontSize, fieldConfig.bold);

    let textX = fieldX;

    if (fieldConfig.textAlign === 'center') {
      textX = fieldX + Math.max(0, (fieldWidth - textWidthDots) / 2);
    } else if (fieldConfig.textAlign === 'right') {
      textX = fieldX + Math.max(0, fieldWidth - textWidthDots);
    }

    let textY = postBarcodeLayout?.derivedFieldYDots[fieldKey] ?? fieldY;

    if (!hasAbsolutePos) {
      if (applyCompactAdjustments && textY < compactTopPaddingDots) {
        textY = compactTopPaddingDots;
      }

      if (fieldKey === 'barcodeText' && applyCompactAdjustments) {
        textY = Math.max(textY, labelHeightDots - textHeightDots - compactBottomPaddingDots);
      }

      const maxTextY = Math.max(0, labelHeightDots - textHeightDots - compactBottomPaddingDots);
      textY = Math.min(textY, maxTextY);
    }

    textX = Math.max(0, textX);

    const { charWidth } = getFontMetrics(fontInfo.font);
    const maxChars = Math.floor((labelWidthDots - (textX - mmToDots(columnOffsetMm, dpi))) / charWidth);
    const hardCap = content.length > 40 ? 40 : content.length;
    const safeMaxChars = Math.max(1, Math.min(maxChars, hardCap));
    const truncatedContent = content.substring(0, safeMaxChars);

    commands.push(`TEXT ${Math.round(textX)},${Math.round(textY)},"${fontInfo.font}",0,${fontInfo.xMul},${fontInfo.yMul},"${truncatedContent}"`);
  }
}

// Convert mm to dots (203 DPI = 8 dots per mm)
export const mmToDots = (mm: number, dpi: number = 203): number => {
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

/** Fields that stack below the barcode — Y is derived from barcode bottom, not template Y. */
const POST_BARCODE_FIELD_KEYS = ['price', 'barcodeText', 'mrp'] as const;

export interface LabelBarcodeLayout {
  barcodeYDots: number;
  barcodeHeightDots: number;
  barcodeHeightMm: number;
  derivedFieldYDots: Partial<Record<string, number>>;
  skippedPostBarcodeFields: string[];
}

/** Convert dots to mm at the given DPI. */
export const dotsToMm = (dots: number, dpi: number = 203): number => {
  return dots / (dpi / 25.4);
};

/**
 * Shared vertical layout: partition label height between barcode and post-barcode text rows.
 * Guarantees price/barcodeText never overlap the barcode band on short labels.
 */
export function computeLabelBarcodeLayout(
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  options: {
    dpi: number;
    hasAbsolutePos: boolean;
    applyCompactAdjustments: boolean;
    compactBottomPaddingDots: number;
  },
): LabelBarcodeLayout | null {
  const barcodeConfig = templateConfig.barcode;
  if (!barcodeConfig?.show || !data.barcode) return null;

  const dpi = options.dpi;
  const labelHeightDots = mmToDots(labelConfig.height, dpi);
  const clampedYMm = clampPosition(barcodeConfig.y ?? 0, labelConfig.height, 'barcode', 'y');
  const barcodeYDots = mmToDots(clampedYMm, dpi);

  if (options.hasAbsolutePos) {
    const sliderValue = templateConfig.barcodeHeight || 30;
    const desiredHeightMm = (sliderValue / 100) * labelConfig.height;
    const maxMm = Math.max(1, labelConfig.height - clampedYMm - 0.5);
    const heightMm = Math.min(desiredHeightMm, maxMm);
    const barcodeHeightDots = Math.round(mmToDots(heightMm, dpi));
    return {
      barcodeYDots,
      barcodeHeightDots,
      barcodeHeightMm: dotsToMm(barcodeHeightDots, dpi),
      derivedFieldYDots: {},
      skippedPostBarcodeFields: [],
    };
  }

  const gapDots = options.applyCompactAdjustments ? mmToDots(0.5, dpi) : mmToDots(0.6, dpi);
  const bottomPaddingDots = options.compactBottomPaddingDots || mmToDots(0.5, dpi);
  const absoluteMinDots = mmToDots(3, dpi);

  const availableHeight = labelHeightDots - barcodeYDots - bottomPaddingDots;

  const postRows: Array<{ fieldKey: string; heightDots: number }> = [];
  for (const fieldKey of templateConfig.fieldOrder) {
    if (!POST_BARCODE_FIELD_KEYS.includes(fieldKey as (typeof POST_BARCODE_FIELD_KEYS)[number])) {
      continue;
    }
    const fieldConfig = templateConfig[fieldKey as keyof TSPLTemplateConfig] as TSPLFieldConfig;
    if (!fieldConfig?.show) continue;
    const content = getFieldContent(fieldKey, data);
    if (!content) continue;
    const fieldYMm = fieldConfig.y ?? 0;
    if (fieldYMm < clampedYMm) continue;

    const scaledFontSize = getScaledFontSize(
      fieldConfig.fontSize,
      labelConfig.height,
      options.hasAbsolutePos,
    );
    postRows.push({
      fieldKey,
      heightDots: getTextHeightDots(scaledFontSize, fieldConfig.bold),
    });
  }

  const totalTextReserve =
    postRows.reduce((sum, row) => sum + row.heightDots, 0) +
    (postRows.length > 0 ? gapDots : 0) +
    Math.max(0, postRows.length - 1) * gapDots;

  const maxBarcodeHeightDots = Math.max(0, availableHeight - totalTextReserve);

  const sliderValue = templateConfig.barcodeHeight || 30;
  const desiredHeightMm = (sliderValue / 100) * labelConfig.height;
  const desiredHeightDots = Math.round(mmToDots(desiredHeightMm, dpi));

  let barcodeHeightDots = Math.min(desiredHeightDots, maxBarcodeHeightDots);
  if (maxBarcodeHeightDots >= absoluteMinDots) {
    barcodeHeightDots = Math.max(absoluteMinDots, barcodeHeightDots);
  }

  const derivedFieldYDots: Partial<Record<string, number>> = {};
  const skippedPostBarcodeFields: string[] = [];
  let nextY = barcodeYDots + barcodeHeightDots + (postRows.length > 0 ? gapDots : 0);

  for (const row of postRows) {
    if (nextY + row.heightDots > labelHeightDots - bottomPaddingDots) {
      skippedPostBarcodeFields.push(row.fieldKey);
      continue;
    }
    derivedFieldYDots[row.fieldKey] = nextY;
    nextY += row.heightDots + gapDots;
  }

  return {
    barcodeYDots,
    barcodeHeightDots,
    barcodeHeightMm: dotsToMm(barcodeHeightDots, dpi),
    derivedFieldYDots,
    skippedPostBarcodeFields,
  };
}

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
    case 'supplierInvoiceNo': return data.supplierInvoiceNo || '';
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

// Auto-scale font size for smaller labels (only for legacy/non-template mode)
const getScaledFontSize = (fontSize: number, labelHeight: number, hasAbsolutePositioning: boolean = false): number => {
  // When using designer with absolute positioning, respect exact font sizes
  if (hasAbsolutePositioning) return fontSize;
  
  if (labelHeight <= 20) {
    return Math.max(6, fontSize - 2);
  } else if (labelHeight <= 25) {
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
  const dpi = appendTsplSetupCommands(commands, labelConfig, labelConfig.width);
  appendTemplateLabelBody(commands, labelConfig, templateConfig, data, { dpi });
  commands.push(`PRINT ${copies},1`);
  commands.push('END');
  return commands.join('\n');
};

/** One physical thermal row with multiple columns (2-Up / 3-Up). */
export const generateTSPLMultiUpRowFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  rowItems: LabelData[],
  layout: TSPLMultiUpLayout,
  copies: number = 1,
): string => {
  const cols = Math.max(1, layout.cols);
  const hGap = Math.max(0, layout.hGap);
  const singleWidthMm = labelConfig.width;
  const totalWidthMm = computeMultiUpStripWidthMm(singleWidthMm, cols, hGap);

  const commands: string[] = [];
  const dpi = appendTsplSetupCommands(commands, labelConfig, totalWidthMm);

  for (let i = 0; i < cols; i++) {
    const item = rowItems[i];
    if (!item) continue;
    const columnOriginMm = layout.xOffset + i * (singleWidthMm + hGap);
    appendTemplateLabelBody(commands, labelConfig, templateConfig, item, {
      dpi,
      columnOffsetMm: columnOriginMm,
      contentWidthMm: singleWidthMm,
    });
  }

  commands.push(`PRINT ${copies},1`);
  commands.push('END');
  return commands.join('\n');
};

// Generate batch of labels using template
export const generateTSPLBatchFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  items: Array<{ data: LabelData; quantity: number }>,
  multiUp?: TSPLMultiUpLayout,
): string => {
  const cols = multiUp?.cols ?? 1;
  if (cols <= 1) {
    const allCommands: string[] = [];
    items.forEach(item => {
      if (item.quantity > 0) {
        const labelCommands = generateTSPLLabelFromTemplate(labelConfig, templateConfig, item.data, item.quantity);
        allCommands.push(labelCommands);
      }
    });
    return allCommands.join('\n\n');
  }

  const expanded: LabelData[] = [];
  items.forEach(item => {
    for (let q = 0; q < item.quantity; q++) {
      expanded.push(item.data);
    }
  });

  const allCommands: string[] = [];
  for (let i = 0; i < expanded.length; i += cols) {
    const row = expanded.slice(i, i + cols);
    allCommands.push(
      generateTSPLMultiUpRowFromTemplate(labelConfig, templateConfig, row, multiUp!, 1),
    );
  }
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
