import { describe, expect, it } from "vitest";
import { dcReturnNotInList, fetchDcReturnSplit, splitDcReturns } from "./dcSaleReturnShare";

describe("dcSaleReturnShare", () => {
  it("splits all-DC and mixed returns", () => {
    const split = splitDcReturns([
      { return_id: "a", line_total: 500, is_dc_item: true },
      { return_id: "b", line_total: 250, is_dc_item: true },
      { return_id: "b", line_total: 750, is_dc_item: false },
      { return_id: "c", line_total: 100, is_dc_item: null },
    ]);
    expect([...split.allDc]).toEqual(["a"]);
    expect(split.dcShare.get("b")).toBe(0.25);
    expect(split.dcShare.has("c")).toBe(false);
    expect(dcReturnNotInList(split)).toBe("(a)");
  });

  it("hides nothing when the lookup fails", async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "lte"]) q[m] = () => q;
    q.range = () => Promise.resolve({ data: null, error: { message: "column is_dc_item does not exist" } });
    const split = await fetchDcReturnSplit({ from: () => q }, "org");
    expect(split.allDc.size).toBe(0);
    expect(dcReturnNotInList(split)).toBeNull();
  });
});
