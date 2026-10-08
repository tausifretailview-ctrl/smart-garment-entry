import { describe, expect, it } from "vitest";
import { normalizeThermalReceiptMoney } from "@/utils/thermalReceiptSettlement";
import { posPrintSaleReturnAdjust, posPrintTotals } from "./printFigures";

describe("POS print figures", () => {
  it("prints a Cr-box credit note on the S/R line, not as Credit tender (POS/26-27/230)", () => {
    const totals = posPrintTotals({ mrp: 4800, subtotal: 4300, discount: 500 });
    const sra = posPrintSaleReturnAdjust(0, 3600);
    expect(sra).toBe(3600);
    expect(totals.subtotal).toBe(4800);
    // Subtotal − Discount − S/R = Grand total
    expect(totals.subtotal - totals.discount - sra).toBe(700);

    const money = normalizeThermalReceiptMoney({
      grandTotal: 700,
      saleReturnAdjust: sra,
      paidAmount: 700,
      cashPaid: 700,
      creditPaid: 0,
    });
    expect(money).toMatchObject({ grandTotal: 700, paidAmount: 700, cashPaid: 700, creditPaid: 0, balanceDue: 0 });
  });

  it("keeps a plain S/R adjust and adds both when present", () => {
    expect(posPrintSaleReturnAdjust(1000, 0)).toBe(1000);
    expect(posPrintSaleReturnAdjust(1000, 250.5)).toBe(1250.5);
    expect(posPrintSaleReturnAdjust(0, 0)).toBe(0);
  });
});
