import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = readFileSync(resolve(here, "./DiscountSchemeDashboard.tsx"), "utf8");

describe("DiscountSchemeDashboard merge safety", () => {
  it("has no leftover conflict markers or branch-name lines", () => {
    expect(dashboard).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
    expect(dashboard).not.toContain("fix/purchase-sold-qty-import");
    expect(dashboard.split("\n").some((line) => line.trim() === "main")).toBe(false);
  });
});
