import { describe, expect, it } from "vitest";
import {
  ADEEBAAREEBA_ORG_ID,
  aggregateDailySalesmanIncentive,
  computeDailyIncentiveAmount,
  findEmployeeBySalesmanName,
  incentiveForNetAmount,
  isDailyIncentiveUiOrg,
} from "./dailySalesmanIncentive";

const ADEEBA_BRACKETS = [
  { min_net_amount: 0, max_net_amount: 500, incentive_amount: 3, sort_order: 1 },
  { min_net_amount: 500, max_net_amount: 1000, incentive_amount: 5, sort_order: 2 },
  { min_net_amount: 1000, max_net_amount: null, incentive_amount: 10, sort_order: 3 },
];

describe("findEmployeeBySalesmanName (same as createCommissionRecords)", () => {
  const employees = [
    { id: "1", employee_name: "RAVI" },
    { id: "2", employee_name: "PRIYA" },
  ];

  it("matches exact employee_name", () => {
    expect(findEmployeeBySalesmanName(employees, "RAVI")?.id).toBe("1");
  });

  it("returns undefined for blank / unknown (excluded from incentive)", () => {
    expect(findEmployeeBySalesmanName(employees, "")).toBeUndefined();
    expect(findEmployeeBySalesmanName(employees, null)).toBeUndefined();
    expect(findEmployeeBySalesmanName(employees, "unknown")).toBeUndefined();
  });
});

describe("incentive brackets (Adeeba)", () => {
  it("maps 0–499.99 → ₹3, 500–999.99 → ₹5, ≥1000 → ₹10", () => {
    expect(incentiveForNetAmount(0, ADEEBA_BRACKETS)).toBe(3);
    expect(incentiveForNetAmount(499.99, ADEEBA_BRACKETS)).toBe(3);
    expect(incentiveForNetAmount(500, ADEEBA_BRACKETS)).toBe(5);
    expect(incentiveForNetAmount(999.99, ADEEBA_BRACKETS)).toBe(5);
    expect(incentiveForNetAmount(1000, ADEEBA_BRACKETS)).toBe(10);
    expect(incentiveForNetAmount(1500, ADEEBA_BRACKETS)).toBe(10);
  });
});

describe("qty gate", () => {
  it("qty < 5 → zero even with high net", () => {
    expect(
      computeDailyIncentiveAmount({
        totalQty: 4,
        totalNetAmount: 5000,
        qtyThreshold: 5,
        brackets: ADEEBA_BRACKETS,
      }),
    ).toEqual({ isEligible: false, incentiveAmount: 0 });
  });

  it("qty ≥ 5 at exactly ₹1000 → ₹10", () => {
    expect(
      computeDailyIncentiveAmount({
        totalQty: 5,
        totalNetAmount: 1000,
        qtyThreshold: 5,
        brackets: ADEEBA_BRACKETS,
      }),
    ).toEqual({ isEligible: true, incentiveAmount: 10 });
  });
});

describe("aggregateDailySalesmanIncentive", () => {
  const employees = [{ id: "e1", employee_name: "RAVI" }];

  it("excludes null salesman and aggregates qty/net for named salesman", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-10",
      sales: [
        { id: "s1", salesman: "RAVI", net_amount: 600, sale_date: "2026-09-10T10:00:00+05:30" },
        { id: "s2", salesman: null, net_amount: 900, sale_date: "2026-09-10T11:00:00+05:30" },
        { id: "s3", salesman: "RAVI", net_amount: 400, sale_date: "2026-09-10T12:00:00+05:30" },
      ],
      items: [
        { sale_id: "s1", quantity: 3 },
        { sale_id: "s2", quantity: 10 },
        { sale_id: "s3", quantity: 2 },
      ],
      employees,
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].employee_name).toBe("RAVI");
    expect(rows[0].total_qty).toBe(5);
    expect(rows[0].total_net_amount).toBe(1000);
    expect(rows[0].is_eligible).toBe(true);
    expect(rows[0].incentive_amount).toBe(10);
  });

  it("qty 4 → ineligible", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-10",
      sales: [
        { id: "s1", salesman: "RAVI", net_amount: 2000, sale_date: "2026-09-10T10:00:00+05:30" },
      ],
      items: [{ sale_id: "s1", quantity: 4 }],
      employees,
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });
    expect(rows[0].incentive_amount).toBe(0);
    expect(rows[0].is_eligible).toBe(false);
  });
});

describe("org gate", () => {
  it("only ADEEBAAREEBA is UI-gated", () => {
    expect(isDailyIncentiveUiOrg(ADEEBAAREEBA_ORG_ID)).toBe(true);
    expect(isDailyIncentiveUiOrg("other")).toBe(false);
  });
});
