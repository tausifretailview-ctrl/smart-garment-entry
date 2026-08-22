import { describe, expect, it } from "vitest";
import { pickBestVariantScanRow } from "./lookupVariantByScan";

describe("pickBestVariantScanRow", () => {
  it("returns sole row", () => {
    const row = { id: "v1", barcode: "0040015241" };
    expect(pickBestVariantScanRow([row], ["00400152410040015241", "0040015241"])).toBe(row);
  });

  it("prefers candidate-exact barcode among multiples", () => {
    const a = { id: "v1", barcode: "999" };
    const b = { id: "v2", barcode: "0040015241" };
    expect(pickBestVariantScanRow([a, b], ["0040015241"])).toBe(b);
  });
});
