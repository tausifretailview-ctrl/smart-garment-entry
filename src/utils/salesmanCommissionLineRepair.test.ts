import { describe, expect, it } from "vitest";
import { enrichCommissionsWithSaleItems } from "./salesmanCommissionDisplay";
import {
  ADEEBAAREEBA_COMMISSION_REPAIR_ORG_ID,
  buildSalesmanCommissionRecords,
  COMMISSION_LINE_SALESMAN_REPAIR_TAG,
  planCommissionLineSalesmanRepair,
} from "./salesmanCommissionLineRepair";

const employees = [
  { id: "e-header", employee_name: "MOHD ASHRAF FAROOQUI", commission_percent: 1 },
  { id: "e-zahir", employee_name: "ZAHIR JR.", commission_percent: 1 },
  { id: "e-salman", employee_name: "SALMAN ANSARI", commission_percent: 2 },
];

describe("planCommissionLineSalesmanRepair", () => {
  it("moves ADEEBAAREEBA header commission qty onto the line salesman", () => {
    const changes = planCommissionLineSalesmanRepair(
      [
        {
          id: "c1",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          sale_amount: 900,
          employee_name: "MOHD ASHRAF FAROOQUI",
          employee_id: "e-header",
          commission_amount: 9,
          payment_status: "pending",
        },
        {
          id: "c2",
          sale_id: "s1",
          product_id: "p2",
          product_name: "Dupatta",
          sale_amount: 400,
          employee_name: "MOHD ASHRAF FAROOQUI",
          employee_id: "e-header",
          commission_amount: 8,
          payment_status: "paid",
        },
      ],
      [
        {
          id: "i1",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          quantity: 2,
          net_after_discount: 900,
          salesman: "ZAHIR JR.",
          headerSalesman: "MOHD ASHRAF FAROOQUI",
        },
        {
          id: "i2",
          sale_id: "s1",
          product_id: "p2",
          product_name: "Dupatta",
          quantity: 1,
          net_after_discount: 400,
          salesman: "SALMAN ANSARI",
          headerSalesman: "MOHD ASHRAF FAROOQUI",
        },
      ],
      employees,
    );

    expect(changes).toEqual([
      expect.objectContaining({
        id: "c1",
        fromEmployeeName: "MOHD ASHRAF FAROOQUI",
        toEmployeeName: "ZAHIR JR.",
        toEmployeeId: "e-zahir",
        quantity: 2,
        commissionAmount: 9,
        paymentStatus: "pending",
        notes: COMMISSION_LINE_SALESMAN_REPAIR_TAG,
      }),
      expect.objectContaining({
        id: "c2",
        toEmployeeName: "SALMAN ANSARI",
        toEmployeeId: "e-salman",
        quantity: 1,
        commissionAmount: 8,
        paymentStatus: "paid",
      }),
    ]);
    expect(ADEEBAAREEBA_COMMISSION_REPAIR_ORG_ID).toBe("b230c582-4f0b-420f-b18b-bef26c2f5ce8");
  });

  it("leaves a line that already belongs to the header salesman", () => {
    const changes = planCommissionLineSalesmanRepair(
      [
        {
          id: "c1",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          sale_amount: 900,
          employee_name: "MOHD ASHRAF FAROOQUI",
          commission_amount: 9,
          payment_status: "pending",
        },
      ],
      [
        {
          id: "i1",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          quantity: 2,
          net_after_discount: 900,
          salesman: null,
          headerSalesman: "MOHD ASHRAF FAROOQUI",
        },
      ],
      employees,
    );
    expect(changes).toEqual([]);
  });

  it("does not swap qty when two lines share a product and the rows were already split", () => {
    const lines = [
      {
        id: "i1",
        sale_id: "s1",
        product_id: "p1",
        product_name: "Kurti",
        quantity: 1,
        net_after_discount: 500,
        salesman: "ZAHIR JR.",
      },
      {
        id: "i2",
        sale_id: "s1",
        product_id: "p1",
        product_name: "Kurti",
        quantity: 5,
        net_after_discount: 2000,
        salesman: "SALMAN ANSARI",
      },
    ];
    const enriched = enrichCommissionsWithSaleItems(
      [
        {
          id: "c-b",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          sale_amount: 2000,
          employee_name: "SALMAN ANSARI",
          commission_percent: 1,
        },
        {
          id: "c-a",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Kurti",
          sale_amount: 500,
          employee_name: "ZAHIR JR.",
          commission_percent: 1,
        },
      ],
      lines,
    );
    const zahir = enriched.find((row) => row.employee_name === "ZAHIR JR.");
    const salman = enriched.find((row) => row.employee_name === "SALMAN ANSARI");
    expect(zahir?.qty).toBe(1);
    expect(salman?.qty).toBe(5);
  });
});

describe("buildSalesmanCommissionRecords", () => {
  it("books each piece to the line salesman, not the bill header", () => {
    const records = buildSalesmanCommissionRecords({
      organizationId: ADEEBAAREEBA_COMMISSION_REPAIR_ORG_ID,
      saleId: "s1",
      saleNumber: "POS/26-27/10",
      saleDate: "2026-10-04",
      customerName: "AZRA",
      headerSalesman: "MOHD ASHRAF FAROOQUI",
      totalNetAmount: 1300,
      items: [
        {
          product_id: "p1",
          product_name: "Kurti",
          quantity: 2,
          net_after_discount: 900,
          salesman: "ZAHIR JR.",
        },
        {
          product_id: "p2",
          product_name: "Dupatta",
          quantity: 1,
          net_after_discount: 400,
          salesman: null,
        },
      ],
      productsById: {},
      employees,
      rules: [],
    });
    expect(records.map((row) => [row.employee_name, row.sale_amount, row.commission_amount])).toEqual([
      ["ZAHIR JR.", 900, 9],
      ["MOHD ASHRAF FAROOQUI", 400, 4],
    ]);
  });
});
