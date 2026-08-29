import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  barcodePrintSelectionNavKey,
  clearBarcodePrintSelection,
  consumeBarcodePurchaseItems,
  persistBarcodePrintSelection,
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
