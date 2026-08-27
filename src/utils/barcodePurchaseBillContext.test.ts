import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  barcodePrintSelectionNavKey,
  clearBarcodePrintSelection,
  persistBarcodePrintSelection,
  readBarcodePrintSelection,
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
});
