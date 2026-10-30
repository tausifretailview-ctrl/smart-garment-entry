import { describe, expect, it } from "vitest";
import { buildDayCloseCashLines } from "@/utils/accounting/dayCloseJournal";

const ids = { cashAccountId: "cash", drawingsAccountId: "drawings", shortExcessAccountId: "short" };

const sum = (lines: ReturnType<typeof buildDayCloseCashLines>, key: "debitAmount" | "creditAmount") =>
  lines.reduce((s, l) => s + l[key], 0);

describe("buildDayCloseCashLines", () => {
  it("owner handover leaves Cash in Hand: Dr Drawings, Cr Cash", () => {
    const lines = buildDayCloseCashLines({ ...ids, handover: 5000, difference: 0 });
    expect(lines).toEqual([
      { accountId: "drawings", debitAmount: 5000, creditAmount: 0 },
      { accountId: "cash", debitAmount: 0, creditAmount: 5000 },
    ]);
  });

  it("cash short is an expense, cash excess an income, both against Cash", () => {
    const short = buildDayCloseCashLines({ ...ids, handover: 0, difference: -120 });
    expect(short).toEqual([
      { accountId: "short", debitAmount: 120, creditAmount: 0 },
      { accountId: "cash", debitAmount: 0, creditAmount: 120 },
    ]);
    const excess = buildDayCloseCashLines({ ...ids, handover: 0, difference: 80 });
    expect(excess).toEqual([
      { accountId: "cash", debitAmount: 80, creditAmount: 0 },
      { accountId: "short", debitAmount: 0, creditAmount: 80 },
    ]);
  });

  it("handover and short together balance", () => {
    const lines = buildDayCloseCashLines({ ...ids, handover: 3000, difference: -50 });
    expect(sum(lines, "debitAmount")).toBe(3050);
    expect(sum(lines, "creditAmount")).toBe(3050);
  });

  it("nothing to post when the drawer balances and nothing was handed over", () => {
    expect(buildDayCloseCashLines({ ...ids, handover: 0, difference: 0.004 })).toEqual([]);
  });
});
