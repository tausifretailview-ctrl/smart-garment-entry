import { describe, expect, it } from "vitest";
import {
  sumTransferValue,
  summarizeTransferIn,
  summarizeTransferOut,
  transferValueLines,
  type TransferValueRow,
} from "./stockTransferStockReport";
import { isStockTransferEnabled } from "@/utils/stockTransfer";

const t = (n: string, date: string, cancelled: string | null = null) => ({
  transfer_number: n,
  from_organization_id: "studio",
  transfer_date: date,
  cancelled_at: cancelled,
});

describe("summarizeTransferIn", () => {
  it("sums received qty and names the latest sending shop as supplier", () => {
    const m = summarizeTransferIn(
      [
        { to_variant_id: "v1", qty: 2, stock_transfers: t("ST/0001", "2026-10-01") },
        { to_variant_id: "v1", qty: 3, stock_transfers: t("ST/0004", "2026-10-20") },
        { to_variant_id: "v1", qty: 9, stock_transfers: t("ST/0005", "2026-10-21", "2026-10-22") },
        { to_variant_id: null, qty: 4, stock_transfers: t("ST/0006", "2026-10-23") },
      ],
      (id) => (id === "studio" ? "ADEEBA AREEBA STUDIO" : "?"),
    );
    expect(m.get("v1")).toEqual({ qty: 5, supplier_name: "ADEEBA AREEBA STUDIO", supplier_invoice_no: "ST/0004" });
    expect(m.size).toBe(1);
  });
});

describe("summarizeTransferOut", () => {
  it("counts waiting and received transfers, not cancelled or rejected", () => {
    const m = summarizeTransferOut([
      { from_variant_id: "v1", qty: 2, stock_transfers: { cancelled_at: null } },
      { from_variant_id: "v1", qty: 1, stock_transfers: { cancelled_at: null } },
      { from_variant_id: "v1", qty: 5, stock_transfers: { cancelled_at: "2026-10-28" } },
    ]);
    expect(m.get("v1")).toBe(3);
  });

  it("Transfer Out column is off until Settings turns it on", () => {
    expect(isStockTransferEnabled(undefined)).toBe(false);
    expect(isStockTransferEnabled({})).toBe(false);
    expect(isStockTransferEnabled({ stock_transfer_enabled: true })).toBe(true);
  });
});

describe("transfer values for P&L", () => {
  const row = (over: Partial<TransferValueRow>): TransferValueRow => ({
    qty: 2,
    unit_cost: 100,
    line_value: 200,
    to_variant_id: "v1",
    stock_transfers: { transfer_date: "2026-10-05T10:00:00", accepted_at: "2026-10-07T10:00:00", cancelled_at: null },
    ...over,
  });

  it("dates sent stock by send day and received stock by accept day, skipping cancelled and waiting lines", () => {
    const rows = [
      row({}),
      row({ line_value: 0, qty: 3, unit_cost: 50 }),
      row({ stock_transfers: { transfer_date: "2026-10-05T10:00:00", accepted_at: null, cancelled_at: "2026-10-06T10:00:00" } }),
      row({ to_variant_id: null }),
    ];
    expect(transferValueLines(rows, "out")).toEqual([
      { day: "2026-10-05", value: 200 },
      { day: "2026-10-05", value: 150 },
      { day: "2026-10-05", value: 200 },
    ]);
    expect(transferValueLines(rows, "in")).toEqual([
      { day: "2026-10-07", value: 200 },
      { day: "2026-10-07", value: 150 },
    ]);
  });

  it("sums only lines after the start day and up to the end day", () => {
    const lines = [
      { day: "2026-09-30", value: 10 },
      { day: "2026-10-01", value: 20 },
      { day: "2026-10-31", value: 30 },
      { day: "2026-11-01", value: 40 },
    ];
    expect(sumTransferValue(lines, "2026-09-30", "2026-10-31")).toBe(50);
    expect(sumTransferValue(lines, "2026-10-31", null)).toBe(40);
    expect(sumTransferValue(lines, null, null)).toBe(100);
  });
});
