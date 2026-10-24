import { describe, expect, it } from "vitest";
import {
  allDcDocumentIds,
  isAllDcDocument,
  isMissingDcColumnError,
  saleReturnAmountsWithoutDc,
  withoutDcLines,
} from "./gstDcExclusion";

describe("gstDcExclusion", () => {
  it("treats a bill as all-DC only when it has lines and every line is DC", () => {
    expect(isAllDcDocument([])).toBe(false);
    expect(isAllDcDocument(undefined)).toBe(false);
    expect(isAllDcDocument([{ is_dc_item: true }, { is_dc_item: true }])).toBe(true);
    expect(isAllDcDocument([{ is_dc_item: true }, { is_dc_item: false }])).toBe(false);
    expect(isAllDcDocument([{ is_dc_item: null }])).toBe(false);
  });

  it("drops only DC lines", () => {
    const lines = [
      { id: 1, is_dc_item: true },
      { id: 2, is_dc_item: false },
      { id: 3 },
    ];
    expect(withoutDcLines(lines).map((l) => l.id)).toEqual([2, 3]);
  });

  it("finds the bills whose lines are all DC", () => {
    const ids = allDcDocumentIds(
      [
        { sale_id: "a", is_dc_item: true },
        { sale_id: "a", is_dc_item: true },
        { sale_id: "b", is_dc_item: true },
        { sale_id: "b", is_dc_item: false },
        { sale_id: "c", is_dc_item: false },
      ],
      "sale_id",
    );
    expect([...ids]).toEqual(["a"]);
  });

  it("keeps a return with no DC lines unchanged", () => {
    expect(
      saleReturnAmountsWithoutDc({ net_amount: 1050, gst_amount: 50 }, [
        { line_total: 1050, gst_percent: 5, is_dc_item: false },
      ]),
    ).toEqual({ net_amount: 1050, gst_amount: 50 });
  });

  it("leaves out a return of only DC lines", () => {
    expect(
      saleReturnAmountsWithoutDc({ net_amount: 500, gst_amount: 0 }, [
        { line_total: 500, gst_percent: 0, is_dc_item: true },
      ]),
    ).toBeNull();
  });

  it("takes the DC share out of a mixed return", () => {
    // 1050 GST line (5%, GST 50) + 500 DC line (0%)
    expect(
      saleReturnAmountsWithoutDc({ net_amount: 1550, gst_amount: 50 }, [
        { line_total: 1050, gst_percent: 5, is_dc_item: false },
        { line_total: 500, gst_percent: 0, is_dc_item: true },
      ]),
    ).toEqual({ net_amount: 1050, gst_amount: 50 });
  });

  it("recognises the missing-column error before the SQL is run", () => {
    expect(isMissingDcColumnError({ code: "42703", message: "column sale_return_items.is_dc_item does not exist" })).toBe(true);
    expect(isMissingDcColumnError({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissingDcColumnError(null)).toBe(false);
  });
});
