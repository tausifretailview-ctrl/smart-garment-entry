import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Index profit cards", () => {
  it("labels stored-net vs NPA-net and reads profit from get_net_profit_kpis", () => {
    const src = readFileSync(join(here, "Index.tsx"), "utf8");
    expect(src).toContain("STORED_NET_CAPTION");
    expect(src).toContain("NPA_NET_PROFIT_CAPTION");
    expect(src).toContain("fetchNetProfitKpis");
    expect(src).not.toMatch(/displayedDashStats\?\.gross_profit/);
  });
});
