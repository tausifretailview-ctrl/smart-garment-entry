import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("OwnerDashboard last-fetched badge", () => {
  it("does not claim Synced without a fetch timestamp", () => {
    const dash = readFileSync(join(here, "OwnerDashboard.tsx"), "utf8");
    expect(dash).toContain("formatLastFetchedLabel");
    expect(dash).toContain("dataUpdatedAt");
    expect(dash).not.toMatch(/isRefreshing \? "Syncing" : "Synced"/);
  });

  it("labels stored-net vs NPA-net and does not mix margin bases", () => {
    const dash = readFileSync(join(here, "OwnerDashboard.tsx"), "utf8");
    expect(dash).toContain("STORED_NET_CAPTION");
    expect(dash).toContain("NPA_NET_PROFIT_CAPTION");
    expect(dash).toContain("fetchNetProfitKpis");
    expect(dash).not.toMatch(/dashStats\?\.gross_profit/);
    expect(dash).not.toMatch(/grossProfit \/ totalSales/);
  });
});
