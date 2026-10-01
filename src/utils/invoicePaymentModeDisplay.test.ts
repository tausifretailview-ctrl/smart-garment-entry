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

describe("buildInvoicePaymentModeParts with a Mix Payment finance amount", () => {
  it("shows Finance apart from Card when the whole card bucket is finance", () => {
    expect(
      buildInvoicePaymentModeParts(
        { paymentMethod: "multiple", cashAmount: 6500, cardAmount: 18000, financeAmount: 18000 },
        fmt,
      ),
    ).toEqual(["Cash ₹6,500", "Finance ₹18,000"]);
  });

  it("keeps the real card part when card and finance are both used", () => {
    expect(
      buildInvoicePaymentModeParts(
        { paymentMethod: "multiple", cashAmount: 1000, cardAmount: 5000, financeAmount: 3000 },
        fmt,
      ),
    ).toEqual(["Cash ₹1,000", "Card ₹2,000", "Finance ₹3,000"]);
  });

  it("is unchanged without a finance amount", () => {
    expect(
      buildInvoicePaymentModeParts({ paymentMethod: "multiple", cashAmount: 100, cardAmount: 200 }, fmt),
    ).toEqual(["Cash ₹100", "Card ₹200"]);
  });

  it("never lets finance exceed the card bucket", () => {
    expect(
      buildInvoicePaymentModeParts({ cardAmount: 500, financeAmount: 900 }, fmt),
    ).toEqual(["Finance ₹500"]);
  });
});
