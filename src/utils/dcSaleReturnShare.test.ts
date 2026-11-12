import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDcReturnSplit, fetchReturnsTiedToDcBills, returnsTiedToDcBills, splitDcReturns } from "./dcSaleReturnShare";

describe("dcSaleReturnShare", () => {
  afterEach(() => vi.restoreAllMocks());

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
  });

  it("hides nothing when the lookup fails, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "lte"]) q[m] = () => q;
    q.range = () => Promise.resolve({ data: null, error: { message: "column is_dc_item does not exist" } });
    const split = await fetchDcReturnSplit({ from: () => q }, "org");
    expect(split.allDc.size).toBe(0);
    expect(split.dcShare.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("returns tied to DC bills", () => {
  it("picks returns from a DC bill or redeemed on a DC bill", () => {
    const tied = returnsTiedToDcBills(
      [
        { id: "sr22", original_sale_number: "POS/26-27/100", linked_sale_id: "dc45" },
        { id: "sr21", original_sale_number: "DC/26-27/40", linked_sale_id: null },
        { id: "sr20", original_sale_number: "POS/26-27/101", linked_sale_id: "pos263" },
        { id: "sr19", original_sale_number: null, linked_sale_id: null },
      ],
      new Set(["dc45", "dc40"]),
      new Set(["DC/26-27/45", "DC/26-27/40"]),
    );
    expect([...tied].sort()).toEqual(["sr21", "sr22"]);
  });

  it("looks up the linked and original bills and returns the tied ones", async () => {
    const calls: Array<{ table: string; inCol?: string; inVals?: string[] }> = [];
    const client = {
      from(table: string) {
        const call: { table: string; inCol?: string; inVals?: string[] } = { table };
        calls.push(call);
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "or", "gte", "lte", "order"]) q[m] = () => q;
        q.range = () =>
          Promise.resolve({
            data: [
              { id: "sr22", original_sale_number: "POS/26-27/100", linked_sale_id: "dc45" },
              { id: "sr20", original_sale_number: "POS/26-27/101", linked_sale_id: "pos263" },
            ],
            error: null,
          });
        q.in = (col: string, vals: string[]) => {
          call.inCol = col;
          call.inVals = vals;
          const rows = col === "id" && vals.includes("dc45") ? [{ id: "dc45", sale_number: "DC/26-27/45" }] : [];
          return Promise.resolve({ data: rows, error: null });
        };
        return q;
      },
    };
    const tied = await fetchReturnsTiedToDcBills(client, "org", "2026-11-01", "2026-11-30");
    expect([...tied]).toEqual(["sr22"]);
    expect(calls.map((c) => c.table)).toEqual(["sale_returns", "sales", "sales"]);
    expect(calls[1]).toMatchObject({ inCol: "id", inVals: ["dc45", "pos263"] });
  });

  it("hides nothing when the lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "gte", "lte", "order"]) q[m] = () => q;
    q.range = () => Promise.resolve({ data: null, error: { message: "boom" } });
    expect((await fetchReturnsTiedToDcBills({ from: () => q }, "org")).size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });
});
