import { describe, expect, it } from "vitest";
import {
  findHiddenVariantHintByBarcode,
  type PurchaseBarcodeStockClient,
} from "./stockReportPurchaseBarcodeResolve";

function clientReturning(data: unknown[] | null, error: unknown = null): PurchaseBarcodeStockClient {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.limit = () => Promise.resolve({ data, error });
  return { from: () => chain };
}

describe("findHiddenVariantHintByBarcode", () => {
  it("explains a barcode on a deleted product", async () => {
    const hint = await findHiddenVariantHintByBarcode(
      clientReturning([
        { barcode: "861747080643673", active: true, deleted_at: null, products: { product_name: "NARZO 100X", deleted_at: "2026-10-01" } },
      ]),
      "org",
      "861747080643673",
    );
    expect(hint?.title).toBe("Product was deleted");
    expect(hint?.description).toContain("NARZO 100X");
  });

  it("explains an inactive variant", async () => {
    const hint = await findHiddenVariantHintByBarcode(
      clientReturning([{ barcode: "1234", active: false, deleted_at: null, products: [{ product_name: "X", deleted_at: null }] }]),
      "org",
      "1234",
    );
    expect(hint?.title).toBe("Product is inactive");
  });

  it("returns null when nothing is hidden or the lookup fails", async () => {
    expect(await findHiddenVariantHintByBarcode(clientReturning([]), "org", "1234")).toBeNull();
    expect(await findHiddenVariantHintByBarcode(clientReturning(null, new Error("x")), "org", "1234")).toBeNull();
  });
});
