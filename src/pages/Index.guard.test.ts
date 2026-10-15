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

describe("Index hide figures toggle", () => {
  it("defaults to shown, remembers the choice per device and masks cards + charts", () => {
    const src = readFileSync(join(here, "Index.tsx"), "utf8");
    expect(src).toContain('localStorage.getItem(DASHBOARD_HIDE_FIGURES_KEY) === "1"');
    expect(src).toContain("DashboardFiguresHiddenContext.Provider value={figuresHidden}");
    expect(src).toMatch(/figuresHidden && "pointer-events-none select-none blur-md"/);
    const card = readFileSync(join(here, "../components/dashboard/DashboardMetricCard.tsx"), "utf8");
    expect(card).toContain("useContext(DashboardFiguresHiddenContext)");
    expect(card).toContain("HIDDEN_FIGURE_MASK");
  });
});
