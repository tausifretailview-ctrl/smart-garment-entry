import { describe, expect, it } from "vitest";
import {
  allocateSettleSources,
  settleAllocationTotals,
} from "./settleCustomerAccountAllocation";

describe("allocateSettleSources", () => {
  it("applies advance to opening balance before invoices", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 100,
      invoices: [
        { id: "inv-1", outstanding: 200 },
        { id: "inv-2", outstanding: 200 },
      ],
      advancePool: 250,
      cnPool: 0,
      cash: 0,
      discount: 0,
    });
    expect(plan.advanceToOb).toBe(100);
    expect(plan.invoices[0].advance).toBe(150);
    expect(plan.invoices[1].advance).toBe(0);
    expect(settleAllocationTotals(plan).advance).toBe(250);
  });

  it("never applies credit notes to opening balance", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 80,
      invoices: [{ id: "inv-1", outstanding: 50 }],
      advancePool: 0,
      cnPool: 100,
      cash: 0,
      discount: 0,
    });
    expect(plan.advanceToOb).toBe(0);
    expect(plan.cashToOb).toBe(0);
    expect(plan.discountToOb).toBe(0);
    expect(plan.invoices[0].cn).toBe(50);
    expect(settleAllocationTotals(plan).cn).toBe(50);
  });

  it("applies leftover cash to remaining OB after advance, then invoices", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 100,
      invoices: [{ id: "inv-1", outstanding: 200 }],
      advancePool: 40,
      cnPool: 0,
      cash: 180,
      discount: 0,
    });
    expect(plan.advanceToOb).toBe(40);
    expect(plan.cashToOb).toBe(60);
    expect(plan.invoices[0].advance).toBe(0);
    expect(plan.invoices[0].cash).toBe(120);
  });

  it("applies cash before discount on the same target", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 50,
      invoices: [{ id: "inv-1", outstanding: 50 }],
      advancePool: 0,
      cnPool: 0,
      cash: 30,
      discount: 80,
    });
    expect(plan.cashToOb).toBe(30);
    expect(plan.discountToOb).toBe(20);
    expect(plan.invoices[0].cash).toBe(0);
    expect(plan.invoices[0].discount).toBe(50);
  });

  it("skips OB when remaining is 0 (deselected / none)", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 0,
      invoices: [{ id: "inv-1", outstanding: 100 }],
      advancePool: 40,
      cnPool: 0,
      cash: 0,
      discount: 0,
    });
    expect(plan.advanceToOb).toBe(0);
    expect(plan.invoices[0].advance).toBe(40);
  });

  it("walks invoices in given order (sale_date FIFO)", () => {
    const plan = allocateSettleSources({
      openingBalanceRemaining: 0,
      invoices: [
        { id: "older", outstanding: 30 },
        { id: "newer", outstanding: 30 },
      ],
      advancePool: 40,
      cnPool: 0,
      cash: 0,
      discount: 0,
    });
    expect(plan.invoices[0]).toMatchObject({ id: "older", advance: 30 });
    expect(plan.invoices[1]).toMatchObject({ id: "newer", advance: 10 });
  });
});
