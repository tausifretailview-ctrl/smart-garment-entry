import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "PosDeliveryChallan.tsx"), "utf8");

describe("POS DC header actions", () => {
  it("stores header callbacks instead of running them when the page opens", () => {
    expect(src).toContain("setOnNewChallan(() => dc.resetChallan)");
    expect(src).toContain("setOnClearCart(() => dc.resetChallan)");
    expect(src).toContain("setOnReprintLast(() => dc.handleReprintLast)");
    expect(src).not.toMatch(/setOnReprintLast\(dc\.handleReprintLast\)/);
    expect(src).not.toMatch(/setOnNewChallan\(dc\.resetChallan\)/);
    expect(src).not.toMatch(/setOnClearCart\(dc\.resetChallan\)/);
  });
});
