import { describe, expect, it } from "vitest";
import {
  emptyGodownForm,
  formatGodownQty,
  godownFormOf,
  godownFormProblem,
  godownItemLabel,
  godownStockExcelRows,
  godownTypeInfo,
  isMissingGodownSql,
  sortGodowns,
  type Godown,
} from "./godowns";

const g = (over: Partial<Godown>): Godown => ({
  id: "g",
  organization_id: "o",
  name: "Godown",
  code: null,
  godown_type: "godown",
  address: null,
  pincode: null,
  contact_name: null,
  contact_phone: null,
  supplier_id: null,
  notes: null,
  is_active: true,
  sort_order: 1,
  created_at: null,
  ...over,
});

describe("godowns (Phase 3 step 3a)", () => {
  it("lists Main first, then open godowns in order, closed ones last", () => {
    const list = sortGodowns([
      g({ id: "c", name: "Old store", is_active: false, sort_order: 1 }),
      g({ id: "b", name: "Vasai", godown_type: "job_work", sort_order: 3 }),
      g({ id: "m", name: "Main", godown_type: "main", sort_order: 0 }),
      g({ id: "a", name: "Bhiwandi", sort_order: 2 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["m", "a", "b", "c"]);
  });

  it("checks the form as the database does", () => {
    const others = [g({ id: "a", name: "Bhiwandi" })];
    expect(godownFormProblem({ ...emptyGodownForm(), name: "  " }, others)?.field).toBe("name");
    expect(godownFormProblem({ ...emptyGodownForm(), name: " bhiwandi " }, others)?.error).toBe("A godown named bhiwandi already exists");
    expect(godownFormProblem({ ...godownFormOf(others[0]), name: "Bhiwandi" }, others)).toBeNull();
    expect(godownFormProblem({ ...emptyGodownForm(), name: "Vasai", pincode: "012345" }, others)?.field).toBe("pincode");
    expect(godownFormProblem({ ...emptyGodownForm(), name: "Vasai", pincode: "401208" }, others)).toBeNull();
    expect(godownFormProblem({ ...emptyGodownForm(), name: "x".repeat(61) }, others)?.field).toBe("name");
  });

  it("names items with colour and size, and shows quantities without extra zeros", () => {
    expect(godownItemLabel({ product_name: "MS Pipe", color: "Black", size: "6M" })).toBe("MS Pipe Black / 6M");
    expect(godownItemLabel({ product_name: "GI Elbow", color: null, size: "FREE" })).toBe("GI Elbow");
    expect(formatGodownQty(12)).toBe("12");
    expect(formatGodownQty(12.5)).toBe("12.5");
    expect(formatGodownQty(-3)).toBe("-3");
    expect(godownTypeInfo("job_work").label).toBe("Job worker");
    expect(godownTypeInfo("unknown").label).toBe("Godown");
  });

  it("knows when the Phase 3 SQL has not run", () => {
    expect(isMissingGodownSql("Could not find the function public.godown_ensure_main(p_organization_id) in the schema cache")).toBe(true);
    expect(isMissingGodownSql('relation "public.godowns" does not exist')).toBe(true);
    expect(isMissingGodownSql("Only an admin or manager can add or change godowns")).toBe(false);
    expect(isMissingGodownSql("Godown not found")).toBe(false);
  });

  it("Excel rows carry the godown, item and value", () => {
    const rows = godownStockExcelRows("Bhiwandi", [
      {
        variant_id: "v",
        product_id: "p",
        product_name: "MS Pipe",
        brand: "Tata",
        category: null,
        size: "6M",
        color: null,
        barcode: "P1",
        uom: "KGS",
        qty: 960.5,
        rate: 61,
        stock_value: 58590.5,
        shop_qty: 3400,
        total_count: 1,
      },
    ]);
    expect(rows[0]).toMatchObject({ Godown: "Bhiwandi", Item: "MS Pipe", Brand: "Tata", Size: "6M", Unit: "KGS", Qty: 960.5, Value: 58591, "Shop stock": 3400 });
  });
});
