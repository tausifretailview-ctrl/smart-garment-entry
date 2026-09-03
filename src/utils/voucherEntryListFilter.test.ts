import { describe, expect, it } from "vitest";
import { filterVoucherEntryRows, voucherDateSearchText } from "./voucherEntryListFilter";

const sales = [
  {
    id: "sale-1",
    customer_id: "cust-1",
    customer_name: "UZMA KUDIA",
    sale_number: "INV/26-27/2896",
  },
];
const customers = [{ id: "cust-1", customer_name: "UZMA KUDIA" }];

const vouchers = [
  {
    id: "v1",
    voucher_number: "RCP/26-27/4446",
    voucher_date: "2026-09-03",
    voucher_type: "receipt",
    reference_type: "sale",
    reference_id: "sale-1",
    description: "Adjusted from advance balance for invoice",
    total_amount: 2101,
  },
  {
    id: "v2",
    voucher_number: "RCP/26-27/4440",
    voucher_date: "2026-09-02",
    voucher_type: "receipt",
    reference_type: "sale",
    reference_id: "other",
    description: "Payment received for invoice INV/26-27/2928",
    total_amount: 350,
  },
];

describe("filterVoucherEntryRows", () => {
  it("formats voucher date like the table", () => {
    expect(voucherDateSearchText("2026-09-03")).toBe("03/09/2026");
  });

  it("matches customer name via sale reference", () => {
    const rows = filterVoucherEntryRows({
      vouchers,
      searchQuery: "uzma",
      sales,
      customers,
    });
    expect(rows.map((r) => r.id)).toEqual(["v1"]);
  });

  it("matches display date text", () => {
    const rows = filterVoucherEntryRows({
      vouchers,
      searchQuery: "03/09/2026",
      sales,
      customers,
    });
    expect(rows.map((r) => r.id)).toEqual(["v1"]);
  });

  it("filters by inclusive voucher_date range", () => {
    const rows = filterVoucherEntryRows({
      vouchers,
      searchQuery: "",
      dateFrom: new Date(2026, 8, 3),
      dateTo: new Date(2026, 8, 3),
      sales,
      customers,
    });
    expect(rows.map((r) => r.id)).toEqual(["v1"]);
  });
});
