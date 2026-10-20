import { describe, expect, it } from "vitest";
import {
  buildCatalogIndex,
  financialYearShort,
  findCatalogRowsByBarcode,
  formatOfflineSaleNumber,
  generateCounterCode,
  isNetworkFailure,
  isOfflineSaleNumber,
  isSameSyncedBill,
  isValidCounterCode,
  mergeCatalogRows,
  offlineSaleBlockReason,
  offlineSaleNumberSeq,
  offlineSoldQtyByVariant,
  searchCatalogRows,
  type OfflineCatalogRow,
} from "./offlinePosCore";

const row = (id: string, extra: Partial<OfflineCatalogRow> = {}, product: Record<string, unknown> = {}): OfflineCatalogRow => ({
  id,
  barcode: `B${id}`,
  size: "M",
  stock_qty: 5,
  sale_price: 499,
  mrp: 599,
  active: true,
  deleted_at: null,
  ...extra,
  products: { id: `P${id}`, product_name: `Shirt ${id}`, status: "active", deleted_at: null, product_type: "goods", ...product },
});

describe("offline POS catalog", () => {
  it("indexes by barcode with highest stock first and skips deleted rows", () => {
    const index = buildCatalogIndex([
      row("1", { barcode: "890", stock_qty: 1 }),
      row("2", { barcode: "890", stock_qty: 9 }),
      row("3", { barcode: "890", deleted_at: "2026-10-01" }),
      row("4", { barcode: "891" }, { status: "inactive" }),
    ]);
    expect(findCatalogRowsByBarcode(index, " 890 ").map((r) => r.id)).toEqual(["2", "1"]);
    expect(findCatalogRowsByBarcode(index, "891")).toEqual([]);
    expect(index.byId.has("3")).toBe(false);
  });

  it("merges a refresh: changed rows replace, deleted or switched-off rows drop out", () => {
    const merged = mergeCatalogRows(
      [row("1"), row("2"), row("3")],
      [row("1", { stock_qty: 2 }), row("2", { deleted_at: "2026-10-19" }), row("3", { active: false }), row("4")],
    );
    expect(merged.map((r) => r.id).sort()).toEqual(["1", "4"]);
    expect(merged.find((r) => r.id === "1")?.stock_qty).toBe(2);
  });

  it("searches every typed word across name, size, colour and price", () => {
    const rows = [
      row("1", { color: "Blue" }, { product_name: "Denim Jeans", brand: "Levis" }),
      row("2", { color: "Red" }, { product_name: "Denim Jacket" }),
      row("3", {}, { product_name: "Haircut", product_type: "service" }),
    ];
    expect(searchCatalogRows(rows, "denim blue").map((r) => r.id)).toEqual(["1"]);
    expect(searchCatalogRows(rows, "DENIM").map((r) => r.id)).toEqual(["1", "2"]);
    expect(searchCatalogRows(rows, "499", { productType: "service" }).map((r) => r.id)).toEqual(["3"]);
    expect(searchCatalogRows(rows, "   ")).toEqual([]);
  });
});

describe("offline bill numbers", () => {
  it("uses the Indian financial year", () => {
    expect(financialYearShort(new Date(2026, 9, 19))).toBe("26-27");
    expect(financialYearShort(new Date(2027, 2, 31))).toBe("26-27");
    expect(financialYearShort(new Date(2027, 3, 1))).toBe("27-28");
    expect(financialYearShort(new Date(2099, 5, 1))).toBe("99-00");
  });

  it("formats and parses the counter series", () => {
    const n = formatOfflineSaleNumber("K7QZ", "26-27", 12);
    expect(n).toBe("OFL-K7QZ/26-27/12");
    expect(isOfflineSaleNumber(n)).toBe(true);
    expect(isOfflineSaleNumber("POS/26-27/12")).toBe(false);
    expect(offlineSaleNumberSeq(n)).toBe(12);
    expect(offlineSaleNumberSeq("POS/26-27/12")).toBe(0);
  });

  it("makes readable counter codes", () => {
    let i = 0;
    const seq = [0, 0.99, 0.5, 0.25];
    const code = generateCounterCode(() => seq[i++ % seq.length]);
    expect(code).toHaveLength(4);
    expect(isValidCounterCode(code)).toBe(true);
    expect(isValidCounterCode("AB0O")).toBe(false);
    expect(isValidCounterCode(null)).toBe(false);
  });
});

describe("offline bill rules", () => {
  const base = { saleType: "pos", paymentMethod: "cash", netAmount: 1000 };

  it("allows plain paid POS bills", () => {
    expect(offlineSaleBlockReason(base)).toBeNull();
    expect(offlineSaleBlockReason({ ...base, paymentMethod: "upi" })).toBeNull();
    expect(
      offlineSaleBlockReason({ ...base, paymentMethod: "multiple", breakdown: { totalPaid: 999.5 } }),
    ).toBeNull();
  });

  it("blocks anything that touches a customer account", () => {
    expect(offlineSaleBlockReason({ ...base, saleType: "sale_invoice" })).toMatch(/POS/);
    expect(offlineSaleBlockReason({ ...base, paymentMethod: "pay_later" })).toMatch(/Credit/);
    expect(offlineSaleBlockReason({ ...base, saleReturnAdjust: 200 })).toMatch(/return/);
    expect(offlineSaleBlockReason({ ...base, creditApplied: 50 })).toMatch(/Credit note/);
    expect(offlineSaleBlockReason({ ...base, advanceApplied: 50 })).toMatch(/Advance/);
    expect(offlineSaleBlockReason({ ...base, pointsRedeemedAmount: 20 })).toMatch(/Points/);
    expect(offlineSaleBlockReason({ ...base, hasFinancer: true })).toMatch(/Finance/);
    expect(offlineSaleBlockReason({ ...base, netAmount: -10 })).toMatch(/Refund/);
    expect(
      offlineSaleBlockReason({ ...base, paymentMethod: "multiple", breakdown: { totalPaid: 500 } }),
    ).toMatch(/balance due/);
    expect(
      offlineSaleBlockReason({ ...base, paymentMethod: "multiple", breakdown: { totalPaid: 1000, issueCreditNote: true } }),
    ).toMatch(/credit notes/);
  });

  it("recognises no-internet errors only", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure({ message: "TypeError: Failed to fetch", details: "" })).toBe(true);
    expect(isNetworkFailure({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
    expect(isNetworkFailure({ message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });

  it("counts quantity already sold offline per variant", () => {
    const sold = offlineSoldQtyByVariant([
      { items: [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }] },
      { items: [{ variantId: "v1", quantity: 1 }, { variantId: null, quantity: 4 }] },
    ]);
    expect(sold.get("v1")).toBe(3);
    expect(sold.get("v2")).toBe(1);
    expect(sold.size).toBe(2);
  });

  it("knows a bill that already reached the server", () => {
    const bill = { netAmount: 1499, saleDate: "2026-10-19T14:05:09.123+05:30" };
    expect(isSameSyncedBill({ net_amount: 1499, sale_date: "2026-10-19T08:35:09.123+00:00" }, bill)).toBe(true);
    expect(isSameSyncedBill({ net_amount: 1500, sale_date: "2026-10-19T08:35:09.123+00:00" }, bill)).toBe(false);
    expect(isSameSyncedBill({ net_amount: 1499, sale_date: "2026-10-19T09:35:09.123+00:00" }, bill)).toBe(false);
  });
});
