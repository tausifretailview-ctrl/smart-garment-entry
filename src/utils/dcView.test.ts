import { describe, expect, it } from "vitest";
import {
  asDcView,
  dcViewKeyParts,
  filterPurchasesForDcView,
  filterSaleReturnsToDcLines,
  filterSalesForDcView,
  filterVariantsForDcView,
  purchaseInDcView,
  saleLineInDcView,
  salesSelectForDcView,
  variantInDcView,
} from "./dcView";

/** Records the PostgREST filters a query gets. */
function fakeQuery() {
  const calls: string[] = [];
  const q = {
    calls,
    eq: (c: string, v: unknown) => (calls.push(`eq ${c} ${v}`), q),
    not: (c: string, op: string, v: unknown) => (calls.push(`not ${c} ${op} ${v}`), q),
    or: (f: string) => (calls.push(`or ${f}`), q),
    is: (c: string, v: unknown) => (calls.push(`is ${c} ${v}`), q),
  };
  return q;
}

describe("dcView", () => {
  it("leaves queries alone when nothing is hidden", () => {
    const q = fakeQuery();
    filterPurchasesForDcView(q, {});
    filterVariantsForDcView(q, {});
    filterSalesForDcView(q, {});
    filterSaleReturnsToDcLines(q, { hideDc: true });
    expect(q.calls).toEqual([]);
    expect(salesSelectForDcView("id, net_amount", { hideDc: true })).toBe("id, net_amount");
    expect(dcViewKeyParts({})).toEqual([]);
  });

  it("DC User wins over hide and keeps only DC rows", () => {
    const view = { hideDc: true, onlyDc: true };
    const q = fakeQuery();
    filterPurchasesForDcView(q, view);
    filterVariantsForDcView(q, view, "product_variants.is_dc_product");
    filterSalesForDcView(q, view);
    expect(q.calls).toEqual([
      "eq is_dc_purchase true",
      "eq product_variants.is_dc_product true",
      "eq dc_lines.is_dc_item true",
      "is dc_lines.deleted_at null",
    ]);
    expect(salesSelectForDcView("id", view)).toBe("id, dc_lines:sale_items!inner(id)");
    expect(dcViewKeyParts(view)).toEqual(["dc-only"]);
    expect(purchaseInDcView({ is_dc_purchase: null }, view)).toBe(false);
    expect(variantInDcView({ is_dc_product: true }, view)).toBe(true);
    expect(saleLineInDcView({ is_dc_item: false }, view)).toBe(false);
  });

  it("hide DC keeps the GST rows", () => {
    const view = asDcView(true);
    const q = fakeQuery();
    filterPurchasesForDcView(q, view);
    filterVariantsForDcView(q, view);
    filterSalesForDcView(q, view);
    expect(q.calls).toEqual([
      "or is_dc_purchase.is.null,is_dc_purchase.eq.false",
      "not is_dc_product is true",
      "eq is_dc_bill false",
    ]);
    expect(dcViewKeyParts(view)).toEqual(["dc-hidden"]);
    expect(saleLineInDcView({ is_dc_item: null }, view)).toBe(true);
    expect(purchaseInDcView({ is_dc_purchase: true }, view)).toBe(false);
  });
});
