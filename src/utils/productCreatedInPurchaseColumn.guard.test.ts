import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

describe("Purchase Entry created_in_purchase inserts", () => {
  it("retries product inserts without the pending column", () => {
    const page = readFileSync(join(root, "src/pages/PurchaseEntry.tsx"), "utf8");
    const dialog = readFileSync(join(root, "src/components/ProductEntryDialog.tsx"), "utf8");
    const fork = readFileSync(join(root, "src/utils/purchaseVariantPriceTierFork.ts"), "utf8");
    expect(page).toContain("insertProductsPreferringPurchaseFlag");
    expect(dialog).toContain("insertProductsPreferringPurchaseFlag");
    expect(fork).toContain("insertProductsPreferringPurchaseFlag");
  });
});
