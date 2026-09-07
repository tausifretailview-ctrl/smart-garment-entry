import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPurchaseDraftSkuGuard,
  mergePurchaseDraftExcludeSkuIds,
} from "./purchaseDraftSkuGuard";

const here = dirname(fileURLToPath(import.meta.url));

describe("mergePurchaseDraftExcludeSkuIds", () => {
  it("unions line sku ids with in-flight generated ids", () => {
    expect(
      mergePurchaseDraftExcludeSkuIds(
        ["size-4-existing", "", null],
        ["size-5-generated"],
      ).sort(),
    ).toEqual(["size-4-existing", "size-5-generated"]);
  });
});

describe("createPurchaseDraftSkuGuard", () => {
  it("keeps size-grid SKUs excluded before React lineItems flushes (KS Footwear line 2)", () => {
    const guard = createPurchaseDraftSkuGuard();
    const lineItemsRefSkuIds = ["size-4-existing"];
    guard.add("size-4-existing");

    // Size 5 fork — same tick as size 6 recycle, state not flushed yet.
    guard.add("6135aa1e-3813-4b52-a561-52539524c942");

    const exclude = guard.exclude(lineItemsRefSkuIds);
    expect(exclude).toContain("6135aa1e-3813-4b52-a561-52539524c942");
    expect(exclude).toContain("size-4-existing");

    guard.remove("6135aa1e-3813-4b52-a561-52539524c942");
    expect(guard.exclude(lineItemsRefSkuIds)).not.toContain(
      "6135aa1e-3813-4b52-a561-52539524c942",
    );
  });
});

describe("purchase entry recycle wiring", () => {
  it("excludes in-flight draft SKUs when recycling orphans", () => {
    const page = readFileSync(resolve(here, "../pages/PurchaseEntry.tsx"), "utf8");
    expect(page).toContain("createPurchaseDraftSkuGuard");
    expect(page).toContain("draftSkuGuardRef");
    expect(page).toContain("restoreRecycledPurchaseDraftSkus");
  });
});
