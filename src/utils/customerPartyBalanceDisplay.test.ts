import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PARTY_BALANCES_PAGE_SIZE,
  filterPartyBalanceRows,
  includeSettledInPartyBalanceList,
  matchesPartyBalanceSearch,
  matchesPartyDirectionFilter,
  partyBalanceDirection,
  partyBalanceDisplayAmount,
  partyBalanceDirectionToneClass,
  partyDebitOutstandingAmount,
  partyBalanceExportRowAmounts,
  partyBalanceTotalPages,
  slicePartyBalancePage,
} from "./customerPartyBalanceDisplay";

describe("partyBalanceDirection", () => {
  it("uses RPC direction when present (does not re-derive from sign)", () => {
    expect(partyBalanceDirection({ direction: "Cr", signed_balance: 20600 })).toBe("Cr");
    expect(partyBalanceDirection({ direction: "Dr", signed_balance: -500 })).toBe("Dr");
    expect(partyBalanceDirection({ direction: "Settled", signed_balance: 1000 })).toBe("Settled");
  });

  it("maps positive signed_balance to Dr when RPC direction is missing", () => {
    expect(partyBalanceDirection({ signed_balance: 20600 })).toBe("Dr");
    expect(partyBalanceDirection({ direction: "", signed_balance: 20600 })).toBe("Dr");
  });

  it("maps negative signed_balance to Cr when RPC direction is missing", () => {
    expect(partyBalanceDirection({ signed_balance: -12850 })).toBe("Cr");
    expect(partyBalanceDirection({ direction: null, signed_balance: -0.51 })).toBe("Cr");
  });

  it("treats near-zero balances as Settled", () => {
    expect(partyBalanceDirection({ signed_balance: 0 })).toBe("Settled");
    expect(partyBalanceDirection({ signed_balance: 0.4 })).toBe("Settled");
    expect(partyBalanceDirection({ signed_balance: -0.4 })).toBe("Settled");
  });
});

describe("partyBalanceDisplayAmount", () => {
  it("shows absolute value for Dr and Cr rows", () => {
    expect(partyBalanceDisplayAmount(20600)).toBe(20600);
    expect(partyBalanceDisplayAmount(-12850)).toBe(12850);
  });
});

describe("partyDebitOutstandingAmount", () => {
  it("AARISH credit is not shown as Outstanding — only Net Cr", () => {
    expect(partyDebitOutstandingAmount(-6550)).toBe(0);
    expect(partyDebitOutstandingAmount(0)).toBe(0);
  });

  it("keeps genuine debit outstanding (gross, not netted with advance)", () => {
    expect(partyDebitOutstandingAmount(25000)).toBe(25000);
    expect(partyDebitOutstandingAmount(16000)).toBe(16000);
  });
});

describe("partyBalanceExportRowAmounts", () => {
  it("exports debit Outstanding only — credit notes stay on Net Cr", () => {
    expect(
      partyBalanceExportRowAmounts({
        outstanding: -6550,
        unusedAdvance: 0,
        netPosition: -6550,
      }),
    ).toEqual({
      outstanding: 0,
      unusedAdvance: 0,
      netPosition: 6550,
    });
  });

  it("leaves already-positive Dr amounts unchanged", () => {
    expect(
      partyBalanceExportRowAmounts({
        outstanding: 61950,
        unusedAdvance: 0,
        netPosition: 61950,
      }),
    ).toEqual({
      outstanding: 61950,
      unusedAdvance: 0,
      netPosition: 61950,
    });
  });
});

describe("partyBalanceDirectionToneClass", () => {
  it("AARISH-style Cr outstanding is emerald, not alarm red", () => {
    const direction = partyBalanceDirection({ direction: "Cr", signed_balance: -6550 });
    expect(direction).toBe("Cr");
    expect(partyBalanceDirectionToneClass(direction)).toContain("text-emerald-600");
    expect(partyBalanceDirectionToneClass(direction)).not.toContain("text-red-600");
  });

  it("Dr outstanding stays red; settled is muted", () => {
    expect(partyBalanceDirectionToneClass("Dr")).toContain("text-red-600");
    expect(partyBalanceDirectionToneClass("Settled")).toContain("text-muted-foreground");
  });
});

describe("Shumama Baireli display fixture", () => {
  it("shows 20,600 Dr from RPC fields", () => {
    const row = { direction: "Dr", signed_balance: 20600 };
    expect(partyBalanceDirection(row)).toBe("Dr");
    expect(partyBalanceDisplayAmount(row.signed_balance)).toBe(20600);
  });
});

describe("matchesPartyBalanceSearch", () => {
  const row = { customer_name: "Shumama Baireli", phone: "+91 98765 43210" };

  it("matches customer name", () => {
    expect(matchesPartyBalanceSearch(row, "shumama")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "baireli")).toBe(true);
  });

  it("matches phone raw or digits-only query", () => {
    expect(matchesPartyBalanceSearch(row, "98765")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "9876543210")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "+91")).toBe(true);
  });

  it("does not match unrelated queries", () => {
    expect(matchesPartyBalanceSearch(row, "unknown party")).toBe(false);
    expect(matchesPartyBalanceSearch(row, "11111")).toBe(false);
  });
});

describe("matchesPartyDirectionFilter", () => {
  it("passes all rows when filter is all", () => {
    expect(matchesPartyDirectionFilter({ signed_balance: 100 }, "all")).toBe(true);
    expect(matchesPartyDirectionFilter({ signed_balance: -100 }, "all")).toBe(true);
    expect(matchesPartyDirectionFilter({ signed_balance: 0 }, "all")).toBe(true);
  });

  it("filters Dr and Cr rows", () => {
    expect(matchesPartyDirectionFilter({ signed_balance: 100 }, "Dr")).toBe(true);
    expect(matchesPartyDirectionFilter({ signed_balance: -100 }, "Dr")).toBe(false);
    expect(matchesPartyDirectionFilter({ signed_balance: -100 }, "Cr")).toBe(true);
    expect(matchesPartyDirectionFilter({ signed_balance: 0 }, "Cr")).toBe(false);
  });
});

describe("filterPartyBalanceRows / settled + search", () => {
  const rows = [
    { customer_name: "Aa Production", phone: "111", signed_balance: 500, direction: "Dr" },
    { customer_name: "Settled Party", phone: "999", signed_balance: 0, direction: "Settled" },
    { customer_name: "Credit Party", phone: "222", signed_balance: -100, direction: "Cr" },
  ];

  it("hides settled when toggle is off and search is empty", () => {
    const filtered = filterPartyBalanceRows(rows, {
      search: "",
      showSettled: false,
      directionFilter: "all",
    });
    expect(filtered.map((r) => r.customer_name)).toEqual(["Aa Production", "Credit Party"]);
  });

  it("finds settled customers by search even when Show settled is off (not a fetch limit)", () => {
    expect(includeSettledInPartyBalanceList(false, "settled")).toBe(true);
    const filtered = filterPartyBalanceRows(rows, {
      search: "Settled Party",
      showSettled: false,
      directionFilter: "all",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].customer_name).toBe("Settled Party");
  });

  it("Dr filter drops parties that canonical enrich flipped to Cr (AARISH)", () => {
    const enriched = [
      { customer_name: "AARISH", signed_balance: -6550, direction: "Cr" },
      { customer_name: "AMINA LAKDAWALA", signed_balance: 1400, direction: "Dr" },
    ];
    expect(
      filterPartyBalanceRows(enriched, {
        search: "",
        showSettled: false,
        directionFilter: "Dr",
      }).map((r) => r.customer_name),
    ).toEqual(["AMINA LAKDAWALA"]);
    expect(
      filterPartyBalanceRows(enriched, {
        search: "",
        showSettled: false,
        directionFilter: "Cr",
      }).map((r) => r.customer_name),
    ).toEqual(["AARISH"]);
  });

  it("settled toggle hides parties that enrich zeroed", () => {
    const enriched = [{ customer_name: "AMJAD", signed_balance: 0, direction: "Settled" }];
    expect(
      filterPartyBalanceRows(enriched, { search: "", showSettled: false, directionFilter: "all" }),
    ).toHaveLength(0);
    expect(
      filterPartyBalanceRows(enriched, { search: "", showSettled: true, directionFilter: "all" }),
    ).toHaveLength(1);
  });
});

describe("client-side pagination helpers", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i + 1);

  it("slices one screen page at a time", () => {
    expect(slicePartyBalancePage(rows, 1)).toHaveLength(CUSTOMER_PARTY_BALANCES_PAGE_SIZE);
    expect(slicePartyBalancePage(rows, 1)[0]).toBe(1);
    expect(slicePartyBalancePage(rows, 2)[0]).toBe(CUSTOMER_PARTY_BALANCES_PAGE_SIZE + 1);
    expect(slicePartyBalancePage(rows, 4)).toHaveLength(120 - CUSTOMER_PARTY_BALANCES_PAGE_SIZE * 3);
  });

  it("computes total pages", () => {
    expect(partyBalanceTotalPages(120)).toBe(4);
    expect(partyBalanceTotalPages(CUSTOMER_PARTY_BALANCES_PAGE_SIZE)).toBe(1);
    expect(partyBalanceTotalPages(CUSTOMER_PARTY_BALANCES_PAGE_SIZE + 1)).toBe(2);
    expect(partyBalanceTotalPages(0)).toBe(1);
  });
});

describe("Customer Balances Outstanding column tone", () => {
  it("shows debit Outstanding only and colors it red, not abs(credit)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../pages/CustomerPartyBalancesPage.tsx"), "utf8");
    expect(src).toContain("partyDebitOutstandingAmount");
    expect(src).toContain("partyBalanceDirectionToneClass(\"Dr\")");
    expect(src).toContain("listAfterCanonical");
    expect(src).not.toContain("fmtAmt(Math.abs(f.outstanding))");
  });
});
