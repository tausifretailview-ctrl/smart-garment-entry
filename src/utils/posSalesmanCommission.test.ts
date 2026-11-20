import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({ calls: [] as unknown[][], fail: null as unknown }));
vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn() }));
vi.mock("@/utils/syncSaleCommissions", () => ({
  syncSaleCommissions: async (...args: unknown[]) => {
    sync.calls.push(args);
    if (sync.fail) throw sync.fail;
    return { bills: 1, rows: 1, paidKept: 0, noSalesmanBills: 0, noSalesmanAmount: 0 };
  },
}));

import { logError } from "@/lib/errorLogger";
import { recordPosSalesmanCommission, recordSaleCommission } from "@/utils/posSalesmanCommission";

describe("recordSaleCommission / recordPosSalesmanCommission", () => {
  beforeEach(() => {
    sync.calls = [];
    sync.fail = null;
    vi.mocked(logError).mockClear();
  });

  it("rebuilds the saved bill's rows, with the staff and rules POS already has", async () => {
    const employees = [{ id: "e1" }];
    await recordPosSalesmanCommission({ organizationId: "org-1", saleId: "s1", salesmanName: "", employees, rules: [] });
    expect(sync.calls).toEqual([["org-1", ["s1"], { employees, rules: [] }]]);
  });

  it("Sale Bill: staff and rules read by the sync itself", async () => {
    await recordSaleCommission({ organizationId: "org-1", saleId: "s2" });
    expect(sync.calls).toEqual([["org-1", ["s2"], { employees: undefined, rules: undefined }]]);
  });

  it("never throws; a failure is logged", async () => {
    sync.fail = { message: "denied" };
    await expect(recordSaleCommission({ organizationId: "org-1", saleId: "s1" })).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
