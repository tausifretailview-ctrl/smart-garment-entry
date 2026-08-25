import { describe, expect, it } from "vitest";
import {
  alignPartyRowFromRpc,
  partyBalanceOrgWindowFromRpcRow,
  partyBalanceRowFacets,
} from "@/utils/customerPartyBalanceSnapshot";
import { summarizeAccountFacets } from "@/utils/customerAccountFacets";
import { mapPartyRowsToPaymentPicker } from "@/utils/customerPaymentPickerList";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";

/**
 * Phase 1 step 3 — org totals / exports / dashboards + payment picker migration.
 * Batch 1 surfaces read post-fix C-PARTY via aligned facet derivation (no enricher).
 * Batch 2: payment picker + Floating Payments headline agree with C-JS netPosition.
 */

const FARHAAN_SIGNED = -100;
const SHUMAMA_SIGNED = 158_700;

function partyRow(
  partial: Partial<CustomerPartyBalanceRpcRow> & Pick<CustomerPartyBalanceRpcRow, "customer_id" | "signed_balance">,
): CustomerPartyBalanceRpcRow {
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

describe("Step 3 batch 1 — org cards / exports / dashboards use aligned C-PARTY facets", () => {
  const farhaan = alignPartyRowFromRpc(
    partyRow({
      customer_id: "farhaan",
      customer_name: "Farhaan Fab",
      signed_balance: FARHAAN_SIGNED,
    }),
    "7977353244",
  );
  const shumama = alignPartyRowFromRpc(
    partyRow({
      customer_id: "shumama",
      customer_name: "Shumama Baireli",
      signed_balance: SHUMAMA_SIGNED,
    }),
    "",
  );

  it("Farhaan contributes Cr to credit pool, not Dr outstanding (C02 org cards)", () => {
    const f = partyBalanceRowFacets(farhaan);
    expect(f.netPosition).toBe(FARHAAN_SIGNED);
    expect(f.outstanding).toBe(FARHAAN_SIGNED);
    const totals = summarizeAccountFacets([f, partyBalanceRowFacets(shumama)]);
    expect(totals.totalOutstandingDr).toBe(SHUMAMA_SIGNED);
    expect(totals.totalCreditPoolCr).toBe(100);
    expect(totals.netReceivable).toBe(SHUMAMA_SIGNED + FARHAAN_SIGNED);
  });

  it("export row facets match aligned party row (C03/C04 path)", () => {
    const exportFacet = partyBalanceRowFacets(shumama);
    expect(exportFacet.outstanding).toBe(SHUMAMA_SIGNED);
    expect(exportFacet.netPosition).toBe(SHUMAMA_SIGNED);
    expect(exportFacet.unusedAdvance).toBe(0);
  });

  it("dashboard org window reads net_receivable from party RPC row (C12/C13)", () => {
    const window = partyBalanceOrgWindowFromRpcRow({
      customer_id: "window",
      customer_name: "",
      signed_balance: 0,
      advance_available: 0,
      direction: "",
      net_position: 0,
      total_dr: 0,
      total_cr: 0,
      net_receivable: SHUMAMA_SIGNED + FARHAAN_SIGNED,
    });
    expect(window.netReceivable).toBe(SHUMAMA_SIGNED + FARHAAN_SIGNED);
  });
});

describe("Step 3 batch 2 — payment picker agrees with C-JS netPosition", () => {
  it("Farhaan (Cr) is excluded; debtor net_position is the picker amount (C17)", () => {
    const rows = mapPartyRowsToPaymentPicker(
      [
        alignPartyRowFromRpc(
          partyRow({
            customer_id: "ff",
            customer_name: "Farhaan Fab",
            signed_balance: FARHAAN_SIGNED,
          }),
          "",
        ),
        alignPartyRowFromRpc(
          partyRow({
            customer_id: "sh",
            customer_name: "Shumama Baireli",
            signed_balance: SHUMAMA_SIGNED,
          }),
          "",
        ),
      ],
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("sh");
    expect(rows[0]!.outstandingBalance).toBe(SHUMAMA_SIGNED);
  });
});
