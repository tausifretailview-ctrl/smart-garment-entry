import { describe, expect, it, vi } from "vitest";
import { runCustomerAccountAudit } from "../src/utils/customerAccountAudit";

describe("runCustomerAccountAudit", () => {
  it("reports receipts_exceed_invoice in shopkeeper language and never writes", async () => {
    const from = vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { customer_name: "PARISHMA MEMON" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "sales") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({
                  data: [{ id: "sale-1653", sale_number: "INV/26-27/1653" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "v_accounting_invariants") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({
                  data: [
                    {
                      check_name: "receipts_exceed_invoice",
                      detail: 5120,
                      entity_id: "sale-1653",
                      entity_ref: "INV/26-27/1653",
                      organization_id: "org-1",
                    },
                    {
                      check_name: "rapid_duplicate_receipt",
                      detail: 2,
                      entity_id: "sale-1653",
                      entity_ref: "INV/26-27/1653",
                      organization_id: "org-1",
                    },
                    {
                      check_name: "receipts_exceed_invoice",
                      detail: 99,
                      entity_id: "other-sale",
                      entity_ref: "INV/OTHER",
                      organization_id: "org-1",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const insert = vi.fn();
    const update = vi.fn();
    const client = { from, insert, update } as never;

    const report = await runCustomerAccountAudit(client, {
      organizationId: "org-1",
      customerId: "cust-1",
    });

    expect(report.clean).toBe(false);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0].headline).toContain("INV/26-27/1653");
    expect(report.findings[0].detail).toMatch(/Contact support/i);
    expect(report.findings.some((f) => f.checkName === "rapid_duplicate_receipt")).toBe(true);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // Read-only: sales + invariants + customers only — never voucher_entries writes.
    expect(from.mock.calls.map((c) => c[0]).sort()).toEqual(
      ["customers", "sales", "v_accounting_invariants"].sort(),
    );
  });

  it("reports clean when no invariants match this customer", async () => {
    const from = vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { customer_name: "CLEAN CUSTOMER" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "sales") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({
                  data: [{ id: "sale-1", sale_number: "INV/1" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "v_accounting_invariants") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({
                  data: [
                    {
                      check_name: "receipts_exceed_invoice",
                      detail: 10,
                      entity_id: "someone-else",
                      entity_ref: "INV/999",
                      organization_id: "org-1",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const report = await runCustomerAccountAudit({ from } as never, {
      organizationId: "org-1",
      customerId: "cust-clean",
      customerName: "CLEAN CUSTOMER",
    });

    expect(report.clean).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
