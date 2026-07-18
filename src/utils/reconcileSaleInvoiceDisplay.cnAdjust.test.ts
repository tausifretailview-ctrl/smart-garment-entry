import { describe, expect, it } from "vitest";
import { reconcileSaleInvoiceDisplay } from "./customerBalanceUtils";

describe("reconcileSaleInvoiceDisplay — Adjust Credit Note status", () => {
  it("marks partial when CN/SRA applied on a still-unpaid full bill", () => {
    const rec = reconcileSaleInvoiceDisplay({
      net_amount: 7030,
      sale_return_adjust: 1283,
      paid_amount: 0,
      split: { cash: 0, cn: 1283, adv: 0, discount: 0 },
      // Sale-face gross ≈ net → SRA is on top (pre-return / Adjust CN).
      items_gross: 7030,
    });
    expect(rec.payment_status).toBe("partial");
    expect(rec.outstanding).toBeGreaterThan(0.01);
  });

  it("marks completed when CN fully settles the invoice", () => {
    const rec = reconcileSaleInvoiceDisplay({
      net_amount: 1283,
      sale_return_adjust: 1283,
      paid_amount: 0,
      split: { cash: 0, cn: 1283, adv: 0, discount: 0 },
      items_gross: 1283,
    });
    expect(rec.payment_status).toBe("completed");
    expect(rec.outstanding).toBeLessThanOrEqual(0.01);
  });

  it("keeps pending when no cash and no SRA", () => {
    const rec = reconcileSaleInvoiceDisplay({
      net_amount: 5000,
      sale_return_adjust: 0,
      paid_amount: 0,
      split: { cash: 0, cn: 0, adv: 0, discount: 0 },
    });
    expect(rec.payment_status).toBe("pending");
  });
});
