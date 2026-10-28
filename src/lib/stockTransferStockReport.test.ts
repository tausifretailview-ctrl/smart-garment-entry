import { describe, expect, it } from "vitest";
import { summarizeTransferIn, summarizeTransferOut } from "./stockTransferStockReport";
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
