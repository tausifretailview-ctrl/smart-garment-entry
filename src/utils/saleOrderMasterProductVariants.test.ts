import { describe, expect, it } from "vitest";
import { buildMasterOnlySaleOrderVariants } from "./saleOrderMasterProductVariants";

const defaults = { pur_price: 1000, sale_price: 1080, mrp: 1200 };

describe("buildMasterOnlySaleOrderVariants", () => {
  it("creates one variant per checked size when no color is entered", () => {
    const rows = buildMasterOnlySaleOrderVariants({
      colors: [],
      selectedSizes: ["6", "7", "8", "9", "10"],
      groupSizes: ["6", "7", "8", "9", "10"],
      existing: [],
      defaults,
    });

    expect(rows.map((row) => row.size)).toEqual(["6", "7", "8", "9", "10"]);
    expect(rows.every((row) => row.color === "" && row.active && row.opening_qty === 0)).toBe(true);
    expect(rows[0]).toMatchObject({ pur_price: 1000, sale_price: 1080, mrp: 1200, barcode: "" });
  });

  it("crosses colors with the checked sizes", () => {
    const rows = buildMasterOnlySaleOrderVariants({
      colors: ["BLACK", "TAN"],
      selectedSizes: ["6", "7"],
      groupSizes: ["6", "7", "8"],
      existing: [],
      defaults,
    });

    expect(rows.map((row) => `${row.color}/${row.size}`)).toEqual([
      "BLACK/6",
      "BLACK/7",
      "TAN/6",
      "TAN/7",
    ]);
  });

  it("keeps an edited barcode and price for a size that is still checked", () => {
    const rows = buildMasterOnlySaleOrderVariants({
      colors: [],
      selectedSizes: ["6", "7"],
      groupSizes: ["6", "7", "8"],
      existing: [
        {
          color: "",
          size: "6",
          pur_price: 900,
          sale_price: 1100,
          mrp: 1300,
          barcode: "501",
          barcode_source: "external",
          active: true,
          opening_qty: 0,
        },
      ],
      defaults,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ size: "6", barcode: "501", sale_price: 1100 });
    expect(rows[1]).toMatchObject({ size: "7", barcode: "", sale_price: 1080 });
  });

  it("returns nothing when every size in the group is unchecked", () => {
    const rows = buildMasterOnlySaleOrderVariants({
      colors: [],
      selectedSizes: [],
      groupSizes: ["6", "7"],
      existing: [
        {
          color: "",
          size: "6",
          pur_price: 1,
          sale_price: 2,
          mrp: 3,
          barcode: "1",
          active: true,
          opening_qty: 0,
        },
      ],
      defaults,
    });

    expect(rows).toEqual([]);
  });
});
