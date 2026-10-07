import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, "../InvoiceWrapper.tsx"), "utf8");

const templates = [
  "RetailPosThermalReceipt80mm.tsx",
  "ThermalPrint80mm.tsx",
  "ModernThermalReceipt80mm.tsx",
  "ThermalReceiptCompact.tsx",
  "TvsThermalReceipt80mm.tsx",
  "NewDesignThermalReceipt80mm.tsx",
  "KidsThermalReceipt80mm.tsx",
  "KidsCampThermalReceipt80mm.tsx",
  "VastrakalaThermalReceipt80mm.tsx",
];

describe("thermal receipts share Trendzo settlement fields", () => {
  it("normalizes grand, paid, refund, and tender once for every thermal", () => {
    expect(wrapper).toContain("normalizeThermalReceiptMoney");
    for (const name of ["cashPaid", "upiPaid", "cardPaid", "creditPaid", "paidAmount", "refundCash", "grandTotal"]) {
      expect(wrapper).toContain(`${name}={thermalMoney.${name}}`);
    }
    expect(wrapper).toContain("previousBalance={props.previousBalance ?? 0}");
    expect(wrapper).toContain("unusedAdvance={props.unusedAdvance ?? 0}");
  });

  it.each(templates)("%s prints refund, Prev Bal, and Advance", (file) => {
    const tsx = readFileSync(join(here, "..", file), "utf8");
    expect(tsx).toContain("ThermalPartyLines");
    expect(tsx).toContain("refundCash");
    expect(tsx).toContain("previousBalance");
    expect(tsx).toContain("unusedAdvance");
  });
});
