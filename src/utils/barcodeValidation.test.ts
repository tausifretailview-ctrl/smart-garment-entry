import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  formatBarcodeConflictMessage,
  normalizeBarcodes,
} from "./barcodeValidation";

describe("normalizeBarcodes", () => {
  it("trims and dedupes barcodes", () => {
    expect(normalizeBarcodes([" 501 ", "501", "", "502"])).toEqual(["501", "502"]);
  });
});

describe("formatBarcodeConflictMessage", () => {
  it("lists barcode and product name", () => {
    expect(
      formatBarcodeConflictMessage([
        { barcode: "501", productName: "Service A" },
        { barcode: "501", productName: "Service A" },
        { barcode: "502", productName: "Service B" },
      ]),
    ).toBe('"501" (Service A), "502" (Service B)');
  });
});
