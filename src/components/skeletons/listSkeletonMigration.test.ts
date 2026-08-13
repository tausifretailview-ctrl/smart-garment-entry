import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Repo root, derived from this file's own location.
 *
 * This was previously hardcoded to "/workspace" -- the Cloud Agent container root --
 * so these three suites could only ever pass inside that container and failed with
 * ENOENT on every other checkout. Deriving it from import.meta.url makes the suite
 * runnable anywhere and does not depend on the working directory vitest was started from.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** LIST-bucket files migrated in PR #234 — skeletons must gate on isLoading, never isFetching. */
const LIST_MIGRATED_FILES = [
  "src/pages/QuotationDashboard.tsx",
  "src/pages/PurchaseOrderDashboard.tsx",
  "src/pages/DeliveryChallanDashboard.tsx",
  "src/pages/SaleOrderDashboard.tsx",
  "src/pages/RecycleBin.tsx",
  "src/pages/WhatsAppLogs.tsx",
  "src/pages/OrganizationManagement.tsx",
  "src/pages/SalesmanCommission.tsx",
  "src/pages/CustomerAccountPage.tsx",
  "src/pages/CustomerPartyBalancesPage.tsx",
  "src/pages/StockSettlement.tsx",
  "src/pages/portal/PortalOrders.tsx",
  "src/pages/portal/PortalInvoices.tsx",
  "src/pages/portal/PortalCatalogue.tsx",
  "src/pages/portal/PortalAccount.tsx",
  "src/pages/school/TeacherMaster.tsx",
  "src/pages/school/FeeHeadsSetup.tsx",
  "src/pages/school/FeeCollection.tsx",
  "src/pages/school/AcademicYearSetup.tsx",
  "src/pages/school/ClassSectionSetup.tsx",
  "src/pages/school/StudentPromotion.tsx",
] as const;

function extractSkeletonGates(source: string): string[] {
  const gates: string[] = [];
  // Ternary → List*Skeleton, allowing JSX wrappers (TableRow/TableCell/div) between.
  const re =
    /(\w+)\s*\?\s*\([\s\S]{0,280}?<List(?:Page|Table)Skeleton/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    gates.push(m[1]);
  }
  // Early-return full-page shells (org gate) — ok without isLoading
  if (
    /return\s+(?:\([\s\n]*<ListPageSkeleton|<\s*ListPageSkeleton)/.test(source)
  ) {
    gates.push("__early_return_ListPageSkeleton__");
  }
  return gates;
}

describe("LIST skeleton migration — stale-data / isLoading-only rule", () => {
  it("every migrated file imports a List skeleton", () => {
    for (const rel of LIST_MIGRATED_FILES) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src, rel).toMatch(/List(?:Page|Table)Skeleton/);
    }
  });

  it("skeleton ternaries gate on isLoading / *Loading / loading — never isFetching", () => {
    const allowed = new Set([
      "isLoading",
      "loading",
      "membersLoading",
      "rulesLoading",
      "commissionsLoading",
      "studentsLoading",
      "collectedLoading",
      "ledgerProfileLoading",
      "__early_return_ListPageSkeleton__",
    ]);

    for (const rel of LIST_MIGRATED_FILES) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      const gates = extractSkeletonGates(src);
      expect(gates.length, `${rel} should render a List skeleton`).toBeGreaterThan(0);
      for (const gate of gates) {
        expect(allowed.has(gate), `${rel} gates skeleton on "${gate}"`).toBe(true);
        expect(gate).not.toBe("isFetching");
      }
    }
  });

  it("ListPageSkeleton table region keeps fixed min-height (no layout jump)", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/components/skeletons/ListPageSkeleton.tsx"),
      "utf8",
    );
    expect(src).toContain("min-h-[260px]");
  });
});
