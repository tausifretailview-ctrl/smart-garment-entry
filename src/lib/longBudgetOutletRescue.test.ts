import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLongBudgetOutletEntryPath,
  LONG_BUDGET_OUTLET_ENTRY_PATHS,
  LONG_BUDGET_STUCK_RESCUE_MS,
  shouldArmLongBudgetStuckRescue,
  shouldFireLongBudgetStuckRescue,
  workspaceHasCommittedEntryUi,
} from "./tabCacheReadiness";
import { watchdogCoverageForDestination } from "./layoutCrossingAudit";

const here = dirname(fileURLToPath(import.meta.url));

describe("6s long-budget rescue — must not fire early", () => {
  it("uses a 6000ms floor, not 1200 or 4000", () => {
    expect(LONG_BUDGET_STUCK_RESCUE_MS).toBe(6000);
    expect(LONG_BUDGET_STUCK_RESCUE_MS).toBeGreaterThan(4000);
  });

  it.each([1200, 3999, 4000, 5999])(
    "does not remount at %sms while still loading (slow-but-working)",
    (elapsedMs) => {
      expect(
        shouldFireLongBudgetStuckRescue({
          contentReady: false,
          alreadyRescuedThisPath: false,
          elapsedMs,
        }),
      ).toBe(false);
    },
  );

  it("remounts at 6000ms only if still not ready", () => {
    expect(
      shouldFireLongBudgetStuckRescue({
        contentReady: false,
        alreadyRescuedThisPath: false,
        elapsedMs: 6000,
      }),
    ).toBe(true);
  });

  it("does not remount at 6000ms if the page committed in time", () => {
    expect(
      shouldFireLongBudgetStuckRescue({
        contentReady: true,
        alreadyRescuedThisPath: false,
        elapsedMs: 6000,
      }),
    ).toBe(false);
  });

  it("does not remount twice for the same path", () => {
    expect(
      shouldFireLongBudgetStuckRescue({
        contentReady: false,
        alreadyRescuedThisPath: true,
        elapsedMs: 12_000,
      }),
    ).toBe(false);
  });

  it("arms on long-budget landings even when leftover DOM looks painted", () => {
    expect(shouldArmLongBudgetStuckRescue({ usesLongLoadBudget: true })).toBe(true);
    expect(shouldArmLongBudgetStuckRescue({ usesLongLoadBudget: false })).toBe(false);
  });
});

describe("each of the 7 Outlet entry pages", () => {
  it.each([...LONG_BUDGET_OUTLET_ENTRY_PATHS])(
    "%s is a long-budget Outlet path with 6s rescue and no 1.2s/4s",
    (path) => {
      expect(isLongBudgetOutletEntryPath(path)).toBe(true);
      const cov = watchdogCoverageForDestination(path);
      expect(cov.blankFrame12s).toBe(false);
      expect(cov.outletRescue4s).toBe(false);
      expect(cov.longBudgetOutletRemount6s).toBe(true);
    },
  );

  it("OrgLayout skips 1.2s/4s on long budget and remounts Outlet at 6s", () => {
    const src = readFileSync(join(here, "../components/OrgLayout.tsx"), "utf8");
    expect(src).toMatch(/if \(usesLongLoadBudget \|\| forceOutletFallback\) return;/);
    expect(src).toMatch(/shouldArmOutletFallbackTimer/);
    expect(src).toMatch(/isLongBudgetOutletEntryPath\(resolvedCurrentPath\)/);
    expect(src).toMatch(/LONG_BUDGET_STUCK_RESCUE_MS/);
    expect(src).toMatch(/<Outlet key=\{outletRescueKey\}/);
    expect(src).not.toMatch(/setForceOutletFallback\(true\).*LONG_BUDGET/);
  });
});

describe("workspaceHasCommittedEntryUi", () => {
  it("treats a load shell alone as not committed", () => {
    const el = {
      querySelector: (sel: string) =>
        sel.includes("data-ezzy-load-shell") ? ({} as Element) : null,
      textContent: "Loading bill screen…",
    } as unknown as HTMLElement;
    expect(workspaceHasCommittedEntryUi(el)).toBe(false);
  });

  it("treats inputs as committed entry UI", () => {
    const el = {
      querySelector: (sel: string) =>
        sel.includes("input") ? ({} as Element) : null,
      textContent: "POS",
    } as unknown as HTMLElement;
    expect(workspaceHasCommittedEntryUi(el)).toBe(true);
  });
});
