import { describe, expect, it } from "vitest";
import { compareMrpBackfillRowSets } from "@/utils/fixMissingMrpEquivalence";

const ORG = "00000000-0000-4000-8000-000000000001";

describe("compareMrpBackfillRowSets", () => {
  it("passes when loop and RPC row sets match exactly", () => {
    const rows = [
      { purchaseItemId: "a", currentMrp: 0, targetMrp: 1500 },
      { purchaseItemId: "b", currentMrp: null, targetMrp: 2200 },
    ];
    const report = compareMrpBackfillRowSets(rows, rows, [], ORG);
    expect(report.passed).toBe(true);
    expect(report.loopRowCount).toBe(2);
    expect(report.rpcRowCount).toBe(2);
  });

  it("passes when loop-only rows are explained by cross-org SKUs", () => {
    const loopRows = [
      { purchaseItemId: "same", currentMrp: 0, targetMrp: 100 },
      { purchaseItemId: "cross", currentMrp: null, targetMrp: 200 },
    ];
    const rpcRows = [{ purchaseItemId: "same", currentMrp: 0, targetMrp: 100 }];
    const crossOrgRows = [
      {
        purchaseItemId: "cross",
        billOrgId: ORG,
        variantOrgId: "00000000-0000-4000-8000-000000000099",
        currentMrp: null,
        targetMrp: 200,
      },
    ];

    const report = compareMrpBackfillRowSets(loopRows, rpcRows, crossOrgRows, ORG);
    expect(report.passed).toBe(true);
    expect(report.crossOrgRowCount).toBe(1);
    expect(report.summary).toContain("cross-org");
  });

  it("fails on target_mrp mismatch for the same purchase_item id", () => {
    const loopRows = [{ purchaseItemId: "x", currentMrp: 0, targetMrp: 100 }];
    const rpcRows = [{ purchaseItemId: "x", currentMrp: 0, targetMrp: 101 }];
    const report = compareMrpBackfillRowSets(loopRows, rpcRows, [], ORG);
    expect(report.passed).toBe(false);
    expect(report.valueMismatches).toHaveLength(1);
  });

  it("fails when RPC-only rows exist", () => {
    const loopRows: Array<{ purchaseItemId: string; currentMrp: number | null; targetMrp: number }> = [];
    const rpcRows = [{ purchaseItemId: "rpc-only", currentMrp: 0, targetMrp: 50 }];
    const report = compareMrpBackfillRowSets(loopRows, rpcRows, [], ORG);
    expect(report.passed).toBe(false);
    expect(report.rpcOnlyRows).toHaveLength(1);
  });

  it("fails when loop-only rows are not cross-org", () => {
    const loopRows = [{ purchaseItemId: "orphan", currentMrp: 0, targetMrp: 75 }];
    const report = compareMrpBackfillRowSets(loopRows, [], [], ORG);
    expect(report.passed).toBe(false);
    expect(report.summary).toContain("loop-only");
  });
});
