import type { LabelDesignConfig, FieldKey } from "@/types/labelTypes";
import { getCustomTextFields } from "@/utils/labelCustomText";
import { legacyBarcodeHeightMm } from "@/utils/barcodeLabelLayout";

export const LABEL_DESIGNER_NUDGE_MM = 0.5;

const POSITIONABLE_FIELD_KEYS: FieldKey[] = [
  "businessName",
  "brand",
  "productName",
  "category",
  "color",
  "style",
  "size",
  "price",
  "mrp",
  "qty",
  "customText",
  "barcode",
  "barcodeText",
  "billNumber",
  "supplierCode",
  "purchaseCode",
  "supplierInvoiceNo",
];

export type LabelDesignerPositionSnapshot = {
  fields: Partial<Record<FieldKey, { x: number; y: number }>>;
  lines: Array<{ x: number; y: number }>;
  customTextFields: Array<{ x: number; y: number }>;
};

export function captureLabelDesignerPositions(config: LabelDesignConfig): LabelDesignerPositionSnapshot {
  const fields: Partial<Record<FieldKey, { x: number; y: number }>> = {};
  for (const key of POSITIONABLE_FIELD_KEYS) {
    const field = config[key];
    if (!field) continue;
    fields[key] = { x: field.x ?? 0, y: field.y ?? 0 };
  }

  return {
    fields,
    lines: (config.lines ?? []).map((line) => ({ x: line.x ?? 0, y: line.y ?? 0 })),
    customTextFields: getCustomTextFields(config).map((slot) => ({
      x: slot.x ?? 0,
      y: slot.y ?? 0,
    })),
  };
}

function roundMm(value: number): number {
  return Math.round(value * 2) / 2;
}

function resolveBarcodeHeightMm(config: LabelDesignConfig, labelHeight: number): number {
  const field = config.barcode;
  return field?.height ?? legacyBarcodeHeightMm(config.barcodeHeight, labelHeight);
}

function clampGroupShift(
  snapshot: LabelDesignerPositionSnapshot,
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
  barcodeHeightMm: number,
): { dx: number; dy: number } {
  let maxDxLeft = Infinity;
  let maxDxRight = Infinity;
  let maxDyUp = Infinity;
  let maxDyDown = Infinity;

  for (const [key, pos] of Object.entries(snapshot.fields) as Array<[FieldKey, { x: number; y: number }]>) {
    maxDxLeft = Math.min(maxDxLeft, pos.x);
    maxDxRight = Math.min(maxDxRight, bounds.width - pos.x);
    const maxY = key === "barcode" ? bounds.height - barcodeHeightMm : bounds.height;
    maxDyUp = Math.min(maxDyUp, pos.y);
    maxDyDown = Math.min(maxDyDown, maxY - pos.y);
  }

  for (const pos of snapshot.lines) {
    maxDxLeft = Math.min(maxDxLeft, pos.x);
    maxDxRight = Math.min(maxDxRight, bounds.width - pos.x);
    maxDyUp = Math.min(maxDyUp, pos.y);
    maxDyDown = Math.min(maxDyDown, bounds.height - pos.y);
  }

  for (const pos of snapshot.customTextFields) {
    maxDxLeft = Math.min(maxDxLeft, pos.x);
    maxDxRight = Math.min(maxDxRight, bounds.width - pos.x);
    maxDyUp = Math.min(maxDyUp, pos.y);
    maxDyDown = Math.min(maxDyDown, bounds.height - pos.y);
  }

  return {
    dx: Math.max(-maxDxLeft, Math.min(maxDxRight, dx)),
    dy: Math.max(-maxDyUp, Math.min(maxDyDown, dy)),
  };
}

export function applyLabelDesignerShift(
  config: LabelDesignConfig,
  snapshot: LabelDesignerPositionSnapshot,
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
): LabelDesignConfig {
  const barcodeHeightMm = resolveBarcodeHeightMm(config, bounds.height);
  const { dx: clampedDx, dy: clampedDy } = clampGroupShift(snapshot, dx, dy, bounds, barcodeHeightMm);

  const next: LabelDesignConfig = { ...config };

  for (const key of POSITIONABLE_FIELD_KEYS) {
    const orig = snapshot.fields[key];
    const field = config[key];
    if (!orig || !field) continue;
    next[key] = {
      ...field,
      x: roundMm(orig.x + clampedDx),
      y: roundMm(orig.y + clampedDy),
    };
  }

  if (config.lines?.length) {
    next.lines = config.lines.map((line, index) => {
      const orig = snapshot.lines[index];
      if (!orig) return line;
      return {
        ...line,
        x: roundMm(orig.x + clampedDx),
        y: roundMm(orig.y + clampedDy),
      };
    });
  }

  const customSlots = getCustomTextFields(config);
  if (customSlots.length) {
    next.customTextFields = customSlots.map((slot, index) => {
      const orig = snapshot.customTextFields[index];
      if (!orig) return slot;
      return {
        ...slot,
        x: roundMm(orig.x + clampedDx),
        y: roundMm(orig.y + clampedDy),
      };
    });
  }

  return next;
}

export function nudgeLabelDesignerConfig(
  config: LabelDesignConfig,
  direction: "left" | "right" | "up" | "down",
  bounds: { width: number; height: number },
  stepMm = LABEL_DESIGNER_NUDGE_MM,
): LabelDesignConfig {
  const snapshot = captureLabelDesignerPositions(config);
  const dx = direction === "left" ? -stepMm : direction === "right" ? stepMm : 0;
  const dy = direction === "up" ? -stepMm : direction === "down" ? stepMm : 0;
  return applyLabelDesignerShift(config, snapshot, dx, dy, bounds);
}
