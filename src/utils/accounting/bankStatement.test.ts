import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/utils/accountingReportUtils", () => ({ calculateGlAccountLedger: vi.fn() }));
vi.mock("@/utils/accounting/journalService", () => ({
  deleteJournalEntryByReference: vi.fn(),
  postJournalEntry: vi.fn(),
}));
vi.mock("@/utils/accounting/seedDefaultAccounts", () => ({ seedDefaultAccounts: vi.fn() }));

import {
  bankReferenceTypeLabel,
  cleanBankStatementDescription,
  filterBankStatementRows,
  summarizeBankStatement,
  type BankStatementRow,
} from "@/utils/accounting/bankStatement";

const row = (over: Partial<BankStatementRow>): BankStatementRow => ({
  key: Math.random().toString(),
  date: "2026-10-05",
  createdAt: null,
  journalEntryId: "je",
  referenceType: "Sale",
  referenceId: "ref",
  description: "",
  docNumber: null,
  paymentMethod: null,
  partyName: null,
  bankAccountId: null,
  debit: 0,
  credit: 0,
  balance: 0,
  isOpening: false,
  ...over,
});

const opening = row({ referenceType: "_opening", isOpening: true, balance: 1000, description: "Opening balance" });
const sale = row({ debit: 500, balance: 1500, docNumber: "POS/12", partyName: "Ravi", paymentMethod: "upi" });
const deposit = row({ referenceType: "Contra", debit: 2000, balance: 3500, description: "Cash deposit to HDFC" });
const supplier = row({ referenceType: "SupplierPayment", credit: 300, balance: 3200, partyName: "Shah Textiles" });

describe("summarizeBankStatement", () => {
  it("opening + in − out = closing", () => {
    expect(summarizeBankStatement([opening, sale, deposit, supplier])).toEqual({
      opening: 1000,
      totalIn: 2500,
      totalOut: 300,
      closing: 3200,
    });
  });

  it("no opening row starts at zero", () => {
    expect(summarizeBankStatement([sale]).closing).toBe(500);
  });
});

describe("filterBankStatementRows", () => {
  const rows = [opening, sale, deposit, supplier];

  it("keeps the opening row only for an unfiltered view", () => {
    expect(filterBankStatementRows(rows, "", "all")).toHaveLength(4);
    expect(filterBankStatementRows(rows, "", "in")).toEqual([sale, deposit]);
    expect(filterBankStatementRows(rows, "", "out")).toEqual([supplier]);
  });

  it("searches bill no, party, mode and type", () => {
    expect(filterBankStatementRows(rows, "pos/12", "all")).toEqual([sale]);
    expect(filterBankStatementRows(rows, "shah", "all")).toEqual([supplier]);
    expect(filterBankStatementRows(rows, "upi", "all")).toEqual([sale]);
    expect(filterBankStatementRows(rows, "cash deposit", "all")).toEqual([deposit]);
  });
});

describe("labels", () => {
  it("contra reads as deposit or withdrawal", () => {
    expect(bankReferenceTypeLabel("Contra", 100)).toBe("Cash deposit");
    expect(bankReferenceTypeLabel("Contra", 0)).toBe("Cash withdrawal");
    expect(bankReferenceTypeLabel("CustomerReceipt")).toBe("Customer receipt");
  });

  it("auto sale narration shows the bill number", () => {
    expect(cleanBankStatementDescription("Auto journal for sale 1b2c", "POS/9")).toBe("Sale POS/9");
    expect(cleanBankStatementDescription("Receipt from Ravi", null)).toBe("Receipt from Ravi");
    expect(cleanBankStatementDescription("Sale 25adb583", "POS/26-27/333")).toBe("Sale POS/26-27/333");
  });
});
