import { describe, expect, it } from "vitest";
import { buildEllaOrderMessage } from "@/storefront/ellaOrder";
import type { EllaCartLine } from "@/storefront/ellaCart";
import {
  aggregateVariantRows,
  appendBookedVariantMarks,
  barcodeColumnLabel,
  bookedVariantIdsFromMessage,
  enquiryDisplayPieces,
  enquiryMessageForDisplay,
  messageBooksSize,
} from "./storefrontVariantSummary";

const SM = "11111111-1111-4111-8111-111111111111";
const LG = "22222222-2222-4222-8222-222222222222";

const variants = [
  { id: SM, product_id: "p1", size: "SM", color: "Black", barcode: "84501001" },
  { id: LG, product_id: "p1", size: "L", color: "Red", barcode: "84501002" },
  { id: "33333333-3333-4333-8333-333333333333", product_id: "p2", size: "US", barcode: "84502001" },
];

describe("barcodeColumnLabel", () => {
  it("shows a single barcode on its own and pairs size when there are several", () => {
    expect(barcodeColumnLabel([variants[0]])).toBe("84501001");
    expect(barcodeColumnLabel(variants.slice(0, 2))).toBe("SM · 84501001, L · 84501002");
    expect(barcodeColumnLabel([{ size: "SM", barcode: "  " }])).toBe("—");
  });

  it("groups barcodes by product for the website tables", () => {
    expect(aggregateVariantRows(variants).p1).toEqual({
      sizesLabel: "SM, L",
      colorsLabel: "Black, Red",
      barcodesLabel: "SM · 84501001, L · 84501002",
    });
  });
});

describe("enquiryDisplayPieces", () => {
  it("uses the booked variant id so the enquiry shows that piece only", () => {
    const pieces = enquiryDisplayPieces(
      {
        product_id: "p1",
        message: `STORE ORDER · AB-A01 L x1 [v:${LG}]`,
      },
      variants,
    );
    expect(pieces.sizesLabel).toBe("L");
    expect(pieces.barcodesLabel).toBe("84501002");
    expect(enquiryMessageForDisplay(`STORE ORDER · AB-A01 L x1 [v:${LG}]`)).toBe(
      "STORE ORDER · AB-A01 L x1",
    );
  });

  it("matches an older order line that names the size but not the variant id", () => {
    const pieces = enquiryDisplayPieces(
      { product_id: "p1", message: "STORE ORDER · AB-A01 SM x1 · Total ₹8,450" },
      variants,
    );
    expect(pieces.sizesLabel).toBe("SM");
    expect(pieces.barcodesLabel).toBe("84501001");
  });

  it("does not treat a word in the message as a size", () => {
    expect(messageBooksSize("Please contact us about this dress", "US")).toBe(false);
    expect(messageBooksSize("AB-A01 SM x1", "S")).toBe(false);
    const pieces = enquiryDisplayPieces(
      { product_id: "p2", message: "Please contact us about this dress" },
      variants,
    );
    expect(pieces.sizesLabel).toBe("US");
    expect(pieces.barcodesLabel).toBe("84502001");
  });

  it("prefers size and barcode already stored on the enquiry", () => {
    const pieces = enquiryDisplayPieces(
      {
        product_id: "p1",
        message: "STORE ORDER · AB-A01 SM x1",
        booked_pieces: [{ size: "L", barcode: "84501002" }],
      },
      variants,
    );
    expect(pieces.sizesLabel).toBe("L");
    expect(pieces.barcodesLabel).toBe("84501002");
  });

  it("still shows the booked size when the variant row is gone", () => {
    const pieces = enquiryDisplayPieces(
      { product_id: null, message: "STORE ORDER · AB-A01 SM x1 · Total ₹8,450" },
      [],
    );
    expect(pieces.sizesLabel).toBe("SM");
    expect(pieces.barcodesLabel).toBe("—");
  });
});

describe("appendBookedVariantMarks", () => {
  it("keeps only real variant ids and stays inside the enquiry limit", () => {
    const marked = appendBookedVariantMarks("STORE ORDER · AB-A01 SM x1", [SM, "v-38", null], 1000);
    expect(bookedVariantIdsFromMessage(marked)).toEqual([SM]);
    expect(marked.length).toBeLessThanOrEqual(1000);

    const huge = appendBookedVariantMarks("x".repeat(2000), [SM], 80);
    expect(huge.length).toBeLessThanOrEqual(80);
    expect(huge.endsWith(`[v:${SM}]`)).toBe(true);
  });

  it("stamps the website order message with the size that was booked", () => {
    const line: EllaCartLine = {
      key: "p1::SM",
      productId: "p1",
      variantId: SM,
      code: "AB-A01",
      name: "Anarkali",
      size: "SM",
      price: 8450,
      priceLabel: "₹8,450",
      qty: 1,
      maxQty: 1,
    };
    const message = buildEllaOrderMessage({
      cart: [line],
      total: 8450,
      method: "upi",
      customer: {
        customerName: "Asha",
        customerPhone: "9876543210",
        address: "12 Studio Lane, Mumbai",
        pincode: "400001",
      },
      upiReference: "AXIS123456",
    });
    expect(message).toContain("AB-A01 SM x1");
    expect(message).toContain(`[v:${SM}]`);
    expect(message.length).toBeLessThanOrEqual(1000);
    expect(
      enquiryDisplayPieces({ product_id: "p1", message }, variants).barcodesLabel,
    ).toBe("84501001");
  });
});
