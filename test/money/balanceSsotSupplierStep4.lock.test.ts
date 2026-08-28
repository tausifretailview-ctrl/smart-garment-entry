import { describe, expect, it } from "vitest";
import { computeSnapshotForSupplier, summarizeSupplierOrgWindowFromSnapshots } from "@/utils/supplierBalanceUtils";

const SANGAMN = "supplier-sangamn";
const SANGAMN_BALANCE = 154_648;

function sangamnSnap() {
  return computeSnapshotForSupplier(
    SANGAMN,
    0,
    [
      {
        id: "bill-1656",
        supplier_id: SANGAMN,
        net_amount: 250000,
        paid_amount: 100000,
        software_bill_no: "1656",
        supplier_invoice_no: "1656",
      },
      {
        id: "bill-1658",
        supplier_id: SANGAMN,
        net_amount: 245669,
        paid_amount: 110328,
        software_bill_no: "1658",
        supplier_invoice_no: "1658",
      },
    ],
    [
      { reference_id: SANGAMN, total_amount: 100000, description: "Payment at purchase" },
      { reference_id: SANGAMN, total_amount: 110328, description: "Payment at purchase" },
    ],
    [
      { id: "cn-pr-3", reference_id: SANGAMN, total_amount: 60328 },
      { id: "cn-pr-11", reference_id: SANGAMN, total_amount: 70365 },
    ],
    [
      {
        supplier_id: SANGAMN,
        net_amount: 60328,
        credit_note_id: null,
        credit_status: "adjusted_outstanding",
        linked_bill_id: null,
        credit_available_balance: null,
      },
      {
        supplier_id: SANGAMN,
        net_amount: 70365,
        credit_note_id: "cn-pr-11",
        credit_status: "adjusted_outstanding",
        linked_bill_id: null,
        credit_available_balance: null,
      },
    ],
    0,
  );
}

describe("Step 4 — supplier org window from S-JS (S11/S12/S13)", () => {
  it("SANGAMN-only org window net payable equals ₹1,54,648", () => {
    const snap = sangamnSnap();
    expect(snap.balance).toBe(SANGAMN_BALANCE);

    const window = summarizeSupplierOrgWindowFromSnapshots(
      new Map([[SANGAMN, snap]]),
    );
    expect(window.totalPayableCr).toBe(SANGAMN_BALANCE);
    expect(window.netPayable).toBe(SANGAMN_BALANCE);
    expect(window.payableSupplierCount).toBe(1);
    expect(window.totalAdvanceDr).toBe(0);
  });

  it("S-ORG double-count fixture net (−₹55,680) is not the org window figure", () => {
    const window = summarizeSupplierOrgWindowFromSnapshots(
      new Map([[SANGAMN, sangamnSnap()]]),
    );
    expect(window.netPayable).not.toBe(-55_680);
    expect(window.totalPayableCr).not.toBe(0);
  });
});
