import { describe, expect, it } from "vitest";
import {
  buildPurchaseSaveFingerprint,
  shouldReuseCommittedPurchaseCreate,
} from "./purchaseSaveIdempotency";

describe("buildPurchaseSaveFingerprint", () => {
  it("is stable for the same bill content", () => {
    const a = buildPurchaseSaveFingerprint({
      supplierId: "sup-1",
      supplierName: "Acme",
      billDate: "2026-07-18",
      supplierInvoiceNo: "INV-9",
      netAmount: 1000.4,
      totalQty: 12.5,
      lineCount: 3,
    });
    const b = buildPurchaseSaveFingerprint({
      supplierId: "sup-1",
      supplierName: "acme",
      billDate: "2026-07-18",
      supplierInvoiceNo: "inv-9",
      netAmount: 1000.4,
      totalQty: 12.5,
      lineCount: 3,
    });
    expect(a).toBe(b);
  });

  it("changes when quantity changes", () => {
    const base = {
      supplierId: "sup-1",
      supplierName: "Acme",
      billDate: "2026-07-18",
      supplierInvoiceNo: "INV-9",
      netAmount: 1000,
      totalQty: 10,
      lineCount: 2,
    };
    expect(buildPurchaseSaveFingerprint(base)).not.toBe(
      buildPurchaseSaveFingerprint({ ...base, totalQty: 20 }),
    );
  });
});

describe("shouldReuseCommittedPurchaseCreate", () => {
  const prior = {
    fingerprint: "fp-1",
    supplierInvoiceNo: "INV-1",
    savedAt: 1_000_000,
  };

  it("reuses when fingerprint matches within window", () => {
    expect(
      shouldReuseCommittedPurchaseCreate(
        prior,
        { fingerprint: "fp-1", supplierInvoiceNo: "OTHER" },
        1_000_000 + 60_000,
      ),
    ).toBe(true);
  });

  it("reuses when supplier invoice matches within window", () => {
    expect(
      shouldReuseCommittedPurchaseCreate(
        prior,
        { fingerprint: "fp-other", supplierInvoiceNo: "INV-1" },
        1_000_000 + 60_000,
      ),
    ).toBe(true);
  });

  it("does not reuse after max age", () => {
    expect(
      shouldReuseCommittedPurchaseCreate(
        prior,
        { fingerprint: "fp-1", supplierInvoiceNo: "INV-1" },
        1_000_000 + 31 * 60 * 1000,
      ),
    ).toBe(false);
  });

  it("does not reuse unrelated bills", () => {
    expect(
      shouldReuseCommittedPurchaseCreate(
        prior,
        { fingerprint: "fp-2", supplierInvoiceNo: "INV-2" },
        1_000_000 + 60_000,
      ),
    ).toBe(false);
  });
});
