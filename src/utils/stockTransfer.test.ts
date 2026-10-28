import { describe, expect, it } from "vitest";
import {
  addScanToLines,
  buildTransferNoteHtml,
  filterTransfers,
  setLineQty,
  transferBarcodeItems,
  transferDateRange,
  transferKpis,
  transferStatus,
  transferTag,
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

describe("stock transfer accept flow helpers", () => {
  const base = {
    transfer_number: "ST/0001",
    transfer_date: "2026-10-28T10:00:00Z",
    total_qty: 3,
    total_value: 300,
    notes: null,
  };
  const rows = [
    { ...base, id: "a", from_organization_id: "other", to_organization_id: "me", status: "pending" },
    { ...base, id: "b", from_organization_id: "me", to_organization_id: "other", status: "pending" },
    { ...base, id: "c", from_organization_id: "other", to_organization_id: "me", status: "accepted" },
    { ...base, id: "d", from_organization_id: "me", to_organization_id: "other", status: "accepted" },
    { ...base, id: "e", from_organization_id: "other", to_organization_id: "me", status: "rejected" },
    // before the accept-flow SQL: no status column
    { ...base, id: "f", from_organization_id: "me", to_organization_id: "other", cancelled_at: "2026-10-01" },
    { ...base, id: "g", from_organization_id: "me", to_organization_id: "other" },
  ];
  const shopName = (id: string) => (id === "other" ? "ADEEBA AREEBA STUDIO" : "ADEEBAAREEBA");

  it("derives status for rows saved before the status column", () => {
    expect(transferStatus({ cancelled_at: "x" })).toBe("cancelled");
    expect(transferStatus({})).toBe("accepted");
    expect(transferStatus({ status: "pending" })).toBe("pending");
  });

  it("shows Receive only to the receiving shop", () => {
    expect(transferTag("pending", true)).toEqual({ label: "Receive", tone: "receive" });
    expect(transferTag("pending", false).label).toBe("Waiting");
    expect(transferTag("accepted", true).label).toBe("Received");
  });

  it("filters by status, direction and search", () => {
    const f = (status: Parameters<typeof filterTransfers>[1]["status"], direction: "all" | "in" | "out" = "all", search = "") =>
      filterTransfers(rows, { orgId: "me", status, direction, search, shopName }).map((r) => r.id);
    expect(f("receive")).toEqual(["a"]);
    expect(f("waiting")).toEqual(["b"]);
    expect(f("accepted")).toEqual(["c", "d", "g"]);
    expect(f("cancelled")).toEqual(["f"]);
    expect(f("all", "in")).toEqual(["a", "c", "e"]);
    expect(f("all", "out", "studio")).toEqual(["b", "d", "f", "g"]);
    expect(f("all", "all", "nothing-matches")).toEqual([]);
  });

  it("counts KPIs: sent includes waiting, received only accepted", () => {
    expect(transferKpis(rows, "me")).toEqual({
      toReceive: 1,
      toReceiveQty: 3,
      waiting: 1,
      sentQty: 9,
      sentValue: 900,
      receivedQty: 3,
      receivedValue: 300,
    });
  });

  it("builds date ranges", () => {
    const now = new Date(2026, 9, 28); // Wed 28 Oct 2026
    expect(transferDateRange("today", now)).toEqual({ from: "2026-10-28", to: "2026-10-28" });
    expect(transferDateRange("week", now)).toEqual({ from: "2026-10-26", to: "2026-10-28" });
    expect(transferDateRange("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-28" });
    expect(transferDateRange("last_month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(transferDateRange("year", now)).toEqual({ from: "2026-04-01", to: "2026-10-28" });
    expect(transferDateRange("all", now)).toBeNull();
    expect(transferDateRange("custom", now, { from: "2026-10-01", to: "2026-10-05" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
  });

  it("builds barcode items from the receiving shop's own items with the same barcode", () => {
    const items = transferBarcodeItems(
      "ST/0007",
      [
        { to_variant_id: "dv1", qty: 2 },
        { to_variant_id: null, qty: 1 },
      ],
      [
        {
          id: "dv1",
          barcode: "10001001",
          size: "M",
          color: null,
          mrp: 999,
          sale_price: 799,
          pur_price: 400,
          products: { product_name: "Shirt", brand: "X", category: "Men", style: null, color: "Blue" },
        },
      ],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sku_id: "dv1",
      barcode: "10001001",
      qty: 2,
      color: "Blue",
      sale_price: 799,
      bill_number: "ST/0007",
    });
  });

  it("prints a status line on the transfer note", () => {
    const html = buildTransferNoteHtml({
      transfer_number: "ST/0001",
      transfer_date: "2026-10-28T10:00:00Z",
      from_name: "A",
      to_name: "B",
      notes: null,
      cancelled: false,
      status_text: "WAITING TO BE RECEIVED",
      items: [],
    });
    expect(html).toContain("WAITING TO BE RECEIVED");
  });
});
