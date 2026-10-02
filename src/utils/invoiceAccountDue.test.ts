import { describe, expect, it } from "vitest";
import {
  gurukrupaInvoiceAccountLines,
  invoiceReceivedToday,
  invoicePreviousBalanceFromAccount,
  invoicePrintBalances,
  invoiceThisBillBalance,
  invoiceTotalDue,
} from "./invoiceAccountDue";

describe("Gurukrupa invoice Prev Bal / Total Due vs customer account", () => {
  /** Live A5 tax invoice POS/26-27/1728 — SHUBHANGI SATPUTE, pay later, S/R ₹0. */
  const billTotal = 2_400;
  const received = 0;
  const prevOnAccount = 7_500;
  const accountAfterThisBill = 9_900;

  it("this bill Balance is Bill Total minus Received", () => {
    expect(invoiceThisBillBalance(billTotal, received)).toBe(2_400);
  });

  it("POS save: Prev Bal is the pre-sale customer account", () => {
    const thisBill = invoiceThisBillBalance(billTotal, received);
    const prev = invoicePreviousBalanceFromAccount({
      accountOutstanding: prevOnAccount,
      thisBillBalance: thisBill,
      accountIncludesThisBill: false,
    });
    expect(prev).toBe(7_500);
    expect(invoiceTotalDue(prev, thisBill)).toBe(9_900);
  });

  it("reprint: subtract this bill from the post-sale account so Prev Bal is not double-counted", () => {
    const thisBill = invoiceThisBillBalance(billTotal, received);
    const prev = invoicePreviousBalanceFromAccount({
      accountOutstanding: accountAfterThisBill,
      thisBillBalance: thisBill,
      accountIncludesThisBill: true,
    });
    expect(prev).toBe(7_500);
    expect(invoiceTotalDue(prev, thisBill)).toBe(9_900);
  });

  it("must not print full account as Prev Bal (that would show Total Due ₹12,300)", () => {
    const thisBill = invoiceThisBillBalance(billTotal, received);
    expect(invoiceTotalDue(accountAfterThisBill, thisBill)).toBe(12_300);
    const prev = invoicePreviousBalanceFromAccount({
      accountOutstanding: accountAfterThisBill,
      thisBillBalance: thisBill,
      accountIncludesThisBill: true,
    });
    expect(invoiceTotalDue(prev, thisBill)).toBe(accountAfterThisBill);
  });

  it("paid-in-full reprint: Total Due is live invoice outstanding, not ₹0", () => {
    const printed = invoicePrintBalances({
      accountOutstanding: 12_000,
      billTotal: 5_500,
      receivedToday: 5_500,
      accountIncludesThisBill: true,
    });
    expect(printed.thisBillBalance).toBe(0);
    expect(printed.previousBalance).toBe(12_000);
    expect(printed.totalDue).toBe(12_000);
  });

  it("Total Due follows invoice leftover, not net-of-advance (which can be ₹0)", () => {
    const invoiceOutstanding = 12_000;
    const netAfterAdvance = 0;
    const printedFromNet = invoicePrintBalances({
      accountOutstanding: netAfterAdvance,
      billTotal: 5_500,
      receivedToday: 5_500,
      accountIncludesThisBill: true,
    });
    expect(printedFromNet.totalDue).toBe(0);
    const printedFromOutstanding = invoicePrintBalances({
      accountOutstanding: invoiceOutstanding,
      billTotal: 5_500,
      receivedToday: 5_500,
      accountIncludesThisBill: true,
    });
    expect(printedFromOutstanding.totalDue).toBe(12_000);
  });
});

describe("Gurukrupa A5 split Outstanding / Advance (POS/26-27/1903 SHREEVASTAV)", () => {
  it("prints Outstanding and Advance separately; Total Due is outstanding − advance", () => {
    const lines = gurukrupaInvoiceAccountLines({
      previousBalance: 16_250,
      thisBillBalance: 0,
      unusedAdvance: 1_000,
    });
    expect(lines.outstanding).toBe(16_250);
    expect(lines.advance).toBe(1_000);
    expect(lines.totalDue).toBe(15_250);
  });

  it("includes this-bill Balance in Outstanding when the invoice is unpaid", () => {
    const lines = gurukrupaInvoiceAccountLines({
      previousBalance: 7_500,
      thisBillBalance: 2_400,
      unusedAdvance: 1_000,
    });
    expect(lines.outstanding).toBe(9_900);
    expect(lines.advance).toBe(1_000);
    expect(lines.totalDue).toBe(8_900);
  });

  it("does not let unused advance go negative", () => {
    const lines = gurukrupaInvoiceAccountLines({
      previousBalance: 16_250,
      thisBillBalance: 0,
      unusedAdvance: -50,
    });
    expect(lines.advance).toBe(0);
    expect(lines.totalDue).toBe(16_250);
  });
});

describe("Mix payment Credit is unpaid, not Received (Gurukrupa POS/26-27/2000 SARSWATI JI)", () => {
  it("Bill ₹1,800 = Cash ₹1,000 + Credit ₹800 → Received ₹1,000, Balance ₹800", () => {
    const received = invoiceReceivedToday({ billTotal: 1_800, tenderApplied: 1_000, paidAmount: 1_000 });
    expect(received).toBe(1_000);
    const balance = invoiceThisBillBalance(1_800, received);
    expect(balance).toBe(800);

    // Account after save = ₹4,300 (₹3,500 old + ₹800 this bill).
    const prev = invoicePreviousBalanceFromAccount({
      accountOutstanding: 4_300,
      thisBillBalance: balance,
      accountIncludesThisBill: true,
    });
    expect(prev).toBe(3_500);
    const lines = gurukrupaInvoiceAccountLines({ previousBalance: prev, thisBillBalance: balance, unusedAdvance: 0 });
    expect(lines.outstanding).toBe(4_300);
    expect(lines.totalDue).toBe(4_300);
  });

  it("full credit bill receives nothing", () => {
    expect(invoiceReceivedToday({ billTotal: 1_800, tenderApplied: 0, paidAmount: 0 })).toBe(0);
  });

  it("falls back to settled paid when no mode split, capped at bill total", () => {
    expect(invoiceReceivedToday({ billTotal: 1_800, tenderApplied: 0, paidAmount: 1_200 })).toBe(1_200);
    expect(invoiceReceivedToday({ billTotal: 1_800, tenderApplied: 2_000, paidAmount: 0 })).toBe(1_800);
  });
});
