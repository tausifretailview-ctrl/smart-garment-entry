import { describe, expect, it } from "vitest";
import {
  enrichPartyRowsWithCanonicalBalance,
  PARTY_BALANCE_CANONICAL_ENRICH_MAX,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import { mapPartyRowsToPaymentPicker } from "@/utils/customerPaymentPickerList";
import { alignPartyRowFromRpc } from "@/utils/customerPartyBalanceSnapshot";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";
import { computeSnapshotForSupplier } from "@/utils/supplierBalanceUtils";

/**
 * Phase 0 SSOT inventory locks. Do not "fix" these by changing production
 * behaviour in this PR — they document the gap. Phase 1 needs sign-off.
 * Inventory: docs/balance-single-source-of-truth-inventory-2026-08.md
 */

const FARHAAN_PARTY_SIGNED = -100;
const FARHAAN_CANONICAL_SIGNED = -100;
const SHUMAMA_SHAPE_PARTY_DR = 158700;
const SANGAMN_BALANCE = 154648;

function partyRow(partial: Partial<CustomerPartyBalanceRpcRow> & Pick<CustomerPartyBalanceRpcRow, "customer_id" | "signed_balance">): CustomerPartyBalanceRpcRow {
  return {
    customer_name: partial.customer_name ?? "X",
    advance_available: partial.advance_available ?? 0,
    direction: partial.direction ?? "",
    net_position: partial.net_position ?? partial.signed_balance,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
    ...partial,
  };
}

function alignedStub(id: string): CustomerPartyBalanceAlignedRow {
  return {
    customer_id: id,
    customer_name: id,
    signed_balance: 1,
    advance_available: 0,
    direction: "Dr",
    net_position: 1,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
    phone: "",
    gross_outstanding: 1,
    cn_available: 0,
  };
}

describe("Phase 0 balance SSOT inventory locks", () => {
  it("enricher cap stays 100 — above it, party SQL is shown unpatched", () => {
    expect(PARTY_BALANCE_CANONICAL_ENRICH_MAX).toBe(100);
  });

  it("enricher no-ops without fetching when the slice exceeds the cap", async () => {
    const rows = Array.from({ length: PARTY_BALANCE_CANONICAL_ENRICH_MAX + 1 }, (_, i) =>
      alignedStub(`c${i}`),
    );
    const out = await enrichPartyRowsWithCanonicalBalance("org", rows);
    expect(out).toBe(rows);
  });

  it("payment picker uses aligned net_position (step 3 — post-fix C-PARTY)", () => {
    const farhaanAligned = alignPartyRowFromRpc(
      partyRow({
        customer_id: "ff",
        customer_name: "Farhaan Fab",
        signed_balance: FARHAAN_PARTY_SIGNED,
      }),
      "7977353244",
    );
    const farhaanCredit = mapPartyRowsToPaymentPicker([farhaanAligned], new Map());
    expect(farhaanCredit).toHaveLength(0);

    const shumamaAligned = alignPartyRowFromRpc(
      partyRow({
        customer_id: "sh",
        customer_name: "Shumama-shape",
        signed_balance: SHUMAMA_SHAPE_PARTY_DR,
      }),
      "",
    );
    const farhaanShapeDebtor = mapPartyRowsToPaymentPicker([shumamaAligned], new Map());
    expect(farhaanShapeDebtor).toHaveLength(1);
    expect(farhaanShapeDebtor[0]!.outstandingBalance).toBe(SHUMAMA_SHAPE_PARTY_DR);
  });

  it("SANGAMN FASHION snapshot stays Rs 1,54,648 Cr (S-JS)", () => {
    const snap = computeSnapshotForSupplier(
      "supplier-sangamn",
      0,
      [
        {
          id: "bill-1656",
          supplier_id: "supplier-sangamn",
          net_amount: 250000,
          paid_amount: 100000,
          software_bill_no: "1656",
          supplier_invoice_no: "1656",
        },
        {
          id: "bill-1658",
          supplier_id: "supplier-sangamn",
          net_amount: 245669,
          paid_amount: 110328,
          software_bill_no: "1658",
          supplier_invoice_no: "1658",
        },
      ],
      [
        { reference_id: "supplier-sangamn", total_amount: 100000, description: "Payment at purchase" },
        { reference_id: "supplier-sangamn", total_amount: 110328, description: "Payment at purchase" },
      ],
      [
        { id: "cn-pr-3", reference_id: "supplier-sangamn", total_amount: 60328 },
        { id: "cn-pr-11", reference_id: "supplier-sangamn", total_amount: 70365 },
      ],
      [
        {
          supplier_id: "supplier-sangamn",
          net_amount: 60328,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
        {
          supplier_id: "supplier-sangamn",
          net_amount: 70365,
          credit_note_id: "cn-pr-11",
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
      ],
      0,
    );
    expect(snap.balance).toBe(SANGAMN_BALANCE);
  });
});
