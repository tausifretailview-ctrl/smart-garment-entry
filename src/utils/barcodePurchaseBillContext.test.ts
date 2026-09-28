import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  barcodePrintSelectionNavKey,
  clearBarcodePrintSelection,
  consumeBarcodePurchaseItems,
  isBarcodePrintingPathname,
  persistBarcodePrintSelection,
  purchaseBillIdForBarcodeBack,
  shouldContinueBarcodePurchaseHydrate,
  queueBarcodePurchaseItems,
  readBarcodePrintSelection,
  stashPurchaseBarcodePrintPayload,
} from "./barcodePurchaseBillContext";

const billId = "550e8400-e29b-41d4-a716-446655440000";

function createStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", createStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("purchaseBillIdForBarcodeBack", () => {
  it("uses the bill this print page was opened from", () => {
    expect(
      purchaseBillIdForBarcodeBack({
        queryBillId: billId,
        navBillId: "other",
      }),
    ).toBe(billId);
  });

  it("has no explicit bill when the page was not opened from one", () => {
    expect(purchaseBillIdForBarcodeBack({ queryBillId: "  ", navBillId: null })).toBeNull();
  });
});

describe("shouldContinueBarcodePurchaseHydrate", () => {
  it("recognises the barcode printing route with an org slug", () => {
    expect(isBarcodePrintingPathname("/demo/barcode-printing")).toBe(true);
    expect(isBarcodePrintingPathname("/demo/purchase-entry")).toBe(false);
  });

  it("stops a late hydrate after Back has opened the purchase bill", () => {
    expect(
      shouldContinueBarcodePurchaseHydrate({
        pathname: "/demo/purchase-entry",
        userLeftForPurchaseBill: true,
      }),
    ).toBe(false);
    expect(
      shouldContinueBarcodePurchaseHydrate({
        pathname: "/demo/barcode-printing",
        userLeftForPurchaseBill: true,
      }),
    ).toBe(false);
  });

  it("still hydrates while the user is on barcode printing", () => {
    expect(
      shouldContinueBarcodePurchaseHydrate({
        pathname: "/demo/barcode-printing",
        userLeftForPurchaseBill: false,
      }),
    ).toBe(true);
  });

  it("does not replace the route once purchase entry is open", () => {
    expect(
      shouldContinueBarcodePurchaseHydrate({
        pathname: "/demo/purchase-entry",
        userLeftForPurchaseBill: false,
      }),
    ).toBe(false);
  });
});

describe("barcode print selection persistence", () => {
  it("builds a stable nav key from bill id and item count", () => {
    const items = [{ sku_id: "sku-a" }, { sku_id: "sku-b" }];
    expect(barcodePrintSelectionNavKey(billId, items)).toBe(
      `selection|${billId}|2|sku-a`,
    );
  });

  it("persists and reads a subset for the same bill", () => {
    const subset = [{ sku_id: "sku-a", qty: 1 }, { sku_id: "sku-b", qty: 1 }];
    persistBarcodePrintSelection(billId, subset);
    expect(readBarcodePrintSelection(billId)).toEqual(subset);
    expect(readBarcodePrintSelection("other-bill")).toBeNull();
  });

  it("clears persisted selection for one bill", () => {
    persistBarcodePrintSelection(billId, [{ sku_id: "sku-a" }]);
    clearBarcodePrintSelection(billId);
    expect(readBarcodePrintSelection(billId)).toBeNull();
  });

  it("consumes queued items when nav key changed but bill id matches", () => {
    const subset = [{ sku_id: "sku-l" }, { sku_id: "sku-xl" }, { sku_id: "sku-xxl" }];
    queueBarcodePurchaseItems({
      navKey: `${"abc"}|${billId}|3|sku-l`,
      billId,
      items: subset,
    });
    const taken = consumeBarcodePurchaseItems(`query|${billId}|def`, billId);
    expect(taken?.items).toEqual(subset);
    expect(consumeBarcodePurchaseItems(`query|${billId}|def`, billId)).toBeNull();
  });

  it("stashes selection so persist survives a cleared router state", () => {
    const subset = [{ sku_id: "sku-l", qty: 1 }];
    stashPurchaseBarcodePrintPayload(billId, subset);
    expect(readBarcodePrintSelection(billId)).toEqual(subset);
  });
});
