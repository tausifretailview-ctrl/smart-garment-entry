// Precision Pro TSC — 102×53mm footwear label (box + 2 pair labels)
// TSC TTP-244 Pro / 245 at 203 DPI (8 dots/mm → 816×424 dots)

export const PRECISION_PRO_TSC_WIDTH_MM = 102;
export const PRECISION_PRO_TSC_HEIGHT_MM = 53;
export const PRECISION_PRO_TSC_GAP_MM = 2;

export interface PrecisionProTSCLabelData {
  businessName: string;
  barcode: string;
  productName: string;
  style: string;
  brand: string;
  color: string;
  size: string;
  salePrice: number;
  mrp: number;
  category?: string;
}

const LABEL_H_DOTS = 424;
const BOX_DIVIDER_X = 495;
const PAIR_X = 505;
const PAIR_MID_Y = 212;

const esc = (s: string) => s.replace(/"/g, '\\"');

function truncFields(data: PrecisionProTSCLabelData, compact: boolean) {
  const maxOrg = compact ? 12 : 20;
  const maxProduct = compact ? 10 : 12;
  const maxStyle = compact ? 14 : 18;
  const maxBrand = compact ? 8 : 10;
  const maxColor = compact ? 8 : 10;
  const maxCategory = compact ? 6 : 8;

  return {
    org: (data.businessName || '').slice(0, maxOrg),
    product: (data.productName || '').slice(0, maxProduct),
    style: (data.style || '').slice(0, maxStyle),
    brand: (data.brand || '').slice(0, maxBrand),
    color: (data.color || '').slice(0, maxColor),
    category: (data.category || '').slice(0, maxCategory),
    barcode: data.barcode || '',
    size: data.size || '',
    mrp: data.mrp ?? data.salePrice ?? 0,
  };
}

/** Box label — full-size fields (left panel). */
function boxPanelCommands(t: ReturnType<typeof truncFields>): string[] {
  return [
    `TEXT 10,10,"3",0,1,1,"${esc(t.org)}"`,
    `BARCODE 10,45,"128",60,1,0,2,2,"${t.barcode}"`,
    `TEXT 10,118,"2",0,1,1,"${t.barcode}"`,
    `TEXT 10,143,"2",0,1,1,"MRP: Rs.${t.mrp}/-"`,
    `TEXT 10,168,"4",0,1,1,"${esc(t.product)}"`,
    `TEXT 10,210,"3",0,1,1,"${esc(t.style)}"`,
    `TEXT 10,242,"2",0,1,1,"${esc(t.brand)}"`,
    `TEXT 220,242,"2",0,1,1,"${esc(t.category)}"`,
    `TEXT 10,268,"2",0,1,1,"${esc(t.color)}"`,
    `TEXT 320,200,"5",0,2,2,"${t.size}"`,
  ];
}

/** Pair label — same fields, compact layout (right top or bottom). */
function pairPanelCommands(y0: number, t: ReturnType<typeof truncFields>): string[] {
  return [
    `TEXT ${PAIR_X},${y0 + 4},"1",0,1,1,"${esc(t.org)}"`,
    `BARCODE ${PAIR_X},${y0 + 16},"128",26,1,0,1,2,"${t.barcode}"`,
    `TEXT ${PAIR_X},${y0 + 44},"1",0,1,1,"${t.barcode}"`,
    `TEXT ${PAIR_X},${y0 + 54},"1",0,1,1,"MRP:Rs.${t.mrp}/-"`,
    `TEXT ${PAIR_X},${y0 + 66},"2",0,1,1,"${esc(t.product)}"`,
    `TEXT ${PAIR_X},${y0 + 82},"1",0,1,1,"${esc(t.style)}"`,
    `TEXT ${PAIR_X},${y0 + 94},"1",0,1,1,"${esc(t.brand)}"`,
    `TEXT ${PAIR_X + 115},${y0 + 94},"1",0,1,1,"${esc(t.category)}"`,
    `TEXT ${PAIR_X},${y0 + 106},"1",0,1,1,"${esc(t.color)}"`,
    `TEXT ${PAIR_X + 168},${y0 + 66},"3",0,1,1,"${t.size}"`,
  ];
}

export function generatePrecisionProTSCLabel(
  data: PrecisionProTSCLabelData,
  copies: number = 1,
): string {
  const box = truncFields(data, false);
  const pair = truncFields(data, true);

  const commands = [
    `SIZE ${PRECISION_PRO_TSC_WIDTH_MM} mm, ${PRECISION_PRO_TSC_HEIGHT_MM} mm`,
    `GAP ${PRECISION_PRO_TSC_GAP_MM} mm, 0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CODEPAGE UTF-8',
    'CLS',
    ...boxPanelCommands(box),
    `BAR ${BOX_DIVIDER_X},0,2,${LABEL_H_DOTS}`,
    ...pairPanelCommands(4, pair),
    `BAR 497,${PAIR_MID_Y},315,2`,
    ...pairPanelCommands(PAIR_MID_Y + 4, pair),
    `PRINT 1,${copies}`,
  ];

  return commands.join('\n');
}

export function generatePrecisionProTSCBatch(
  items: PrecisionProTSCLabelData[],
  copiesPerItem: number = 1,
): string {
  return items
    .map((item) => generatePrecisionProTSCLabel(item, copiesPerItem))
    .join('\n');
}
