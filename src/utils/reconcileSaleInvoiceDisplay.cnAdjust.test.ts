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

  it("Customer Payment pending matches Sales dashboard after CN adjust (NEW SAHELI #214)", () => {
    // net 2013 − cash 441 − S/R 1259 = 313
    const withGross = reconcileSaleInvoiceDisplay({
      net_amount: 2013,
      sale_return_adjust: 1259,
      paid_amount: 441,
      split: { cash: 0, cn: 1259, adv: 0, discount: 0 },
      items_gross: 2013,
    });
    expect(withGross.outstanding).toBe(313);
    expect(withGross.payment_status).toBe("partial");

    // Without items_gross, CN-backed SRA still reduces payable (was stuck at 1572).
    const withoutGross = reconcileSaleInvoiceDisplay({
      net_amount: 2013,
      sale_return_adjust: 1259,
      paid_amount: 441,
      split: { cash: 0, cn: 1259, adv: 0, discount: 0 },
    });
    expect(withoutGross.outstanding).toBe(313);
  });
});
