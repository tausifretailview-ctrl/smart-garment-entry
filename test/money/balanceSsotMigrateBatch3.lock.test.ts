import { describe, expect, it } from "vitest";
import { partyDebtorNetFromRpcRow } from "@/utils/customerAccountFacets";
import { customersForLedgerExport } from "@/utils/customerLedgerListFromPartyBalances";
import type { CustomerLedgerListRow } from "@/utils/customerLedgerListFromPartyBalances";

/**
 * Phase 1 step 3 batch 3 — ledger exports, Khata FIFO gate, remaining surfaces.
 */

const FARHAAN_SIGNED = -100;
const SHUMAMA_SIGNED = 158_700;

function listRow(
  partial: Partial<CustomerLedgerListRow> & Pick<CustomerLedgerListRow, "id" | "customer_name" | "balance">,
): CustomerLedgerListRow {
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

describe("Step 3 batch 3 — ledger export source (C06/C07)", () => {
  it("export uses enriched slice when filter narrows within enrich cap", () => {
    const filtered = [listRow({ id: "ff", customer_name: "Farhaan Fab", balance: -2800 })];
    const enriched = [listRow({ id: "ff", customer_name: "Farhaan Fab", balance: FARHAAN_SIGNED })];
    const out = customersForLedgerExport(filtered, enriched, true);
    expect(out[0]!.balance).toBe(FARHAAN_SIGNED);
  });

  it("export uses aligned party seed when filter exceeds enrich cap", () => {
    const filtered = [listRow({ id: "sh", customer_name: "Shumama Baireli", balance: SHUMAMA_SIGNED })];
    const out = customersForLedgerExport(filtered, undefined, false);
    expect(out).toBe(filtered);
    expect(out[0]!.balance).toBe(SHUMAMA_SIGNED);
  });
});

describe("Step 3 batch 3 — Khata FIFO ledger net gate (C48)", () => {
  it("credit customers contribute 0 Dr to the FIFO ledger-net comparison", () => {
    expect(partyDebtorNetFromRpcRow({ signed_balance: FARHAAN_SIGNED })).toBe(0);
  });

  it("debtor party net passes through for FIFO gate", () => {
    expect(partyDebtorNetFromRpcRow({ signed_balance: SHUMAMA_SIGNED })).toBe(SHUMAMA_SIGNED);
  });
});
