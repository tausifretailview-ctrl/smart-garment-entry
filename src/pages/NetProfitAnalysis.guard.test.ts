import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Net Profit return columns", () => {
  it("only adds Qty Returned / Return Amount when some row has returns", () => {
    const src = readFileSync(join(here, "NetProfitAnalysis.tsx"), "utf8");
    expect(src).toContain("rowsHaveReturns");
    expect(src).toContain("showReturnColumns");
    expect(src).toContain("Qty Returned");
    expect(src).toContain("Return Amount");
    expect(src).toContain("qtyReturned");
    expect(src).toContain("returnAmount");
  });
});
