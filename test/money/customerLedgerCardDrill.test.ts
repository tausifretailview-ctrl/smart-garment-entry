import { describe, expect, it } from "vitest";
import {
  filterLedgerRowsByCardDrill,
  tabForLedgerCardDrill,
  type LedgerCardDrillRow,
} from "@/utils/customerLedgerCardDrill";

const rows: LedgerCardDrillRow[] = [
  { id: "opening-balance", type: "opening" },
  { id: "inv-1", type: "invoice" },
  { id: "pay-1", type: "payment" },
  { id: "adv-1", type: "advance", advanceRemaining: 2450 },
  { id: "adv-2", type: "advance", advanceRemaining: 0 },
  { id: "app-1", type: "advance_application" },
  { id: "ret-1", type: "return", status: "pending", description: "Sale Return [Pending]" },
  { id: "ret-2", type: "return", status: "adjusted", description: "Sale Return [Fully Adjusted]" },
];

describe("customerLedgerCardDrill", () => {
  it("maps Cash/UPI and Advance Adjusted to existing tabs", () => {
    expect(tabForLedgerCardDrill("payments")).toBe("payments");
    expect(tabForLedgerCardDrill("advance_adjusted")).toBe("advance-adjusted");
    expect(tabForLedgerCardDrill("invoices")).toBe("transactions");
  });

  it("filters invoice / payment / advance-application rows", () => {
    expect(filterLedgerRowsByCardDrill(rows, "invoices").map((r) => r.id)).toEqual(["inv-1"]);
    expect(filterLedgerRowsByCardDrill(rows, "payments").map((r) => r.id)).toEqual(["pay-1"]);
    expect(filterLedgerRowsByCardDrill(rows, "advance_adjusted").map((r) => r.id)).toEqual([
      "app-1",
    ]);
  });

  it("Advance Balance keeps only bookings with remaining", () => {
    expect(filterLedgerRowsByCardDrill(rows, "advance_balance").map((r) => r.id)).toEqual([
      "adv-1",
    ]);
  });

  it("CN Available keeps pending returns", () => {
    expect(filterLedgerRowsByCardDrill(rows, "cn_available").map((r) => r.id)).toEqual(["ret-1"]);
  });

  it("null drill returns all rows", () => {
    expect(filterLedgerRowsByCardDrill(rows, null)).toHaveLength(rows.length);
  });
});
