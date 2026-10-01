import { describe, expect, it } from "vitest";
import {
  buildInvoicePaymentModeParts,
  invoiceCardBucketPaymentLabel,
} from "@/utils/invoicePaymentModeDisplay";

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

describe("invoiceCardBucketPaymentLabel", () => {
  it("uses Finance when financer details exist (mix payment in card_amount)", () => {
    expect(
      invoiceCardBucketPaymentLabel({
        paymentMethod: "multiple",
        financerDetails: { financer_name: "HDBFS" },
      }),
    ).toBe("Finance");
  });

  it("uses Card for plain card tender", () => {
    expect(
      invoiceCardBucketPaymentLabel({
        paymentMethod: "card",
        financerDetails: null,
      }),
    ).toBe("Card");
  });
});

describe("buildInvoicePaymentModeParts", () => {
  it("shows Cash and Finance for cash + financer mix (Tally A4 case)", () => {
    const parts = buildInvoicePaymentModeParts(
      {
        paymentMethod: "multiple",
        cashAmount: 1800,
        cardAmount: 25199,
        financerDetails: { financer_name: "Bajaj Finance" },
      },
      fmt,
    );
    expect(parts).toEqual(["Cash ₹1,800", "Finance ₹25,199"]);
  });
});
