import { describe, expect, it } from "vitest";
import type { LabelDesignConfig } from "@/types/labelTypes";
import {
  applyLabelDesignerShift,
  captureLabelDesignerPositions,
  nudgeLabelDesignerConfig,
} from "./labelDesignerGroupMove";

const BASE_CONFIG: LabelDesignConfig = {
  brand: { show: true, fontSize: 8, bold: true, x: 1, y: 0.5, width: 48 },
  businessName: { show: false, fontSize: 7, bold: true, x: 1, y: 0, width: 48 },
  productName: { show: true, fontSize: 9, bold: true, x: 1, y: 3.5, width: 48 },
  category: { show: false, fontSize: 7, bold: false, x: 1, y: 6, width: 20 },
  color: { show: false, fontSize: 7, bold: false, x: 1, y: 6, width: 20 },
  style: { show: false, fontSize: 7, bold: false, x: 25, y: 6, width: 20 },
  size: { show: true, fontSize: 8, bold: true, x: 1, y: 7, width: 15 },
  price: { show: true, fontSize: 9, bold: true, x: 30, y: 7, width: 18 },
  mrp: { show: false, fontSize: 7, bold: false, x: 30, y: 9, width: 18 },
  qty: { show: false, fontSize: 7, bold: false, x: 1, y: 9, width: 20 },
  customText: { show: false, fontSize: 7, bold: false, x: 1, y: 22, width: 48 },
  barcode: { show: true, fontSize: 9, bold: false, x: 3, y: 10, width: 44, height: 8 },
  barcodeText: { show: true, fontSize: 7, bold: false, x: 1, y: 19, width: 48 },
  billNumber: { show: false, fontSize: 6, bold: false, x: 1, y: 22, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 25, y: 22, width: 24 },
  purchaseCode: { show: false, fontSize: 6, bold: false, x: 1, y: 23, width: 20 },
  fieldOrder: ["brand", "productName", "size", "price", "barcode", "barcodeText"],
  lines: [{ show: true, x: 1, y: 12, length: 48, thickness: 0.3, orientation: "horizontal" }],
  customTextFields: [
    {
      id: "ct1",
      value: "Non-Returnable",
      show: true,
      fontSize: 7,
      bold: false,
      x: 2,
      y: 20,
      width: 40,
    },
  ],
};

describe("captureLabelDesignerPositions", () => {
  it("captures field, line, and custom text positions", () => {
    const snapshot = captureLabelDesignerPositions(BASE_CONFIG);
    expect(snapshot.fields.brand).toEqual({ x: 1, y: 0.5 });
    expect(snapshot.fields.barcode).toEqual({ x: 3, y: 10 });
    expect(snapshot.lines[0]).toEqual({ x: 1, y: 12 });
    expect(snapshot.customTextFields[0]).toEqual({ x: 2, y: 20 });
  });
});

describe("applyLabelDesignerShift", () => {
  it("shifts all positioned elements together", () => {
    const snapshot = captureLabelDesignerPositions(BASE_CONFIG);
    const next = applyLabelDesignerShift(BASE_CONFIG, snapshot, 1, 0.5, { width: 50, height: 25 });
    expect(next.brand?.x).toBe(2);
    expect(next.brand?.y).toBe(1);
    expect(next.barcode?.x).toBe(4);
    expect(next.barcode?.y).toBe(10.5);
    expect(next.lines?.[0].x).toBe(2);
    expect(next.lines?.[0].y).toBe(12.5);
    expect(next.customTextFields?.[0].x).toBe(3);
    expect(next.customTextFields?.[0].y).toBe(20.5);
  });

  it("clamps group shift at label edges", () => {
    const snapshot = captureLabelDesignerPositions(BASE_CONFIG);
    const next = applyLabelDesignerShift(BASE_CONFIG, snapshot, -10, -10, { width: 50, height: 25 });
    expect(next.brand?.x).toBe(0);
    expect(next.brand?.y).toBe(0.5);
    expect(next.barcode?.x).toBe(2);
  });
});

describe("nudgeLabelDesignerConfig", () => {
  it("nudges all fields by 0.5mm in the requested direction", () => {
    const right = nudgeLabelDesignerConfig(BASE_CONFIG, "right", { width: 50, height: 25 });
    expect(right.brand?.x).toBe(1.5);
    expect(right.productName?.x).toBe(1.5);

    const down = nudgeLabelDesignerConfig(BASE_CONFIG, "down", { width: 50, height: 25 });
    expect(down.brand?.y).toBe(1);
    expect(down.productName?.y).toBe(4);
  });
});
