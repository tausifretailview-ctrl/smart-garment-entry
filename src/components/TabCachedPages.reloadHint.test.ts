import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tab loading shell recovery", () => {
  const src = readFileSync("src/components/TabCachedPages.tsx", "utf8");
  it("offers a Reload app button with the slow-network hint", () => {
    expect(src).toContain("Reload app");
    expect(src).toContain("onClick={() => void reloadAppWithUpdateCheck()}");
  });
  it("checks for a newer deploy once the soft hint shows, guarded once per build", () => {
    expect(src).toContain("newerServerEntryScript()");
    expect(src).toContain("claimNewerBuildReload(serverEntry)");
  });
});
