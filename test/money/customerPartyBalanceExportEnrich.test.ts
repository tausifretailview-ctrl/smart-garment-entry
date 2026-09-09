import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrichPartyRowsWithCanonicalBalance,
  PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE,
  PARTY_BALANCE_CANONICAL_ENRICH_MAX,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";

vi.mock("@/utils/customerAuditBundle", () => ({
  fetchCustomerAuditBundle: vi.fn(),
}));

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

describe("enrichPartyRowsWithCanonicalBalance export override", () => {
  afterEach(() => {
    vi.mocked(fetchCustomerAuditBundle).mockReset();
  });

  it("keeps the browse cap at 100 and export batches at 20", () => {
    expect(PARTY_BALANCE_CANONICAL_ENRICH_MAX).toBe(100);
    expect(PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE).toBe(20);
  });

  it("still no-ops above the cap without allowBeyondCap (no audit fetches)", async () => {
    vi.mocked(fetchCustomerAuditBundle).mockRejectedValue(new Error("should not fetch"));
    const rows = Array.from({ length: PARTY_BALANCE_CANONICAL_ENRICH_MAX + 1 }, (_, i) =>
      alignedStub(`c${i}`),
    );
    const out = await enrichPartyRowsWithCanonicalBalance("org", rows);
    expect(out).toBe(rows);
    expect(fetchCustomerAuditBundle).not.toHaveBeenCalled();
  });

  it("allowBeyondCap fetches every row even when the slice is 101 (ELLA-scale export)", async () => {
    vi.mocked(fetchCustomerAuditBundle).mockRejectedValue(new Error("per-row catch"));
    const rows = Array.from({ length: PARTY_BALANCE_CANONICAL_ENRICH_MAX + 1 }, (_, i) =>
      alignedStub(`c${i}`),
    );
    const out = await enrichPartyRowsWithCanonicalBalance("org", rows, { allowBeyondCap: true });
    expect(out).toHaveLength(rows.length);
    expect(fetchCustomerAuditBundle).toHaveBeenCalledTimes(rows.length);
  });

  it("caps concurrent audit fetches at the export batch size", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(fetchCustomerAuditBundle).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      throw new Error("per-row catch");
    });

    const rows = Array.from({ length: 105 }, (_, i) => alignedStub(`c${i}`));
    await enrichPartyRowsWithCanonicalBalance("org", rows, { allowBeyondCap: true });

    expect(fetchCustomerAuditBundle).toHaveBeenCalledTimes(105);
    expect(maxInFlight).toBe(PARTY_BALANCE_CANONICAL_ENRICH_BATCH_SIZE);
    expect(maxInFlight).toBeLessThan(105);
  });
});
