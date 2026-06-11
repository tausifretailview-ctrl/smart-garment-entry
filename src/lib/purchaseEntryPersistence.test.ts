import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPurchaseEntryDraftInBrowser,
  isDocumentReload,
  purchaseEntrySessionKey,
  writePurchaseEntrySnapshot,
} from "./purchaseEntryPersistence";

const ORG = "org-test";
const USER = "user-test";

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

describe("isDocumentReload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for navigation type reload", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    expect(isDocumentReload()).toBe(true);
  });

  it("returns false for navigate type", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as PerformanceNavigationTiming,
    ]);
    expect(isDocumentReload()).toBe(false);
  });

  it("returns false when navigation entries are empty", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    expect(isDocumentReload()).toBe(false);
  });
});

describe("hasPurchaseEntryDraftInBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorageMock());
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when draft meta exists in sessionStorage", () => {
    sessionStorage.setItem(
      `purchaseEntryDraftMeta:${ORG}:${USER}`,
      JSON.stringify({ lineCount: 3, totalQty: 5, savedAt: Date.now(), fullDataInIdb: false }),
    );
    expect(hasPurchaseEntryDraftInBrowser(ORG, USER)).toBe(true);
  });

  it("returns true when inline snapshot has line items", () => {
    writePurchaseEntrySnapshot(ORG, USER, {
      lineItems: [{ qty: 1, product_id: "p1" }],
      billData: { supplier_id: "", supplier_name: "", supplier_invoice_no: "" },
    });
    expect(hasPurchaseEntryDraftInBrowser(ORG, USER)).toBe(true);
  });

  it("returns false when no draft is stored", () => {
    expect(hasPurchaseEntryDraftInBrowser(ORG, USER)).toBe(false);
    expect(sessionStorage.getItem(purchaseEntrySessionKey(ORG, USER))).toBeNull();
  });
});
