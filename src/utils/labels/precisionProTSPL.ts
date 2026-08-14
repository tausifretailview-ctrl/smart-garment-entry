// Precision Pro TSC — 102×53mm footwear label (box + 2 pair labels)
// Geometry: src/utils/labels/precisionProGeometry.ts (single source of truth)

import {
  BOX_CONTENT_X,
  BOX_W,
  LABEL_H,
  PAIR_COL_W,
  PAIR_MID_Y,
  PAIR_TOP,
  PAIR_X,
  PRECISION_PRO_DEBUG_DIVIDERS,
  PRECISION_PRO_TSC_GAP_MM,
  PRECISION_PRO_TSC_HEIGHT_MM,
  PRECISION_PRO_TSC_WIDTH_MM,
  TRUNC,
  boxBarcodeNarrowBarWidth,
  boxSizeOverflowSafe,
} from "./precisionProGeometry";

export {
  PRECISION_PRO_TSC_WIDTH_MM,
  PRECISION_PRO_TSC_HEIGHT_MM,
  PRECISION_PRO_TSC_GAP_MM,
} from "./precisionProGeometry";

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

const esc = (s: string) => s.replace(/"/g, '\\"');

function truncFields(data: PrecisionProTSCLabelData, compact: boolean) {
  const lim = compact ? TRUNC.pair : TRUNC.box;
  return {
    org: (data.businessName || "").slice(0, lim.org),
    product: (data.productName || "").slice(0, lim.product),
    style: (data.style || "").slice(0, lim.style),
    brand: (data.brand || "").slice(0, lim.brand),
    color: (data.color || "").slice(0, lim.color),
    category: (data.category || "").slice(0, lim.category),
    barcode: data.barcode || "",
    size: (data.size || "").slice(0, lim.size),
    mrp: data.mrp ?? data.salePrice ?? 0,
  };
}

type Trunc = ReturnType<typeof truncFields>;

/** Box label — captions on MRP / ART NO / COLOUR; bare brand & category. */
function boxPanelCommands(t: Trunc): string[] {
  const narrow = boxBarcodeNarrowBarWidth(t.barcode);
  const size = boxSizeOverflowSafe(t.size);
  return [
    `TEXT ${BOX_CONTENT_X},10,"3",0,1,1,"${esc(t.org)}"`,
    `BARCODE ${BOX_CONTENT_X},45,"128",60,1,0,${narrow},2,"${t.barcode}"`,
    `TEXT ${BOX_CONTENT_X},118,"2",0,1,1,"${t.barcode}"`,
    `TEXT ${BOX_CONTENT_X},143,"2",0,1,1,"MRP : Rs.${t.mrp}/-"`,
    `TEXT ${BOX_CONTENT_X},168,"4",0,1,1,"${esc(t.product)}"`,
    `TEXT ${BOX_CONTENT_X},210,"3",0,1,1,"ART NO : ${esc(t.style)}"`,
    `TEXT ${BOX_CONTENT_X},242,"2",0,1,1,"${esc(t.brand)}"`,
    `TEXT 220,242,"2",0,1,1,"${esc(t.category)}"`,
    `TEXT ${BOX_CONTENT_X},268,"2",0,1,1,"COLOUR : ${esc(t.color)}"`,
    `TEXT ${size.x},${size.y},"${size.font}",0,${size.mulX},${size.mulY},"${esc(size.text)}"`,
  ];
}

/** Pair stickers — bare values only (no captions); compact face. */
function pairPanelCommands(y0: number, t: Trunc): string[] {
  return [
    `TEXT ${PAIR_X},${y0 + 4},"1",0,1,1,"${esc(t.org)}"`,
    `BARCODE ${PAIR_X},${y0 + 16},"128",26,1,0,1,2,"${t.barcode}"`,
    `TEXT ${PAIR_X},${y0 + 44},"1",0,1,1,"${t.barcode}"`,
    `TEXT ${PAIR_X},${y0 + 54},"1",0,1,1,"Rs.${t.mrp}/-"`,
    `TEXT ${PAIR_X},${y0 + 66},"2",0,1,1,"${esc(t.product)}"`,
    `TEXT ${PAIR_X},${y0 + 82},"1",0,1,1,"${esc(t.style)}"`,
    `TEXT ${PAIR_X},${y0 + 94},"1",0,1,1,"${esc(t.brand)}"`,
    `TEXT ${PAIR_X + 115},${y0 + 94},"1",0,1,1,"${esc(t.category)}"`,
    `TEXT ${PAIR_X},${y0 + 106},"1",0,1,1,"${esc(t.color)}"`,
    `TEXT ${PAIR_X + 168},${y0 + 66},"3",0,1,1,"${esc(t.size)}"`,
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
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CODEPAGE UTF-8",
    "CLS",
    ...boxPanelCommands(box),
    ...(PRECISION_PRO_DEBUG_DIVIDERS
      ? [`BAR ${BOX_W - 2},0,2,${LABEL_H}`, `BAR ${PAIR_X},${PAIR_MID_Y},${PAIR_COL_W},2`]
      : []),
    ...pairPanelCommands(PAIR_TOP, pair),
    ...pairPanelCommands(PAIR_MID_Y, pair),
    `PRINT 1,${copies}`,
  ];

  return commands.join("\n");
}

export function generatePrecisionProTSCBatch(
  items: PrecisionProTSCLabelData[],
  copiesPerItem: number = 1,
): string {
  return items
    .map((item) => generatePrecisionProTSCLabel(item, copiesPerItem))
    .join("\n");
}
