import { describe, expect, it } from "vitest";
import {
  amazonPushQty,
  buildQuantityPatch,
  cleanSellerSku,
  effectiveBuffer,
  isValidSellerId,
  listingsItemUrl,
  parseSkuBarcodeLines,
  readPushReply,
} from "../supabase/functions/_shared/amazonSpApi";

describe("Amazon stock sync helpers", () => {
  it("sends stock minus the buffer, whole pieces, never below 0", () => {
    expect(amazonPushQty(10, 2)).toBe(8);
    expect(amazonPushQty(2, 2)).toBe(0);
    expect(amazonPushQty(-3, 0)).toBe(0);
    expect(amazonPushQty(4.7, 0)).toBe(4);
    expect(amazonPushQty(null, 1)).toBe(0);
    expect(amazonPushQty(5, null)).toBe(5);
  });

  it("uses the SKU's own buffer, else the shop default", () => {
    expect(effectiveBuffer(3, 1)).toBe(3);
    expect(effectiveBuffer(0, 2)).toBe(0);
    expect(effectiveBuffer(null, 2)).toBe(2);
    expect(effectiveBuffer(undefined, undefined)).toBe(0);
  });

  it("builds the quantity patch Amazon expects", () => {
    expect(buildQuantityPatch(7)).toEqual({
      productType: "PRODUCT",
      patches: [
        {
          op: "replace",
          path: "/attributes/fulfillment_availability",
          value: [{ fulfillment_channel_code: "DEFAULT", quantity: 7 }],
        },
      ],
    });
  });

  it("encodes the SKU in the Amazon.in listings URL", () => {
    expect(listingsItemUrl("A1B2C3D4E5", "KURTA RED/M")).toBe(
      "https://sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/A1B2C3D4E5/KURTA%20RED%2FM?marketplaceIds=A21TJRUUN4KGV",
    );
  });

  it("checks Seller IDs and cleans SKUs", () => {
    expect(isValidSellerId("a2euq1wtgctbg2")).toBe(true);
    expect(isValidSellerId("bad id")).toBe(false);
    expect(cleanSellerSku("  ABC-1 \n")).toBe("ABC-1");
  });

  it("reads Amazon replies", () => {
    expect(readPushReply(200, { status: "ACCEPTED", issues: [] }).kind).toBe("ok");
    expect(readPushReply(429, null).kind).toBe("retry");
    expect(readPushReply(503, null).kind).toBe("retry");
    expect(readPushReply(404, null)).toEqual({ kind: "failed", message: "This SKU was not found in your Amazon.in listings." });
    const bad = readPushReply(200, { status: "INVALID", issues: [{ severity: "ERROR", message: "Bad value" }] });
    expect(bad).toEqual({ kind: "failed", message: "Amazon: Bad value" });
  });

  it("parses pasted SKU, barcode lines", () => {
    expect(parseSkuBarcodeLines("SKU,Barcode\nKURTA-RED-M, 100003548\nKURTA-RED-L\t100003549\n\nonlyone")).toEqual([
      { sku: "KURTA-RED-M", barcode: "100003548" },
      { sku: "KURTA-RED-L", barcode: "100003549" },
    ]);
  });
});
