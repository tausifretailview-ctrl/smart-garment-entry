import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planPosUpdateCredit } from "./posUpdateCreditPlan";

const here = dirname(fileURLToPath(import.meta.url));

const base = {
  customerId: "cust-1",
  previousCustomerId: "cust-1",
  storedSaleReturnAdjust: 300,
  liveCreditNoteAdjust: 300,
  saleReturnAdjust: 300,
  creditApplied: 0,
};

describe("planPosUpdateCredit", () => {
  it("keeps unchanged S/R on the bill and does not consume the return again", () => {
    expect(planPosUpdateCredit(base)).toEqual({
      heldCredit: 300,
      release: false,
      headerSaleReturnAdjust: 300,
      applyCredit: false,
      passExchangeExcess: false,
    });
  });

  it("keeps a live CN voucher when the row's S/R drifted to 0", () => {
    const plan = planPosUpdateCredit({ ...base, storedSaleReturnAdjust: 0 });
    expect(plan.release).toBe(false);
    expect(plan.headerSaleReturnAdjust).toBe(300);
    expect(plan.applyCredit).toBe(false);
  });

  it("releases and re-applies when the S/R amount changes", () => {
    expect(planPosUpdateCredit({ ...base, saleReturnAdjust: 200 })).toEqual({
      heldCredit: 300,
      release: true,
      headerSaleReturnAdjust: 0,
      applyCredit: true,
      passExchangeExcess: false,
    });
  });

  it("releases only when S/R is cleared", () => {
    const plan = planPosUpdateCredit({ ...base, saleReturnAdjust: 0 });
    expect(plan.release).toBe(true);
    expect(plan.applyCredit).toBe(false);
    expect(plan.headerSaleReturnAdjust).toBe(0);
  });

  it("applies S/R added on edit through apply_pos_credit, like a new bill", () => {
    expect(
      planPosUpdateCredit({
        ...base,
        storedSaleReturnAdjust: 0,
        liveCreditNoteAdjust: 0,
        saleReturnAdjust: 250,
      }),
    ).toEqual({
      heldCredit: 0,
      release: false,
      headerSaleReturnAdjust: 0,
      applyCredit: true,
      passExchangeExcess: true,
    });
  });

  it("counts Cr-box credit added on edit as a change", () => {
    const plan = planPosUpdateCredit({ ...base, creditApplied: 100 });
    expect(plan.release).toBe(true);
    expect(plan.applyCredit).toBe(true);
  });

  it("moves credit when the bill's customer changes", () => {
    const plan = planPosUpdateCredit({ ...base, customerId: "cust-2" });
    expect(plan.release).toBe(true);
    expect(plan.applyCredit).toBe(true);
    expect(plan.headerSaleReturnAdjust).toBe(0);
  });

  it("stores walk-in S/R directly without touching credit notes", () => {
    expect(
      planPosUpdateCredit({
        customerId: null,
        previousCustomerId: null,
        storedSaleReturnAdjust: 300,
        liveCreditNoteAdjust: 0,
        saleReturnAdjust: 200,
        creditApplied: 0,
      }),
    ).toEqual({
      heldCredit: 300,
      release: false,
      headerSaleReturnAdjust: 200,
      applyCredit: false,
      passExchangeExcess: false,
    });
  });

  it("gives credit back when the customer is removed from the bill", () => {
    const plan = planPosUpdateCredit({ ...base, customerId: null, saleReturnAdjust: 0 });
    expect(plan.release).toBe(true);
    expect(plan.applyCredit).toBe(false);
  });

  it("is used by the POS bill update instead of re-consuming S/R", () => {
    const src = readFileSync(resolve(here, "../hooks/useSaveSale.tsx"), "utf8");
    const start = src.indexOf("const updateSale = async (");
    const end = src.indexOf("const holdSale = async (");
    const updateBody = src.slice(start, end);
    expect(updateBody).toContain("planPosUpdateCredit(");
    expect(updateBody).toContain("sale_return_adjust: creditPlan.headerSaleReturnAdjust");
    expect(updateBody).not.toContain("consumeSaleReturnAdjustments(");
    expect(updateBody).toContain("return { ...sale, ...creditResult };");
  });
});
