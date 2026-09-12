import { describe, expect, it } from "vitest";
import {
  aggregateCashTallyDrawerFlows,
  computeExpectedDrawerCash,
} from "./cashTallyExpectedDrawer";

describe("computeExpectedDrawerCash", () => {
  it("matches FloatingCashTally identity: opening + cash in − cash out", () => {
    expect(computeExpectedDrawerCash(500, 2000, 300)).toBe(2200);
    expect(computeExpectedDrawerCash(0, 100, 0)).toBe(100);
    expect(computeExpectedDrawerCash(1000, 0, 250)).toBe(750);
  });
});

describe("aggregateCashTallyDrawerFlows", () => {
  it("includes cash RCP in cashIn so expected drawer rises when old-balance cash is collected", () => {
    const withoutRcp = aggregateCashTallyDrawerFlows({
      sales: [
        {
          id: "s1",
          sale_type: "pos",
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/1",
          net_amount: 1000,
          cash_amount: 1000,
        },
      ],
      vouchers: [],
      advances: [],
      saleReturns: [],
      advanceRefunds: [],
    });

    const withRcp = aggregateCashTallyDrawerFlows({
      sales: [
        {
          id: "s1",
          sale_type: "pos",
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/1",
          net_amount: 1000,
          cash_amount: 1000,
        },
      ],
      vouchers: [
        {
          voucher_type: "receipt",
          total_amount: 400,
          payment_method: "cash",
          reference_type: "customer",
          reference_id: "cust-old",
          description: "Old balance",
        },
      ],
      advances: [],
      saleReturns: [],
      advanceRefunds: [],
    });

    expect(withoutRcp.cashIn).toBe(1000);
    expect(withRcp.cashIn).toBe(1400);
    expect(computeExpectedDrawerCash(0, withRcp.cashIn, withRcp.cashOut)).toBe(1400);
    expect(computeExpectedDrawerCash(0, withoutRcp.cashIn, withoutRcp.cashOut)).toBe(1000);
  });

  it("strips same-day sale RCP already covered by tenders (dual-write history)", () => {
    const flows = aggregateCashTallyDrawerFlows({
      sales: [
        {
          id: "sale-dual",
          sale_type: "pos",
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/26-27/1248",
          net_amount: 5300,
          cash_amount: 5300,
        },
      ],
      vouchers: [
        {
          voucher_type: "receipt",
          total_amount: 4400,
          payment_method: "cash",
          reference_type: "sale",
          reference_id: "sale-dual",
          description: "Payment received for POS sale",
        },
      ],
      advances: [],
      saleReturns: [],
      advanceRefunds: [],
    });
    // Tender already holds full net; overlapping RCP must not inflate cashIn.
    expect(flows.cashIn).toBe(5300);
    expect(flows.receipts.cash).toBe(0);
  });
});
