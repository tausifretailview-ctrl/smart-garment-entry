import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectSaleIdsForReceiptDelete,
  creditNoteSaleForReceiptDelete,
  customerIdForReceiptBalanceRefresh,
  customerReceiptReversedAmount,
  isAdvanceAdjustmentReceipt,
  isCreditNoteAdjustmentReceipt,
  loadSalesTouchedByReceipt,
  type SaleTouchedByReceipt,
} from "./customerReceiptDeletePlan";

const POS = {
  id: "sale-pos",
  sale_number: "POS/25-26/667",
  customer_id: "cust-sarswati",
};
const SHORTER = {
  id: "sale-short",
  sale_number: "POS/25-26/66",
  customer_id: "cust-other",
};
const INV = {
  id: "sale-inv",
  sale_number: "INV/25-26/12",
  customer_id: "cust-sarswati",
};

describe("customer receipt delete plan", () => {
  it("reverses cash plus settlement discount", () => {
    expect(
      customerReceiptReversedAmount({ total_amount: 4100, discount_amount: 100 }),
    ).toBe(4200);
    expect(customerReceiptReversedAmount({ total_amount: 4100 })).toBe(4100);
  });

  it("resyncs the sale linked by reference_id", () => {
    expect(
      collectSaleIdsForReceiptDelete(
        {
          reference_type: "SALE",
          reference_id: POS.id,
          description: "Payment for POS/25-26/667",
        },
        [POS, SHORTER],
      ),
    ).toEqual([POS.id]);
  });

  it("resyncs the bill named in the description when reference_id is not that sale", () => {
    const ids = collectSaleIdsForReceiptDelete(
      {
        reference_type: "customer",
        reference_id: "cust-sarswati",
        description: "Payment for POS/25-26/667",
      },
      [POS, SHORTER, INV],
    );
    expect(ids).toEqual([POS.id]);
    expect(ids).not.toContain(SHORTER.id);
  });

  it("does not treat a customer id as a sale", () => {
    expect(
      collectSaleIdsForReceiptDelete(
        {
          reference_type: "customer",
          reference_id: "cust-sarswati",
          description: "Opening Balance Payment",
        },
        [POS],
      ),
    ).toEqual([]);
  });

  it("refreshes the invoice customer, or the customer on an opening-balance receipt", () => {
    expect(
      customerIdForReceiptBalanceRefresh(
        { reference_type: "sale", reference_id: POS.id, description: "Payment for POS/25-26/667" },
        [POS],
        [POS.id],
      ),
    ).toBe("cust-sarswati");
    expect(
      customerIdForReceiptBalanceRefresh(
        { reference_type: "customer", reference_id: "cust-sarswati", description: "Opening Balance Payment" },
        [POS],
        [],
      ),
    ).toBe("cust-sarswati");
    expect(
      customerIdForReceiptBalanceRefresh(
        { reference_type: "CustomerReceipt", reference_id: "cust-sarswati", description: "Advance received" },
        [],
        [],
      ),
    ).toBe("cust-sarswati");
  });

  it("picks the credit-note sale from reference_id, not a neighbouring bill number", () => {
    const cn = {
      reference_type: "sale",
      reference_id: POS.id,
      payment_method: "credit_note_adjustment",
      description: "CN (Return) Payment for POS/25-26/667 and INV/25-26/12",
    };
    const sales: SaleTouchedByReceipt[] = [POS, INV];
    const ids = collectSaleIdsForReceiptDelete(cn, sales);
    expect(creditNoteSaleForReceiptDelete(cn, sales, ids)?.id).toBe(POS.id);
    expect(isCreditNoteAdjustmentReceipt(cn)).toBe(true);
    expect(isAdvanceAdjustmentReceipt({ payment_method: "advance_adjustment" })).toBe(true);
  });

  it("loads the referenced sale and the bill named in the description for this org only", async () => {
    const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
    const client = {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          in(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          is(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          maybeSingle: async () => {
            calls.push({ table, filters: [...filters] });
            return { data: { ...POS }, error: null };
          },
          then(resolve: (value: { data: SaleTouchedByReceipt[]; error: null }) => void) {
            calls.push({ table, filters: [...filters] });
            resolve({ data: [{ ...POS }], error: null });
          },
        };
        return builder;
      },
    };

    const sales = await loadSalesTouchedByReceipt(client as never, "org-1", {
      reference_type: "sale",
      reference_id: POS.id,
      description: "Payment for POS/25-26/667",
    });

    expect(sales.map((sale) => sale.id)).toEqual([POS.id]);
    expect(calls.every((call) => call.table === "sales")).toBe(true);
    expect(calls.every((call) => call.filters.some(([column, value]) => column === "organization_id" && value === "org-1"))).toBe(true);
    expect(calls[1]?.filters).toContainEqual(["sale_number", ["POS/25-26/667"]]);
    expect(calls[0]?.filters).toContainEqual(["deleted_at", null]);
  });
});

describe("Customer Payment receipt delete UI", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/accounts/CustomerPaymentTab.tsx"),
    "utf8",
  );
  const deleteBlock = source.slice(
    source.indexOf("const deleteReceipt = useMutation"),
    source.indexOf("const handleBulkDeleteReceipts"),
  );

  it("puts a delete action on each receipt row and resyncs the linked customer", () => {
    expect(deleteBlock).toContain("loadSalesTouchedByReceipt");
    expect(deleteBlock).toContain("collectSaleIdsForReceiptDelete");
    expect(deleteBlock).toContain("syncSalePaymentFromVouchers");
    expect(deleteBlock).toContain('.eq("organization_id", organizationId)');
    expect(deleteBlock).toContain('queryKey: ["customer-invoices"]');
    expect(deleteBlock).toContain("invalidateCustomerFinancialSnapshot(queryClient, organizationId, customerId)");
    expect(deleteBlock).not.toContain('payment.reference_type === "sale"');
    expect(source.match(/title="Delete Receipt"/g)?.length).toBe(2);
  });
});
