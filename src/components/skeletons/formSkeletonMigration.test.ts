import { readFileSync } from "node:fs";
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

/** FORM-bucket files — skeletons must gate on isLoading / loading / *Loading, never isFetching. */
const FORM_MIGRATED_FILES = [
  "src/pages/BulkProductUpdate.tsx",
  "src/pages/Profile.tsx",
  "src/pages/school/StudentEntry.tsx",
  "src/pages/school/FeeStructureSetup.tsx",
  "src/pages/SaleReturnEntry.tsx",
  "src/pages/PurchaseReturnEntry.tsx",
  "src/pages/Settings.tsx",
] as const;

describe("FORM skeleton migration", () => {
  it("every migrated file imports FormPageSkeleton", () => {
    for (const rel of FORM_MIGRATED_FILES) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src, rel).toMatch(/FormPageSkeleton/);
    }
  });

  it("does not gate FormPageSkeleton on isFetching", () => {
    for (const rel of FORM_MIGRATED_FILES) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src, rel).not.toMatch(/isFetching\s*\?\s*[\s\S]{0,200}<FormPageSkeleton/);
    }
  });

  it("FormPageSkeleton keeps field-group min-height", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/components/skeletons/FormPageSkeleton.tsx"),
      "utf8",
    );
    expect(src).toContain("min-h-[140px]");
  });
});
