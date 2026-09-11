import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const migration = readFileSync(
  join(root, "supabase/migrations/20261216120000_purchase_bill_total_qty_exclude_deleted.sql"),
  "utf8",
);
const entry = readFileSync(join(root, "src/pages/PurchaseEntry.tsx"), "utf8");

describe("purchase_bills.total_qty matches active lines", () => {
  it("sums only deleted_at IS NULL and backfills drifted headers", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_qty");
    expect(migration).toContain("AND pi.deleted_at IS NULL");
    expect(migration).toContain("UPDATE public.purchase_bills pb");
    expect(migration).toContain("app.bulk_purchase_insert");
  });

  it("PurchaseEntry uses line-count-aware incomplete check, not qty-only", () => {
    expect(entry).toContain("isPurchaseBillLoadIncomplete");
    expect(entry).toContain("headerLineCount");
  });
});
