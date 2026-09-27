import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPurchaseEditBaselineHeader,
  hasPurchaseEntryDraftInBrowser,
  isDocumentReload,
  isPurchaseEditSnapshotUnchanged,
  purchaseEntrySessionKey,
  shouldAllowPurchaseEntryReRestore,
  summarizePurchaseDraft,
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

describe("shouldAllowPurchaseEntryReRestore", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorageMock());
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows first restore when work not yet restored", () => {
    expect(shouldAllowPurchaseEntryReRestore(false, 0, ORG, USER)).toBe(true);
    expect(shouldAllowPurchaseEntryReRestore(false, 5, ORG, USER)).toBe(true);
  });

  it("blocks when work restored and lines still in memory", () => {
    expect(shouldAllowPurchaseEntryReRestore(true, 3, ORG, USER)).toBe(false);
  });

  it("allows re-restore when lines empty and browser draft exists", () => {
    writePurchaseEntrySnapshot(ORG, USER, {
      lineItems: [{ qty: 1, product_id: "p1" }],
      billData: { supplier_id: "", supplier_name: "", supplier_invoice_no: "" },
    });
    expect(shouldAllowPurchaseEntryReRestore(true, 0, ORG, USER)).toBe(true);
  });

  it("allows forced re-restore when lines empty even without browser draft meta", () => {
    expect(shouldAllowPurchaseEntryReRestore(true, 0, ORG, USER, { force: true })).toBe(true);
  });

  it("blocks re-restore when lines empty and no draft in browser", () => {
    expect(shouldAllowPurchaseEntryReRestore(true, 0, ORG, USER)).toBe(false);
  });
});

describe("isPurchaseEditSnapshotUnchanged", () => {
  const line = {
    temp_id: "row-1",
    product_id: "p1",
    sku_id: "v1",
    product_name: "SHIRT",
    size: "M",
    qty: 2,
    pur_price: 100,
    sale_price: 150,
    mrp: 199,
    gst_per: 5,
    barcode: "123",
    discount_percent: 0,
    line_total: 200,
  };
  const header = {
    billData: { supplier_id: "s1", supplier_name: "ABC", supplier_invoice_no: "INV-1" },
    softwareBillNo: "PUR/1",
    billDate: "2026-09-20T00:00:00.000Z",
    roundOff: 0,
    otherCharges: 0,
    discountAmount: 0,
    isDcPurchase: false,
  };
  const viewed = () => ({
    ...header,
    lineItems: [{ ...line }],
    originalLineItems: [{ ...line }],
    isEditMode: true,
    editingBillId: "bill-1",
    originalHeader: buildPurchaseEditBaselineHeader(header),
  });

  it("treats a saved bill opened only to view as not a draft", () => {
    expect(isPurchaseEditSnapshotUnchanged(viewed())).toBe(true);
    expect(summarizePurchaseDraft(viewed())).toBeNull();
  });

  it("keeps the draft when a product is added", () => {
    const s = viewed();
    s.lineItems.push({ ...line, temp_id: "new", size: "L" });
    expect(isPurchaseEditSnapshotUnchanged(s)).toBe(false);
    expect(summarizePurchaseDraft(s)?.lineCount).toBe(2);
  });

  it("keeps the draft when qty, price or header changes", () => {
    const qty = viewed();
    qty.lineItems[0].qty = 3;
    expect(isPurchaseEditSnapshotUnchanged(qty)).toBe(false);
    const price = viewed();
    price.lineItems[0].pur_price = 90;
    expect(isPurchaseEditSnapshotUnchanged(price)).toBe(false);
    const hdr = viewed();
    hdr.billData = { ...hdr.billData, supplier_invoice_no: "INV-2" };
    expect(isPurchaseEditSnapshotUnchanged(hdr)).toBe(false);
  });

  it("ignores derived fields like line_total", () => {
    const s = viewed();
    s.lineItems[0].line_total = 199.999;
    expect(isPurchaseEditSnapshotUnchanged(s)).toBe(true);
  });

  it("never hides new-bill drafts or old drafts without a baseline", () => {
    const newBill = { ...viewed(), isEditMode: false, editingBillId: null };
    expect(isPurchaseEditSnapshotUnchanged(newBill)).toBe(false);
    const legacy = { ...viewed(), originalHeader: undefined };
    expect(isPurchaseEditSnapshotUnchanged(legacy)).toBe(false);
  });
});
