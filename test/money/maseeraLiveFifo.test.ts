/**
 * Live ELLA NOOR FIFO from SQL-editor pastes 18 Sep 2026 17:03 IST.
 * Per-SR nets and CN receipts — not the worst-case 3a split.
 */
import { describe, expect, it } from "vitest";
import {
  allocateCnAdjustmentsToSaleReturns,
  saleReturnConsumedForRemaining,
  saleReturnRemainingCredit,
} from "@/utils/customerLedgerSaleReturnBalance";

function remainingAfter(net: number, allocated: number, sra: number) {
  return saleReturnRemainingCredit({
    grossNetAmount: net,
    consumedAmount: saleReturnConsumedForRemaining({
      allocatedAmount: allocated,
      absorbedOnLinkedInvoice: Math.min(net, sra),
    }),
  });
}

describe("live FIFO — MASEERA", () => {
  it("SR/159 memo 0; SR/160 remaining ₹4,150; 3122 CN is 18/09", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "159",
          net_amount: 9400,
          linked_sale_id: "3123",
          return_date: "2026-09-18",
          created_at: "2026-09-18T07:04:57Z",
        },
        {
          id: "160",
          net_amount: 13850,
          linked_sale_id: "3123",
          return_date: "2026-09-18",
          created_at: "2026-09-18T09:34:26Z",
        },
      ],
      { "3122": 8400, "3123": 10700 },
    );
    expect(map["159"].applied).toBe(9400);
    expect(map["160"].applied).toBe(9700);
    expect(remainingAfter(9400, map["159"].applied, 10700)).toBe(0);
    expect(remainingAfter(13850, map["160"].applied, 10700)).toBe(4150);
  });
});

describe("live FIFO — DR.SADAF GODIL", () => {
  it("SR/152 ₹2,700 is applied to INV/2971, not leftover; remaining 0", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "79",
          net_amount: 3800,
          linked_sale_id: "2988",
          return_date: "2026-06-18",
          created_at: "2026-06-18T12:36:06Z",
        },
        {
          id: "152",
          net_amount: 2700,
          linked_sale_id: "2988",
          return_date: "2026-09-06",
          created_at: "2026-09-06T10:46:20Z",
        },
      ],
      { "2971": 2700, "2988": 3800 },
    );
    expect(map["79"].applied).toBe(3800);
    expect(map["152"].applied).toBe(2700);
    expect(map["152"].saleId).toBe("2971");
    expect(remainingAfter(3800, map["79"].applied, 3800)).toBe(0);
    expect(remainingAfter(2700, map["152"].applied, 3800)).toBe(0);
  });
});

describe("live FIFO — AMRIN BAIG", () => {
  it("SR/97 ₹1,950 is applied to INV/1052, not leftover; remaining 0", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "59",
          net_amount: 3450,
          linked_sale_id: "1324",
          return_date: "2026-05-30",
          created_at: "2026-05-30T07:34:46Z",
        },
        {
          id: "97",
          net_amount: 1950,
          linked_sale_id: "1324",
          return_date: "2026-07-01",
          created_at: "2026-07-01T06:37:00Z",
        },
      ],
      { "1052": 1950, "1324": 3450 },
    );
    expect(map["59"].applied).toBe(3450);
    expect(map["97"].applied).toBe(1950);
    expect(map["97"].saleId).toBe("1052");
    expect(remainingAfter(3450, map["59"].applied, 3450)).toBe(0);
    expect(remainingAfter(1950, map["97"].applied, 3450)).toBe(0);
  });
});

describe("live FIFO — Shaista Arif Reshmawala", () => {
  it("SR/130 remaining is ₹250 (net 5450 − allocated 5200); estimate ₹250 holds", () => {
    const map = allocateCnAdjustmentsToSaleReturns(
      [
        {
          id: "129",
          net_amount: 7550,
          linked_sale_id: "2676",
          return_date: "2026-08-12",
          created_at: "2026-08-12T14:55:13Z",
        },
        {
          id: "130",
          net_amount: 5450,
          linked_sale_id: "2676",
          return_date: "2026-08-12",
          created_at: "2026-08-12T14:55:54Z",
        },
      ],
      { "2676": 12750 },
    );
    expect(map["129"].applied).toBe(7550);
    expect(map["130"].applied).toBe(5200);
    expect(remainingAfter(7550, map["129"].applied, 12750)).toBe(0);
    expect(remainingAfter(5450, map["130"].applied, 12750)).toBe(250);
    expect(
      remainingAfter(5450, 0, 12750),
    ).toBe(0);
  });
});
