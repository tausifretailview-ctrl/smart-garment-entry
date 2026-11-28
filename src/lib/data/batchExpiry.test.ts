import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchLinesForSave,
  expiredStockGate,
  expiryNotice,
  fetchExpiryReport,
  getExpiryStatus,
  readExpirySettings,
  resetExpiryStateForTests,
  setPurchaseLineBatches,
  writeOffExpiredLot,
  type BatchExpiryDb,
} from "./batchExpiry";

function fakeDb(handler: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db: BatchExpiryDb = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(handler(fn, args));
    },
  };
  return { db, calls };
}

beforeEach(() => resetExpiryStateForTests());

describe("expiry settings", () => {
  it("is off until batch & expiry is switched on; then warns by default", () => {
    expect(readExpirySettings(null)).toEqual({ trackOnPurchase: false, action: "off" });
    expect(readExpirySettings({ purchase_settings: { track_batch_expiry: true } })).toEqual({ trackOnPurchase: true, action: "warn" });
    expect(
      readExpirySettings({ purchase_settings: { track_batch_expiry: true }, sale_settings: { expired_stock_action: "block" } }).action,
    ).toBe("block");
    expect(readExpirySettings({ sale_settings: { expired_stock_action: "nonsense" } }).action).toBe("off");
  });
});

describe("purchase lines", () => {
  it("a new bill sends only lines with a batch or expiry; barcode only when there is no item id", () => {
    const out = batchLinesForSave([
      { sku_id: "v1", barcode: "111", batch_no: " B7 ", expiry_date: "2026-12-31" },
      { sku_id: "v2", barcode: "222" },
      { sku_id: "", barcode: "333", expiry_date: "2027-01-05" },
    ]);
    expect(out).toEqual([
      { sku_id: "v1", barcode: null, batch_no: "B7", expiry_date: "2026-12-31", mfg_date: null },
      { sku_id: null, barcode: "333", batch_no: null, expiry_date: "2027-01-05", mfg_date: null },
    ]);
  });

  it("an edited bill that had dates sends every line, so cleared boxes clear", () => {
    const out = batchLinesForSave([{ sku_id: "v1", batch_no: "", expiry_date: "" }], true);
    expect(out).toEqual([{ sku_id: "v1", barcode: null, batch_no: null, expiry_date: null, mfg_date: null }]);
    expect(batchLinesForSave([{ sku_id: "v1" }], false)).toEqual([]);
  });

  it("nothing to save → no call; missing SQL → tells the user to run SQL 74", async () => {
    const { db, calls } = fakeDb(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    await setPurchaseLineBatches(db, "o1", "b1", [{ sku_id: "v1" }]);
    expect(calls).toHaveLength(0);
    await expect(setPurchaseLineBatches(db, "o1", "b1", [{ sku_id: "v1", expiry_date: "2026-12-01" }])).rejects.toThrow(/SQL 74/);
    expect(calls[0].fn).toBe("set_purchase_line_batches");
    expect(calls[0].args).toMatchObject({ p_organization_id: "o1", p_bill_id: "b1" });
  });
});

describe("report and write-off", () => {
  it("report is null before SQL 74 and numbers come back as numbers", async () => {
    const missing = fakeDb(() => ({ data: null, error: { code: "PGRST202" } }));
    expect(await fetchExpiryReport(missing.db, "o1", 30)).toBeNull();
    const ok = fakeDb(() => ({
      data: [{ variant_id: "v1", purchase_bill_id: "b1", days_left: "-2", lot_qty: "4", unit_cost: "52.5", cost_value: "210" }],
      error: null,
    }));
    const rows = await fetchExpiryReport(ok.db, "o1", 7);
    expect(rows?.[0]).toMatchObject({ days_left: -2, lot_qty: 4, unit_cost: 52.5, cost_value: 210 });
  });

  it("write-off sends the lot and a note with batch, expiry and bill", async () => {
    const { db, calls } = fakeDb(() => ({ data: { doc_number: "WST-1", total_qty: 4, total_cost: 210 }, error: null }));
    const res = await writeOffExpiredLot(db, "o1", {
      purchase_bill_id: "b1",
      variant_id: "v1",
      batch_no: "B7",
      expiry_date: "2026-11-26",
      bill_number: "PUR/1",
    });
    expect(res).toEqual({ docNumber: "WST-1", totalQty: 4, totalCost: 210 });
    expect(calls[0]).toEqual({
      fn: "write_off_expired_lot",
      args: { p_organization_id: "o1", p_bill_id: "b1", p_variant_id: "v1", p_quantity: null, p_notes: "Batch B7 · exp 26/11/2026 · PUR/1" },
    });
  });
});

describe("billing check", () => {
  const today = "2026-11-28";

  it("notice only when the stock that sells next has expired", () => {
    expect(expiryNotice({ nextLotExpiry: "2026-11-27", earliestExpiry: "2026-11-27" }, today, "MILK")).toEqual({
      expired: true,
      message: "MILK: the stock that sells next expired on 27/11/2026.",
    });
    expect(expiryNotice({ nextLotExpiry: today, earliestExpiry: today }, today, "MILK")).toBeNull();
    expect(expiryNotice({ nextLotExpiry: null, earliestExpiry: null }, today, "MILK")).toBeNull();
  });

  it("status is cached per item", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ next_lot_expiry: "2026-11-27", earliest_expiry: "2026-11-27" }], error: null }));
    await getExpiryStatus(db, "o1", "v1", 1000);
    await getExpiryStatus(db, "o1", "v1", 2000);
    expect(calls).toHaveLength(1);
    await getExpiryStatus(db, "o1", "v1", 1000 + 6 * 60 * 1000);
    expect(calls).toHaveLength(2);
  });

  it("off reads nothing; block refuses expired stock; warn adds and warns once", async () => {
    const expired = () => ({ data: [{ next_lot_expiry: "2026-11-20", earliest_expiry: "2026-11-20" }], error: null });
    const notify = vi.fn();
    const off = fakeDb(expired);
    expect(
      await expiredStockGate({ db: off.db, orgId: "o1", settings: {}, variantId: "v1", productName: "MILK", todayYmd: today, notify }),
    ).toBe(true);
    expect(off.calls).toHaveLength(0);

    const block = fakeDb(expired);
    const blockSettings = { purchase_settings: { track_batch_expiry: true }, sale_settings: { expired_stock_action: "block" } };
    expect(
      await expiredStockGate({ db: block.db, orgId: "o1", settings: blockSettings, variantId: "v1", productName: "MILK", todayYmd: today, notify }),
    ).toBe(false);
    expect(notify).toHaveBeenCalledWith("block", expect.stringContaining("expired on 20/11/2026"));

    resetExpiryStateForTests();
    notify.mockClear();
    const warn = fakeDb(expired);
    const warnSettings = { purchase_settings: { track_batch_expiry: true } };
    const args = { db: warn.db, orgId: "o1", settings: warnSettings, variantId: "v1", productName: "MILK", todayYmd: today, notify, now: 5000 };
    expect(await expiredStockGate(args)).toBe(true);
    expect(await expiredStockGate({ ...args, now: 6000 })).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("warn", expect.stringContaining("MILK"));
  });

  it("a failing check never stops the sale", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { code: "PGRST202" } }));
    const notify = vi.fn();
    const settings = { purchase_settings: { track_batch_expiry: true }, sale_settings: { expired_stock_action: "block" } };
    expect(await expiredStockGate({ db, orgId: "o1", settings, variantId: "v1", productName: "X", todayYmd: today, notify })).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });
});
