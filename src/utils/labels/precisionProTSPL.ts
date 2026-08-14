// Precision Pro TSC — 102×53mm footwear label (box + 2 pair labels)
// Geometry: precisionProGeometry.ts · Field layout: precisionProFootwearDesign.ts

import {
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
} from "./precisionProGeometry";
import {
  DEFAULT_FOOTWEAR_FORM_DESIGN,
  FOOTWEAR_FIELD_KEYS,
  type FootwearFieldKey,
  type FootwearFieldLayout,
  type FootwearFormDesign,
  type FootwearPanelDesign,
  resolveBoxSizeLayout,
  resolveFootwearFormDesign,
} from "./precisionProFootwearDesign";

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

function fieldValue(key: FootwearFieldKey, t: Trunc, layout: FootwearFieldLayout): string {
  const raw =
    key === "businessName"
      ? t.org
      : key === "barcode" || key === "barcodeText"
        ? t.barcode
        : key === "mrp"
          ? String(t.mrp)
          : key === "productName"
            ? t.product
            : key === "style"
              ? t.style
              : key === "brand"
                ? t.brand
                : key === "category"
                  ? t.category
                  : key === "color"
                    ? t.color
                    : t.size;
  return `${layout.caption || ""}${raw}${layout.suffix || ""}`;
}

function panelCommands(
  panel: FootwearPanelDesign,
  originX: number,
  originY: number,
  t: Trunc,
  opts: { isBox: boolean },
): string[] {
  const out: string[] = [];
  for (const key of FOOTWEAR_FIELD_KEYS) {
    const layout = panel.fields[key];
    if (!layout?.show) continue;

    if (key === "barcode") {
      const narrow = opts.isBox ? boxBarcodeNarrowBarWidth(t.barcode) : 1;
      const h = layout.barcodeHeight ?? (opts.isBox ? 60 : 26);
      out.push(
        `BARCODE ${originX + layout.x},${originY + layout.y},"128",${h},1,0,${narrow},2,"${t.barcode}"`,
      );
      continue;
    }

    if (key === "size" && opts.isBox) {
      const size = resolveBoxSizeLayout(t.size, layout);
      out.push(
        `TEXT ${size.x},${size.y},"${size.font}",0,${size.mulX},${size.mulY},"${esc(size.text)}"`,
      );
      continue;
    }

    const text = fieldValue(key, t, layout);
    out.push(
      `TEXT ${originX + layout.x},${originY + layout.y},"${layout.font}",0,${layout.mulX},${layout.mulY},"${esc(text)}"`,
    );
  }
  return out;
}

export function generatePrecisionProTSCLabel(
  data: PrecisionProTSCLabelData,
  copies: number = 1,
  design?: FootwearFormDesign | null,
): string {
  const resolved = resolveFootwearFormDesign(design ?? DEFAULT_FOOTWEAR_FORM_DESIGN);
  const box = truncFields(data, false);
  const pair = truncFields(data, true);

  const commands = [
    `SIZE ${PRECISION_PRO_TSC_WIDTH_MM} mm, ${PRECISION_PRO_TSC_HEIGHT_MM} mm`,
    `GAP ${PRECISION_PRO_TSC_GAP_MM} mm, 0 mm`,
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CODEPAGE UTF-8",
    "CLS",
    ...panelCommands(resolved.box, 0, 0, box, { isBox: true }),
    ...(PRECISION_PRO_DEBUG_DIVIDERS
      ? [`BAR ${BOX_W - 2},0,2,${LABEL_H}`, `BAR ${PAIR_X},${PAIR_MID_Y},${PAIR_COL_W},2`]
      : []),
    ...panelCommands(resolved.pair, PAIR_X, PAIR_TOP, pair, { isBox: false }),
    ...panelCommands(resolved.pair, PAIR_X, PAIR_MID_Y, pair, { isBox: false }),
    `PRINT 1,${copies}`,
  ];

  return commands.join("\n");
}

export function generatePrecisionProTSCBatch(
  items: PrecisionProTSCLabelData[],
  copiesPerItem: number = 1,
  design?: FootwearFormDesign | null,
): string {
  return items
    .map((item) => generatePrecisionProTSCLabel(item, copiesPerItem, design))
    .join("\n");
}
