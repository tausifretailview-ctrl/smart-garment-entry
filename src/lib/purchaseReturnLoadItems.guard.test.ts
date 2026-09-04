/**
 * Live purchase_items has no discount_percent / discount_amount.
 * Nested PostgREST embed aliases as purchase_items_1 — selecting missing
 * columns surfaces: "column purchase_items_1.discount_percent does not exist".
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = "src/pages/PurchaseReturnEntry.tsx";

describe("Purchase Return Load Items vs purchase_items columns", () => {
  const src = readFileSync(join(root, PAGE), "utf8");

  it("does not select discount_percent or discount_amount on nested purchase_items", () => {
    expect(src).not.toMatch(
      /purchase_items\([^)]*discount_percent/,
    );
    expect(src).not.toMatch(
      /purchase_items\([^)]*discount_amount/,
    );
  });

  it("still embeds purchase_items line_total for Load Items", () => {
    expect(src).toMatch(/purchase_items\([^)]*line_total/);
  });

  it("loads the supplier picker via paginated fetchAllSuppliers, not select(*)", () => {
    expect(src).toContain("fetchAllSuppliers");
    expect(src).not.toMatch(/\.from\("suppliers"\)[\s\S]{0,200}select\("\*"\)/);
    expect(src).not.toMatch(/\.from\("suppliers"\)/);
  });
});
