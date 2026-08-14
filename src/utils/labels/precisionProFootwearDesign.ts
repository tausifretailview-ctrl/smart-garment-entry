/**
 * Config-driven footwear form design (box + one pair template).
 * Pair is designed once and stamped at PAIR_TOP and PAIR_MID_Y.
 * Coordinates are dots relative to each panel origin (203 DPI).
 */

import {
  BOX_CONTENT_X,
  PAIR_X,
  boxSizeOverflowSafe,
} from "./precisionProGeometry";

export const FOOTWEAR_DESIGN_VERSION = 1 as const;

export type FootwearPanelId = "box" | "pair";

export type FootwearFieldKey =
  | "businessName"
  | "barcode"
  | "barcodeText"
  | "mrp"
  | "productName"
  | "style"
  | "brand"
  | "category"
  | "color"
  | "size";

export const FOOTWEAR_FIELD_KEYS: FootwearFieldKey[] = [
  "businessName",
  "barcode",
  "barcodeText",
  "mrp",
  "productName",
  "style",
  "brand",
  "category",
  "color",
  "size",
];

export const FOOTWEAR_FIELD_LABELS: Record<FootwearFieldKey, string> = {
  businessName: "Business Name",
  barcode: "Barcode (symbol)",
  barcodeText: "Barcode (text)",
  mrp: "MRP",
  productName: "Product",
  style: "Style / Art No",
  brand: "Brand",
  category: "Category",
  color: "Colour",
  size: "Size",
};

export type TsplFont = "1" | "2" | "3" | "4" | "5";

export interface FootwearFieldLayout {
  show: boolean;
  /** Dots from panel origin (box = form 0,0; pair = pair sticker top-left). */
  x: number;
  y: number;
  font: TsplFont;
  mulX: number;
  mulY: number;
  /** Text prefix (e.g. "ART NO : "). */
  caption?: string;
  /** Appended after value (e.g. "/-"). */
  suffix?: string;
  /** BARCODE height in dots (barcode field only). */
  barcodeHeight?: number;
  /** Field width in dots. Text = max width before clipping; barcode = symbol width. */
  widthDots?: number;
  /** Barcode module (narrow bar) width in dots — barcode field only. */
  barcodeNarrow?: number;
  /** When true, box size uses overflow-safe font/position. */
  sizeOverflowGuard?: boolean;
}

export type FootwearPanelFields = Record<FootwearFieldKey, FootwearFieldLayout>;

export interface FootwearPanelDesign {
  fields: FootwearPanelFields;
}

/** Physical panel sizes in mm (die-cut form). */
export interface FootwearLayoutDesign {
  boxWidthMm: number;
  boxHeightMm: number;
  pairWidthMm: number;
  pairHeightMm: number;
}

export const DEFAULT_FOOTWEAR_LAYOUT: FootwearLayoutDesign = {
  boxWidthMm: 64,
  boxHeightMm: 53,
  pairWidthMm: 38,
  pairHeightMm: 25,
};

export interface FootwearFormDesign {
  version: typeof FOOTWEAR_DESIGN_VERSION;
  layout: FootwearLayoutDesign;
  box: FootwearPanelDesign;
  pair: FootwearPanelDesign;
}

function field(
  partial: Omit<FootwearFieldLayout, "mulX" | "mulY" | "font"> &
    Partial<Pick<FootwearFieldLayout, "mulX" | "mulY" | "font">>,
): FootwearFieldLayout {
  return {
    font: "2",
    mulX: 1,
    mulY: 1,
    ...partial,
  };
}

/** Defaults = current hardcoded layout (byte-identical when design omitted/unchanged). */
export const DEFAULT_FOOTWEAR_FORM_DESIGN: FootwearFormDesign = {
  version: FOOTWEAR_DESIGN_VERSION,
  layout: { ...DEFAULT_FOOTWEAR_LAYOUT },
  box: {
    fields: {
      businessName: field({ show: true, x: BOX_CONTENT_X, y: 8, font: "3" }),
      mrp: field({ show: true, x: 300, y: 4, font: "5", caption: "Rs." }),
      barcode: field({
        show: true,
        x: BOX_CONTENT_X,
        y: 72,
        font: "2",
        barcodeHeight: 60,
      }),
      barcodeText: field({ show: true, x: BOX_CONTENT_X, y: 142, font: "3" }),
      size: field({ show: true, x: 330, y: 132, font: "5" }),
      style: field({ show: true, x: BOX_CONTENT_X, y: 190, font: "4" }),
      color: field({ show: true, x: 280, y: 196, font: "3" }),
      brand: field({ show: true, x: BOX_CONTENT_X, y: 240, font: "4" }),
      category: field({ show: true, x: BOX_CONTENT_X, y: 290, font: "4" }),
      productName: field({ show: false, x: BOX_CONTENT_X, y: 340, font: "3" }),
    },
  },
  pair: {
    fields: {
      // Relative to pair panel origin (absolute was PAIR_X + offsets).
      barcode: field({ show: true, x: 8, y: 4, font: "1", barcodeHeight: 34 }),
      barcodeText: field({ show: true, x: 8, y: 44, font: "2" }),
      size: field({ show: true, x: 230, y: 40, font: "3" }),
      style: field({ show: true, x: 8, y: 76, font: "4" }),
      color: field({ show: true, x: 8, y: 120, font: "2" }),
      mrp: field({ show: true, x: 150, y: 120, font: "2", caption: "Rs." }),
      businessName: field({ show: false, x: 8, y: 150, font: "1" }),
      productName: field({ show: false, x: 8, y: 150, font: "1" }),
      brand: field({ show: false, x: 8, y: 162, font: "1" }),
      category: field({ show: false, x: 150, y: 162, font: "1" }),
    },
  },
};

function mergeField(
  base: FootwearFieldLayout,
  patch?: Partial<FootwearFieldLayout> | null,
): FootwearFieldLayout {
  if (!patch) return { ...base };
  return { ...base, ...patch };
}

function mergePanel(
  base: FootwearPanelDesign,
  patch?: Partial<FootwearPanelDesign> | null,
): FootwearPanelDesign {
  const fields = { ...base.fields };
  if (patch?.fields) {
    for (const key of FOOTWEAR_FIELD_KEYS) {
      fields[key] = mergeField(base.fields[key], patch.fields[key]);
    }
  }
  return { fields };
}

/** Deep-merge a partial/saved design onto defaults (safe for older saves). */
export function resolveFootwearFormDesign(
  input?: Partial<FootwearFormDesign> | null,
): FootwearFormDesign {
  if (!input) return structuredClone(DEFAULT_FOOTWEAR_FORM_DESIGN);
  return {
    version: FOOTWEAR_DESIGN_VERSION,
    layout: { ...DEFAULT_FOOTWEAR_LAYOUT, ...(input.layout ?? {}) },
    box: mergePanel(DEFAULT_FOOTWEAR_FORM_DESIGN.box, input.box),
    pair: mergePanel(DEFAULT_FOOTWEAR_FORM_DESIGN.pair, input.pair),
  };
}

/** Overall form size in mm derived from panel sizes. */
export function footwearFormSizeMm(layout: FootwearLayoutDesign): {
  widthMm: number;
  heightMm: number;
} {
  return {
    widthMm: layout.boxWidthMm + layout.pairWidthMm,
    heightMm: Math.max(layout.boxHeightMm, layout.pairHeightMm * 2),
  };
}

export function updateFootwearLayout(
  design: FootwearFormDesign,
  patch: Partial<FootwearLayoutDesign>,
): FootwearFormDesign {
  const next = resolveFootwearFormDesign(design);
  next.layout = { ...next.layout, ...patch };
  return next;
}

export function updateFootwearField(
  design: FootwearFormDesign,
  panel: FootwearPanelId,
  key: FootwearFieldKey,
  patch: Partial<FootwearFieldLayout>,
): FootwearFormDesign {
  const next = resolveFootwearFormDesign(design);
  next[panel].fields[key] = { ...next[panel].fields[key], ...patch };
  return next;
}

export function footwearStorageKey(organizationId: string): string {
  return `precision_footwear_design_v1:${organizationId}`;
}

export function loadFootwearDesignFromStorage(
  organizationId: string | null | undefined,
): FootwearFormDesign {
  if (!organizationId || typeof localStorage === "undefined") {
    return resolveFootwearFormDesign(null);
  }
  try {
    const raw = localStorage.getItem(footwearStorageKey(organizationId));
    if (!raw) return resolveFootwearFormDesign(null);
    return resolveFootwearFormDesign(JSON.parse(raw) as Partial<FootwearFormDesign>);
  } catch {
    return resolveFootwearFormDesign(null);
  }
}

export function saveFootwearDesignToStorage(
  organizationId: string | null | undefined,
  design: FootwearFormDesign,
): void {
  if (!organizationId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      footwearStorageKey(organizationId),
      JSON.stringify(resolveFootwearFormDesign(design)),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/** Absolute size layout after optional overflow guard (box only). */
export function resolveBoxSizeLayout(
  sizeText: string,
  layout: FootwearFieldLayout,
): { text: string; x: number; y: number; font: string; mulX: number; mulY: number } {
  if (layout.sizeOverflowGuard) {
    const safe = boxSizeOverflowSafe(sizeText);
    return {
      text: safe.text,
      x: safe.x,
      y: safe.y,
      font: safe.font,
      mulX: safe.mulX,
      mulY: safe.mulY,
    };
  }
  return {
    text: sizeText,
    x: layout.x,
    y: layout.y,
    font: layout.font,
    mulX: layout.mulX,
    mulY: layout.mulY,
  };
}

/** Pair panel origin X in form dots (always PAIR_X). */
export function pairOriginX(): number {
  return PAIR_X;
}
