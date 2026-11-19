import { describe, expect, it } from "vitest";
import {
  capitalDirectionFromVoucherType,
  capitalToThirdPartyDirection,
  filterCapitalLedgers,
  isCapitalLedger,
  nextCapitalAccountCode,
  summarizeCapital,
} from "./capitalAccounts";

const acc = (id: string, code: string, name: string, type = "Equity", group: string | null = "Capital Account") =>
  ({ id, account_code: code, account_name: name, account_type: type, account_group: group }) as any;

describe("capital accounts", () => {
  it("picks Equity / Capital Account ledgers, never Owner's Drawings or other groups", () => {
    const list = [
      acc("d", "3100", "Owner's Drawings"),
      acc("p2", "3001", "Partner B Capital"),
      acc("p1", "3000", "Owner's Capital"),
      acc("r", "3200", "Reserves", "Equity", "Reserves & Surplus"),
      acc("c", "1000", "Cash in Hand", "Asset", "Current Assets"),
      acc("l", "9001", "Loan from Ravi", "Liability", "Loans (Liability)"),
    ];
    expect(filterCapitalLedgers(list).map((a) => a.id)).toEqual(["p1", "p2"]);
    expect(isCapitalLedger(acc("x", "3100", "Owner's Drawings"))).toBe(false);
  });

  it("allocates the next free capital code", () => {
    expect(nextCapitalAccountCode([])).toBe("3000");
    expect(nextCapitalAccountCode(["3000", "3001", "1000"])).toBe("3002");
    expect(() => nextCapitalAccountCode(Array.from({ length: 100 }, (_, i) => String(3000 + i)))).toThrow();
  });

  it("maps investment / withdrawal to receipt / payment", () => {
    expect(capitalToThirdPartyDirection("investment")).toBe("received");
    expect(capitalToThirdPartyDirection("withdrawal")).toBe("paid_out");
    expect(capitalDirectionFromVoucherType("receipt")).toBe("investment");
    expect(capitalDirectionFromVoucherType("payment")).toBe("withdrawal");
  });

  it("totals invested, withdrawn and net per owner, ignoring other parties' vouchers", () => {
    const ledgers = [acc("p1", "3000", "Owner's Capital"), acc("p2", "3001", "Partner B Capital")];
    const s = summarizeCapital(ledgers, [
      { id: "v1", voucher_type: "receipt", total_amount: 500000, reference_id: "p1" },
      { id: "v2", voucher_type: "receipt", total_amount: "250000.50", reference_id: "p1" },
      { id: "v3", voucher_type: "payment", total_amount: 50000, reference_id: "p1" },
      { id: "v4", voucher_type: "receipt", total_amount: 100000, reference_id: "p2" },
      { id: "v5", voucher_type: "receipt", total_amount: 999, reference_id: "loan-ledger" },
    ]);
    expect(s.rows).toEqual([
      { accountId: "p1", name: "Owner's Capital", code: "3000", invested: 750000.5, withdrawn: 50000, net: 700000.5, entries: 3 },
      { accountId: "p2", name: "Partner B Capital", code: "3001", invested: 100000, withdrawn: 0, net: 100000, entries: 1 },
    ]);
    expect(s).toMatchObject({ invested: 850000.5, withdrawn: 50000, net: 800000.5 });
  });
});

describe("capital voucher description", () => {
  it("round-trips the narration", async () => {
    const { buildCapitalVoucherDescription, parseCapitalNarration } = await import("./capitalAccounts");
    const d = buildCapitalVoucherDescription("investment", "Owner's Capital", "Shop renovation fund");
    expect(d).toBe("Capital Invested: Owner's Capital — Shop renovation fund");
    expect(parseCapitalNarration(d)).toBe("Shop renovation fund");
    expect(buildCapitalVoucherDescription("withdrawal", "Partner B", "  ")).toBe("Capital Withdrawn: Partner B — Capital withdrawn");
    expect(parseCapitalNarration("something else")).toBe("something else");
  });
});
