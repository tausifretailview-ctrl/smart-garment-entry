import { describe, expect, it } from "vitest";
import {
  addScanToLines,
  buildTransferNoteHtml,
  setLineQty,
  transferTotals,
  type TransferScanVariant,
} from "./stockTransfer";

const shirt: TransferScanVariant = {
  id: "v1",
  barcode: "10001001",
  size: "M",
  color: "Blue",
  stock_qty: 3,
  pur_price: 250,
  sale_price: 599,
  product_name: "Shirt",
  brand: null,
};

describe("stock transfer scan list", () => {
  it("repeat scans raise qty and move the line to the top", () => {
    let r = addScanToLines([], shirt);
    r = addScanToLines(r.lines, { ...shirt, id: "v2", product_name: "Jeans" });
    r = addScanToLines(r.lines, shirt);
    expect(r.ok).toBe(true);
    expect(r.lines.map((l) => [l.id, l.qty])).toEqual([
      ["v1", 2],
      ["v2", 1],
    ]);
  });

  it("refuses a scan beyond stock and keeps the list", () => {
    let r = addScanToLines([], shirt, 3);
    r = addScanToLines(r.lines, shirt);
    expect(r.ok).toBe(false);
    expect(r.lines[0].qty).toBe(3);
  });

  it("qty box clamps to 1..stock", () => {
    const lines = addScanToLines([], shirt).lines;
    expect(setLineQty(lines, "v1", 10)[0].qty).toBe(3);
    expect(setLineQty(lines, "v1", 0)[0].qty).toBe(1);
  });

  it("totals value at purchase cost", () => {
    const lines = addScanToLines([], shirt, 2).lines;
    expect(transferTotals(lines)).toEqual({ qty: 2, value: 500 });
  });

  it("transfer note escapes text and shows totals", () => {
    const html = buildTransferNoteHtml({
      transfer_number: "ST/0001",
      transfer_date: "2026-10-17T10:00:00Z",
      from_name: "A & B",
      to_name: "Studio",
      notes: null,
      cancelled: false,
      items: [{ product_name: "<Shirt>", barcode: "1", size: "M", color: null, qty: 2, unit_cost: 250, line_value: 500 }],
    });
    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;Shirt&gt;");
    expect(html).toContain("500.00");
  });
});
