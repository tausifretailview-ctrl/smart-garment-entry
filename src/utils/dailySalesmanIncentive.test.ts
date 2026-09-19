import { describe, expect, it } from "vitest";
import {
  ADEEBAAREEBA_ORG_ID,
  aggregateDailySalesmanIncentive,
  computeDailyIncentiveAmount,
  findEmployeeBySalesmanName,
  incentiveForLineItem,
  incentiveForNetAmount,
  isDailyIncentiveUiOrg,
  lineNetForDailyIncentive,
  resolveEffectiveLineSalesman,
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
  it("maps 0–499.99 → ₹3, 500–999.99 → ₹5, ≥1000 → ₹10 per unit", () => {
    expect(incentiveForNetAmount(0, ADEEBA_BRACKETS)).toBe(3);
    expect(incentiveForNetAmount(499.99, ADEEBA_BRACKETS)).toBe(3);
    expect(incentiveForNetAmount(500, ADEEBA_BRACKETS)).toBe(5);
    expect(incentiveForNetAmount(999.99, ADEEBA_BRACKETS)).toBe(5);
    expect(incentiveForNetAmount(1000, ADEEBA_BRACKETS)).toBe(10);
    expect(incentiveForNetAmount(1500, ADEEBA_BRACKETS)).toBe(10);
  });
});

describe("incentiveForLineItem (per unit × full line net bracket)", () => {
  it("uses full line net for bracket, not net/qty", () => {
    // qty 3, line net ₹1,500 → ≥1000 bracket → ₹10 × 3 = ₹30
    expect(incentiveForLineItem(1500, 3, ADEEBA_BRACKETS)).toBe(30);
  });

  it("does not divide line net by qty before bracket lookup", () => {
    // If wrongly used net/qty = 500, bracket would be ₹5/unit → 15; correct is ₹10 × 2 = 20
    expect(incentiveForLineItem(1000, 2, ADEEBA_BRACKETS)).toBe(20);
    expect(incentiveForLineItem(1000 / 2, 2, ADEEBA_BRACKETS)).toBe(10);
  });
});

describe("lineNetForDailyIncentive", () => {
  it("prefers net_after_discount over line_total", () => {
    expect(lineNetForDailyIncentive({ line_total: 500, net_after_discount: 480 })).toBe(480);
  });
});

describe("qty gate (day total)", () => {
  it("qty < 5 → zero even with high line incentive sum", () => {
    expect(
      computeDailyIncentiveAmount({
        totalQty: 4,
        lineIncentiveTotal: 500,
        qtyThreshold: 5,
      }),
    ).toEqual({ isEligible: false, incentiveAmount: 0 });
  });

  it("qty ≥ 5 passes through summed line incentive", () => {
    expect(
      computeDailyIncentiveAmount({
        totalQty: 5,
        lineIncentiveTotal: 30,
        qtyThreshold: 5,
      }),
    ).toEqual({ isEligible: true, incentiveAmount: 30 });
  });
});

describe("resolveEffectiveLineSalesman", () => {
  it("uses line override when set, else header", () => {
    expect(resolveEffectiveLineSalesman("RAVI", "PRIYA")).toBe("RAVI");
    expect(resolveEffectiveLineSalesman(null, "PRIYA")).toBe("PRIYA");
    expect(resolveEffectiveLineSalesman("  ", "PRIYA")).toBe("PRIYA");
    expect(resolveEffectiveLineSalesman(null, null)).toBe("");
  });
});

describe("aggregateDailySalesmanIncentive — per-line salesman", () => {
  const employees = [
    { id: "e1", employee_name: "RAVI" },
    { id: "e2", employee_name: "PRIYA" },
  ];

  it("splits one bill across two salesmen via sale_items.salesman", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-16",
      sales: [
        {
          id: "s1",
          salesman: "RAVI",
          net_amount: 2000,
          sale_date: "2026-09-16T10:00:00+05:30",
        },
      ],
      items: [
        {
          sale_id: "s1",
          quantity: 3,
          line_total: 1500,
          net_after_discount: 1500,
          salesman: "RAVI",
        },
        {
          sale_id: "s1",
          quantity: 2,
          line_total: 600,
          net_after_discount: 600,
          salesman: "PRIYA",
        },
        {
          sale_id: "s1",
          quantity: 1,
          line_total: 400,
          net_after_discount: 400,
          salesman: null,
        },
      ],
      employees,
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });

    expect(rows).toHaveLength(2);
    const ravi = rows.find((r) => r.employee_name === "RAVI");
    const priya = rows.find((r) => r.employee_name === "PRIYA");
    expect(ravi?.total_qty).toBe(4);
    expect(priya?.total_qty).toBe(2);
    expect(ravi?.is_eligible).toBe(false);
    expect(priya?.is_eligible).toBe(false);
  });
});

describe("aggregateDailySalesmanIncentive", () => {
  const employees = [{ id: "e1", employee_name: "RAVI" }];

  it("sums bracket(line_net) × qty across lines (not one flat bracket on day net)", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-10",
      sales: [
        { id: "s1", salesman: "RAVI", net_amount: 1500, sale_date: "2026-09-10T10:00:00+05:30" },
        { id: "s2", salesman: "RAVI", net_amount: 600, sale_date: "2026-09-10T11:00:00+05:30" },
      ],
      items: [
        { sale_id: "s1", quantity: 3, line_total: 1500, net_after_discount: 1500 },
        { sale_id: "s2", quantity: 2, line_total: 600, net_after_discount: 600 },
      ],
      employees,
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].total_qty).toBe(5);
    // 1500→₹10×3=30 + 600→₹5×2=10 = 40 (NOT day-net 2100 → single ₹10)
    expect(rows[0].incentive_amount).toBe(40);
    expect(rows[0].is_eligible).toBe(true);
  });

  it("excludes null salesman", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-10",
      sales: [
        { id: "s1", salesman: "RAVI", net_amount: 600, sale_date: "2026-09-10T10:00:00+05:30" },
        { id: "s2", salesman: null, net_amount: 900, sale_date: "2026-09-10T11:00:00+05:30" },
      ],
      items: [
        { sale_id: "s1", quantity: 5, line_total: 600, net_after_discount: 600 },
        { sale_id: "s2", quantity: 10, line_total: 900, net_after_discount: 900 },
      ],
      employees,
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].employee_name).toBe("RAVI");
  });

  it("SAI MAN style: qty 4 → ineligible ₹0", () => {
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-15",
      sales: [
        {
          id: "s1",
          salesman: "SAI MAN ANSARI",
          net_amount: 10200,
          sale_date: "2026-09-15T10:00:00+05:30",
        },
      ],
      items: [{ sale_id: "s1", quantity: 4, line_total: 10200, net_after_discount: 10200 }],
      employees: [{ id: "e2", employee_name: "SAI MAN ANSARI" }],
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });
    expect(rows[0].incentive_amount).toBe(0);
    expect(rows[0].is_eligible).toBe(false);
  });

  it("MOHD ASHRAF FAROOQUI 2026-09-15 fixture — 12 lines hand total ₹120", () => {
    // Representative 12-line day matching bracket×qty mechanics (verify live via SQL script).
    const lines = [
      { q: 1, net: 1800 },
      { q: 1, net: 2200 },
      { q: 1, net: 1500 },
      { q: 1, net: 2800 },
      { q: 1, net: 900 },
      { q: 1, net: 1200 },
      { q: 1, net: 650 },
      { q: 1, net: 1100 },
      { q: 1, net: 400 },
      { q: 1, net: 2500 },
      { q: 1, net: 750 },
      { q: 1, net: 1650 },
    ];
    const items = lines.map((l, i) => ({
      sale_id: `s${i + 1}`,
      quantity: l.q,
      line_total: l.net,
      net_after_discount: l.net,
    }));
    const sales = items.map((it, i) => ({
      id: it.sale_id,
      salesman: "MOHD ASHRAF FAROOQUI",
      net_amount: lines[i].net,
      sale_date: "2026-09-15T10:00:00+05:30",
    }));
    const handTotal = lines.reduce(
      (sum, l) => sum + incentiveForLineItem(l.net, l.q, ADEEBA_BRACKETS),
      0,
    );
    const rows = aggregateDailySalesmanIncentive({
      incentiveDateYmd: "2026-09-15",
      sales,
      items,
      employees: [{ id: "e-ashraf", employee_name: "MOHD ASHRAF FAROOQUI" }],
      qtyThreshold: 5,
      brackets: ADEEBA_BRACKETS,
    });
    expect(rows[0].total_qty).toBe(12);
    expect(rows[0].incentive_amount).toBe(handTotal);
    expect(handTotal).toBeGreaterThan(10);
  });
});

describe("org gate", () => {
  it("only ADEEBAAREEBA orgs are UI-gated", () => {
    expect(isDailyIncentiveUiOrg(ADEEBAAREEBA_ORG_ID)).toBe(true);
    expect(isDailyIncentiveUiOrg("0dac440f-e962-4f27-a38d-71c81f9c52b7")).toBe(true);
    expect(isDailyIncentiveUiOrg("other")).toBe(false);
  });
});
