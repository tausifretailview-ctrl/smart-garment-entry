import { describe, expect, it } from "vitest";
import {
  emptyGodownForm,
  formatGodownQty,
  godownCardStripe,
  godownFormOf,
  godownFormProblem,
  godownItemLabel,
  godownStockExcelRows,
  godownTotals,
  godownTypeInfo,
  isMissingGodownSql,
  sortGodowns,
  toGodownSummaryMap,
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

describe("Godowns page cards", () => {
  it("adds up Main, the other godowns and the items to check", () => {
    const list = [
      g({ id: "main", godown_type: "main" }),
      g({ id: "bhw", godown_type: "godown" }),
      g({ id: "jw", godown_type: "job_work" }),
      g({ id: "old", godown_type: "godown", is_active: false }),
    ];
    const summary = new Map([
      ["main", { godown_id: "main", items: 2702, qty: 9744, stock_value: 807522, short_items: 3 }],
      ["bhw", { godown_id: "bhw", items: 6, qty: 6, stock_value: 500, short_items: 0 }],
      ["jw", { godown_id: "jw", items: 1, qty: 2.5, stock_value: 0, short_items: 0 }],
    ]);
    expect(godownTotals(list, summary)).toEqual({
      all: { items: 2709, qty: 9752.5, value: 808022 },
      main: { items: 2702, qty: 9744, value: 807522 },
      others: { count: 2, items: 7, qty: 8.5, value: 500 },
      shortItems: 3,
    });
    expect(godownTotals(list, undefined).all).toEqual({ items: 0, qty: 0, value: 0 });
    expect(godownTotals(list, undefined).others.count).toBe(2);
  });

  it("colours each kind of place", () => {
    expect(godownCardStripe("main")).toBe("bg-teal-500");
    expect(godownCardStripe("godown")).toBe("bg-sky-500");
    expect(godownCardStripe("job_work")).toBe("bg-violet-500");
    expect(godownCardStripe("damaged")).toBe("bg-rose-500");
    expect(godownCardStripe(null)).toBe("bg-sky-500");
  });
});

describe("Godowns page summary after a reload", () => {
  it("reads the summary whether the cache gives back a Map, a plain object or nothing", () => {
    const row = { godown_id: "bhw", items: 6, qty: 6, stock_value: 500, short_items: 0 };
    const live = new Map([["bhw", row]]);
    expect(toGodownSummaryMap(live)).toBe(live);
    expect(toGodownSummaryMap({}).size).toBe(0);
    expect(toGodownSummaryMap(undefined).size).toBe(0);
    expect(toGodownSummaryMap(null).size).toBe(0);
    expect(toGodownSummaryMap({ a: { ...row, qty: "6.5" } }).get("bhw")?.qty).toBe(6.5);
    expect(toGodownSummaryMap([row, { junk: 1 }]).get("bhw")).toEqual(row);
  });
});
