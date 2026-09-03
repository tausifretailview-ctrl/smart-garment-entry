import { describe, expect, it } from "vitest";
import {
  invoicePreviousBalanceFromAccount,
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
});
