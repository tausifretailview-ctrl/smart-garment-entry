import { describe, expect, it, vi } from "vitest";
import { facetsFromInvoiceOutstanding } from "./customerAccountFacets";
import { alignPartyRowFromRpc, PARTY_BALANCE_CANONICAL_ENRICH_MAX } from "./customerPartyBalanceSnapshot";
import {
  applyAlignedPartyToLedgerListRow,
  buildCustomerLedgerListFromPartyBalances,
  customersForLedgerExport,
  enrichLedgerListRowsWithCanonicalBalance,
  ledgerListRowToAlignedParty,
  partyLedgerListMoneyFields,
  type CustomerLedgerListRow,
} from "./customerLedgerListFromPartyBalances";

vi.mock("@/utils/fetchAllRows", () => ({
  fetchAllCustomers: vi.fn(),
  fetchAllCustomerPartyBalances: vi.fn(),
}));

import {
  fetchAllCustomers,
  fetchAllCustomerPartyBalances,
} from "@/utils/fetchAllRows";

describe("buildCustomerLedgerListFromPartyBalances", () => {
  it("returns searchable customer rows when party RPC times out", async () => {
    vi.mocked(fetchAllCustomers).mockResolvedValue([
      {
        id: "c1",
        customer_name: "NIXC FOOTWEAR",
        phone: "9999999999",
        email: null,
        gst_number: null,
        address: null,
        opening_balance: 500,
        points_balance: null,
        discount_percent: null,
      },
    ]);
    vi.mocked(fetchAllCustomerPartyBalances).mockRejectedValue({
      code: "57014",
      message: "canceling statement due to statement timeout",
    });

    const rows = await buildCustomerLedgerListFromPartyBalances("org-ks");
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_name).toBe("NIXC FOOTWEAR");
    expect(rows[0].balance).toBe(500);
  });
});

describe("partyLedgerListMoneyFields", () => {
  it("does not copy org window total_dr/total_cr onto the row", () => {
    const money = partyLedgerListMoneyFields(
      {
        customer_id: "a",
        customer_name: "Aa Production",
        signed_balance: 8000,
        advance_available: 0,
        direction: "Dr",
        net_position: 8000,
        total_dr: 3_226_922,
        total_cr: 1_822_504,
        net_receivable: 1_404_418,
      },
      "",
    );
    expect(money.totalSales).toBe(0);
    expect(money.totalPaid).toBe(0);
    expect(money.balance).toBe(8000);
    expect(money.unusedAdvanceTotal).toBe(0);
  });

  it("uses canonical lifetime totals when enriched on the aligned row", () => {
    const money = partyLedgerListMoneyFields(
      alignPartyRowFromRpc(
        {
          customer_id: "sh",
          customer_name: "Shumama Baireli",
          signed_balance: 158_700,
          advance_available: 0,
          direction: "Dr",
          net_position: 158_700,
          total_dr: 0,
          total_cr: 0,
          net_receivable: 0,
        },
        "",
      ),
      "",
    );
    expect(money.totalSales).toBe(0);
    const enriched = {
      ...alignPartyRowFromRpc(
        {
          customer_id: "sh",
          customer_name: "Shumama Baireli",
          signed_balance: 158_700,
          advance_available: 0,
          direction: "Dr",
          net_position: 158_700,
          total_dr: 0,
          total_cr: 0,
          net_receivable: 0,
        },
        "",
      ),
      lifetime_total_sales: 420_000,
      lifetime_total_paid: 261_300,
    };
    const withLifetime = partyLedgerListMoneyFields(enriched, "");
    expect(withLifetime.totalSales).toBe(420_000);
    expect(withLifetime.totalPaid).toBe(261_300);
    expect(withLifetime.totalCashPaid).toBe(261_300);
    expect(withLifetime.balance).toBe(158_700);
  });
});

function listRow(partial: Partial<CustomerLedgerListRow> & Pick<CustomerLedgerListRow, "id" | "customer_name" | "balance">): CustomerLedgerListRow {
  return {
    phone: null,
    email: null,
    address: null,
    opening_balance: 0,
    totalSales: 0,
    totalPaid: 0,
    unusedAdvanceTotal: 0,
    totalCashPaid: 0,
    totalAdvanceApplied: 0,
    totalCnApplied: 0,
    adjustmentTotal: 0,
    ...partial,
  };
}

describe("ledger list ↔ party row adapters", () => {
  it("recovers signed credit from ledger gross outstanding", () => {
    const aligned = ledgerListRowToAlignedParty(
      listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -2800 }),
    );
    expect(aligned.customer_id).toBe("ff");
    expect(aligned.signed_balance).toBe(-2800);
    expect(aligned.gross_outstanding).toBe(-2800);
  });

  it("applies canonical signed_balance without duplicating enrich math", () => {
    const row = listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -2800 });
    const canonical = alignPartyRowFromRpc(
      {
        customer_id: "ff",
        customer_name: "Farhaan Fab",
        signed_balance: -100,
        advance_available: 0,
        direction: "Cr",
        net_position: -100,
        total_dr: 0,
        total_cr: 0,
        net_receivable: 0,
      },
      "",
    );
    const patched = applyAlignedPartyToLedgerListRow(row, canonical);
    expect(patched.balance).toBe(-100);
    expect(patched.unusedAdvanceTotal).toBe(0);
    expect(facetsFromInvoiceOutstanding(patched.balance, patched.unusedAdvanceTotal).netPosition).toBe(-100);
  });

  it("returns the same rows when the slice exceeds the enrich cap", async () => {
    const rows = Array.from({ length: PARTY_BALANCE_CANONICAL_ENRICH_MAX + 1 }, (_, i) =>
      listRow({ id: `c${i}`, customer_name: `C${i}`, balance: 50 }),
    );
    const out = await enrichLedgerListRowsWithCanonicalBalance("org", rows);
    expect(out).toHaveLength(rows.length);
    expect(out[0].balance).toBe(50);
  });
});

describe("customersForLedgerExport", () => {
  it("prefers enriched filtered rows when the subset is within the enrich cap", () => {
    const filtered = [listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -2800 })];
    const enriched = [listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -100 })];
    expect(customersForLedgerExport(filtered, enriched, true)).toEqual(enriched);
  });

  it("falls back to filtered aligned rows when enrich is off or above cap", () => {
    const filtered = [listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -100 })];
    expect(customersForLedgerExport(filtered, undefined, false)).toBe(filtered);
    expect(customersForLedgerExport(filtered, undefined, true)).toBe(filtered);
  });
});

