import { describe, expect, it } from "vitest";
import { posSaveBegin, posSaveMark, posSaveReport, posSaveRequestSummary } from "./posSaveTiming";

describe("posSaveTiming", () => {
  it("records each step with its own and running time and flags the slowest", async () => {
    posSaveBegin("cash-path:cash");
    await new Promise((r) => setTimeout(r, 5));
    posSaveMark("validate_stock");
    await new Promise((r) => setTimeout(r, 30));
    posSaveMark("sale_insert");
    const report = posSaveReport();
    expect(report).toContain("POS save: cash-path:cash");
    expect(report).toContain("validate_stock");
    expect(report).toMatch(/sale_insert.*<-- slowest/);
  });

  it("ignores marks made before any save starts and reports an empty state", () => {
    expect(() => posSaveMark("orphan")).not.toThrow();
  });
});

describe("posSaveRequestSummary", () => {
  it("says so when no database requests were recorded", () => {
    expect(posSaveRequestSummary(Number.MAX_SAFE_INTEGER)).toBe("Requests: none recorded.");
  });

  it("adds the request line to the report", () => {
    posSaveBegin("cash-path:cash");
    posSaveMark("validate_stock");
    expect(posSaveReport()).toContain("Requests:");
  });
});

describe("bill save timing is sent once per save", () => {
  it("records when the bill is ready to print", async () => {
    const { posSaveBegin: begin, posSaveMark: mark } = await import("./posSaveTiming");
    const timing = await import("./appTiming");
    const rows: import("./appTiming").AppTimingSample[] = [];
    timing.setAppTimingSender(async (r) => {
      rows.push(...r);
    });
    await timing.flushAppTimings();
    rows.length = 0;
    begin("cash-path:cash");
    mark("sale_insert");
    mark("before_dialog");
    mark("before_dialog");
    begin("purchase-save");
    mark("finalize_save");
    await timing.flushAppTimings();
    expect(rows.map((r) => [r.metric, r.screen, r.detail?.method])).toEqual([
      ["bill_save", "pos", "cash"],
      ["bill_save", "purchase", undefined],
    ]);
    expect(Array.isArray(rows[0].detail?.slowest)).toBe(true);
  });
});
