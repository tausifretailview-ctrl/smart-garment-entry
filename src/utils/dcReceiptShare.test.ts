import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { receiptsForDcView, vouchersWithReceiptsForDcView } from "./dcReceiptShare";

/** sale_items: s-dc = all DC, s-mix = half DC (by net), s-gst = no DC line. */
const lines = [
  { sale_id: "s-dc", net_after_discount: 1000, line_total: 1000, quantity: 1, is_dc_item: true },
  { sale_id: "s-mix", net_after_discount: 500, line_total: 500, quantity: 1, is_dc_item: true },
  { sale_id: "s-mix", net_after_discount: 500, line_total: 500, quantity: 1, is_dc_item: false },
  { sale_id: "s-gst", net_after_discount: 800, line_total: 800, quantity: 1, is_dc_item: false },
];

const client = {
  from() {
    let ids: string[] = [];
    let dcOnly = false;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.in = (_c: string, v: string[]) => {
      ids = v;
      return q;
    };
    q.eq = (col: string, v: boolean) => {
      if (col === "is_dc_item") dcOnly = v;
      return q;
    };
    q.is = () => q;
    q.order = () => q;
    q.range = (a: number, b: number) =>
      Promise.resolve({
        data: lines.filter((l) => ids.includes(l.sale_id) && (!dcOnly || l.is_dc_item)).slice(a, b + 1),
        error: null,
      });
    return q;
  },
};

const receipts = [
  { id: "r1", reference_type: "sale", reference_id: "s-dc", total_amount: 1000, discount_amount: 0 },
  { id: "r2", reference_type: "sale", reference_id: "s-mix", total_amount: 400, discount_amount: 20 },
  { id: "r3", reference_type: "sale", reference_id: "s-gst", total_amount: 800, discount_amount: 0 },
  { id: "r4", reference_type: "customer", reference_id: "c1", total_amount: 300, discount_amount: 0 },
];

describe("Business Report: old payment receipts follow the DC view", () => {
  it("shows everything when DC is neither hidden nor DC-only", async () => {
    expect(await receiptsForDcView(client, receipts, {})).toBe(receipts);
  });

  it("DC hidden: drops payments on DC bills, keeps the GST part of mixed bills and on-account receipts", async () => {
    const out = await receiptsForDcView(client, receipts, { hideDc: true });
    expect(out.map((r) => [r.id, r.total_amount, r.discount_amount])).toEqual([
      ["r2", 200, 10],
      ["r3", 800, 0],
      ["r4", 300, 0],
    ]);
  });

  it("DC User: only payments on DC bills, at their DC part", async () => {
    const out = await receiptsForDcView(client, receipts, { onlyDc: true });
    expect(out.map((r) => [r.id, r.total_amount])).toEqual([
      ["r1", 1000],
      ["r2", 200],
    ]);
  });

  it("Business Report reads receipts through it, keyed by the DC view", () => {
    const src = readFileSync(join(process.cwd(), "src/pages/DailyCashierReport.tsx"), "utf8");
    expect(src).toContain("return receiptsForDcView(supabase, allReceipts, { hideDc, onlyDc });");
    expect(src).toContain('"cashier-report-receipts", currentOrganization?.id, rangeStartYmd, rangeEndYmd, period, hideDc, onlyDc');
  });
});

describe("Cash tally and POS cashier report follow the DC view", () => {
  const day = [
    { id: "p1", voucher_type: "payment", reference_type: "supplier", reference_id: "x", total_amount: 500 },
    { id: "r1", voucher_type: "receipt", reference_type: "sale", reference_id: "s-dc", total_amount: 1000 },
    { id: "r2", voucher_type: "receipt", reference_type: "sale", reference_id: "s-mix", total_amount: 400 },
    { id: "r4", voucher_type: "receipt", reference_type: "customer", reference_id: "c1", total_amount: 300 },
    { id: "e1", voucher_type: "expense", total_amount: 50 },
  ];

  it("leaves the day's vouchers alone when DC is neither hidden nor DC-only", async () => {
    expect(await vouchersWithReceiptsForDcView(client, day, {})).toBe(day);
  });

  it("DC hidden: only receipts change; payments and expenses stay whole", async () => {
    const out = await vouchersWithReceiptsForDcView(client, day, { hideDc: true });
    expect(out.map((v) => [v.id, v.total_amount])).toEqual([
      ["p1", 500],
      ["e1", 50],
      ["r2", 200],
      ["r4", 300],
    ]);
  });

  it("DC User: receipts on DC bills only, payments and expenses stay", async () => {
    const out = await vouchersWithReceiptsForDcView(client, day, { onlyDc: true });
    expect(out.map((v) => [v.id, v.total_amount])).toEqual([
      ["p1", 500],
      ["e1", 50],
      ["r1", 1000],
      ["r2", 200],
    ]);
  });

  it("every tally and cashier screen reads sales and receipts through the DC view", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    const tally = read("src/components/FloatingCashTally.tsx");
    expect(tally).toContain("fetchAllSalesWithFilters(orgId!, { startDate: startIso, endDate: endIso, hideDc, onlyDc })");
    expect(tally).toContain('["daily-tally-vouchers", orgId, dateStr, "floating", hideDc, onlyDc]');
    const quick = read("src/components/FloatingPOSReports.tsx");
    expect(quick).toContain("query = filterSalesForDcView(query, { hideDc, onlyDc });");
    expect(quick).toContain("return saleRowsForDcView(supabase, data || [], { hideDc, onlyDc });");
    expect(quick).toContain('["floating-cashier-report-sales", currentOrganization?.id, selectedDateSafe, hideDc, onlyDc]');
    for (const path of [
      "src/components/FloatingCashTally.tsx",
      "src/components/FloatingPOSReports.tsx",
      "src/pages/DailyTally.tsx",
      "src/pages/DailyAccountTally.tsx",
    ]) {
      expect(read(path)).toContain("return vouchersWithReceiptsForDcView(supabase, data || [], { hideDc, onlyDc });");
    }
  });
});

