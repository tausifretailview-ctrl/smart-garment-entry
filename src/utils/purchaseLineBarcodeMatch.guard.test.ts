import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const migration = readFileSync(
  join(root, "supabase/migrations/20261208120000_purchase_line_barcode_match_existing_sku.sql"),
  "utf8",
);
const rpcCaller = readFileSync(join(root, "src/pages/PurchaseEntry.tsx"), "utf8");
const fork = readFileSync(join(root, "src/utils/purchaseVariantPriceTierFork.ts"), "utf8");

describe("purchase line barcode must match stocked item (server-side)", () => {
  it("enforces the guard in save_purchase_bill_with_items_atomic, not only PurchaseEntry.tsx", () => {
    expect(rpcCaller).toContain("save_purchase_bill_with_items_atomic");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_purchase_bill_with_items_atomic");
    expect(migration).toContain("line % barcode % differs from stocked item barcode");
    expect(migration).toContain("CREATE TRIGGER trg_purchase_item_match_existing_barcode");
    expect(migration).toContain("resolve_purchase_line_existing_barcode");
    expect(migration).not.toMatch(/app\.bulk_purchase_insert.*RETURN NEW/);
  });

  it("client save resolver rematches an incoming line barcode to the live item", () => {
    expect(fork).toContain("shouldAttachPurchaseLineToExistingBarcode");
    expect(fork).toContain("pickLiveVariantForExistingLineBarcode");
  });
});
