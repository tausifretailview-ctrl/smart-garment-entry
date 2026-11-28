import { describe, expect, it } from "vitest";
import { isMissingAttributeListsTable, mergeSuggestions } from "./productAttributeLists";
import {
  EMPTY_PRODUCT_MASTER_ROW,
  groupRows,
  isBlankRow,
  rowProblem,
  saveProductMasterRows,
  type ProductMasterDb,
  type ProductMasterRow,
} from "./productMasterRows";

/** Product Master (Nov 2026): field lists and the Create products sheet. */
const row = (p: Partial<ProductMasterRow>): ProductMasterRow => ({ ...EMPTY_PRODUCT_MASTER_ROW, ...p });

describe("field lists", () => {
  it("suggestions: list values and item values once each, whatever the capitals", () => {
    expect(mergeSuggestions(["TATA", "Parle"], ["tata ", "HUL", ""])).toEqual(["HUL", "Parle", "TATA"]);
    expect(mergeSuggestions(undefined, ["B", "a"])).toEqual(["a", "B"]);
  });
  it("knows when the SQL has not been run", () => {
    expect(isMissingAttributeListsTable({ code: "42P01", message: 'relation "product_attribute_values" does not exist' })).toBe(true);
    expect(isMissingAttributeListsTable({ code: "23505" })).toBe(false);
  });
});

describe("sheet rows", () => {
  it("blank rows are ignored; a name is needed; numbers must be numbers; GST must be a GST rate", () => {
    expect(isBlankRow(row({}))).toBe(true);
    expect(rowProblem(row({ brand: "TATA" }))).toMatch(/name/);
    expect(rowProblem(row({ product_name: "Salt", mrp: "abc" }))).toMatch(/mrp/);
    expect(rowProblem(row({ product_name: "Salt", gst_per: "7" }))).toMatch(/GST/);
    expect(rowProblem(row({ product_name: "Salt", gst_per: "5", mrp: "28" }))).toBeNull();
  });
  it("same name / brand / category / style / colour → one product with its sizes", () => {
    const groups = groupRows([
      row({ product_name: "Shirt", brand: "ACME", size: "M" }),
      row({ product_name: "SHIRT ", brand: "acme", size: "L" }),
      row({}),
      row({ product_name: "Shirt", brand: "ACME", color: "Blue", size: "M" }),
    ]);
    expect([...groups.values()]).toEqual([[0, 1], [3]]);
  });
});

/** A small in-memory database for the save. */
function fakeDb(seed: { products?: Array<Record<string, unknown>>; variants?: Array<Record<string, unknown>> } = {}) {
  const products = [...(seed.products ?? [])];
  const variants = [...(seed.variants ?? [])];
  let next = 1000;
  const tables: Record<string, Array<Record<string, unknown>>> = { products, product_variants: variants };
  const query = (table: string, filters: Array<[string, unknown]>) => {
    const rows = () => tables[table].filter((r) => filters.every(([k, v]) => (v === null ? r[k] == null : r[k] === v)));
    const q = {
      eq: (k: string, v: unknown) => query(table, [...filters, [k, v]]),
      is: (k: string, v: null) => query(table, [...filters, [k, v]]),
      order: () => ({ range: (a: number, b: number) => Promise.resolve({ data: rows().slice(a, b + 1), error: null }) }),
      then: (resolve: (x: unknown) => unknown) => resolve({ data: rows(), error: null }),
    };
    return q;
  };
  const db = {
    from: (table: string) => ({
      select: () => query(table, []),
      insert: (r: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            if (table === "product_variants" && variants.some((v) => v.barcode === r.barcode && v.deleted_at == null)) {
              return Promise.resolve({ data: null, error: { code: "23505", message: "dup" } });
            }
            const id = `${table}-${next++}`;
            tables[table].push({ id, deleted_at: null, ...r });
            return Promise.resolve({ data: { id }, error: null });
          },
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: String(next++), error: null }),
  } as unknown as ProductMasterDb;
  return { db, products, variants };
}

describe("saving the sheet", () => {
  it("creates products and sizes; reuses an existing product and its spelling; skips a size it has", async () => {
    const { db, products, variants } = fakeDb({
      products: [{ id: "p-old", organization_id: "o", product_name: "ELN-DUP", brand: "ACME", category: null, style: null, color: null, deleted_at: null }],
      variants: [{ id: "v-old", organization_id: "o", product_id: "p-old", size: "M", barcode: "111", deleted_at: null }],
    });
    const res = await saveProductMasterRows(db, "o", [
      row({ product_name: "eln dup", brand: "ACME", size: "M" }), // exists → skipped
      row({ product_name: "eln dup", brand: "ACME", size: "L", mrp: "999" }), // new size of the old product
      row({ product_name: "Tata Salt 1kg", brand: "TATA", gst_per: "0", uom: "pcs", barcode: "8901058000016", mrp: "28", opening_qty: "12" }),
      row({ product_name: "Sugar", uom: "Kgs", opening_qty: "25.5" }), // blank barcode → next number
      row({}),
      row({ product_name: "Bad", gst_per: "7" }),
    ]);
    expect(res.map((r) => r.status)).toEqual(["skipped", "created", "created", "created", "error"]);
    expect(products.map((p) => p.product_name)).toEqual(["ELN-DUP", "Tata Salt 1kg", "Sugar"]);
    expect(products.find((p) => p.product_name === "Sugar")).toMatchObject({ uom: "KG", requires_imei: false });
    const salt = variants.find((v) => v.barcode === "8901058000016");
    expect(salt).toMatchObject({ size: "None", barcode_source: "external", mrp: 28, stock_qty: 12, opening_qty: 12 });
    expect(variants.find((v) => v.product_id === "p-old" && v.size === "L")).toMatchObject({ mrp: 999 });
    expect(variants.find((v) => v.size === "None" && v.stock_qty === 25.5)?.barcode).toMatch(/^\d+$/);
  });

  it("a barcode already on another item, or twice in the sheet, is refused for that row", async () => {
    const { db } = fakeDb({ variants: [{ id: "v1", organization_id: "o", product_id: "x", size: "None", barcode: "555", deleted_at: null }] });
    const res = await saveProductMasterRows(db, "o", [
      row({ product_name: "A", barcode: "555" }),
      row({ product_name: "B", barcode: "777" }),
      row({ product_name: "C", barcode: "777" }),
    ]);
    expect(res.map((r) => [r.status, r.message ?? ""])).toEqual([
      ["error", "Barcode 555 is already on another item"],
      ["created", ""],
      ["error", "Barcode 777 is twice in this sheet"],
    ]);
  });
});
