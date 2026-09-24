import { describe, expect, it } from "vitest";
import { buildExchangeExcessSaleReturn } from "./exchangeExcessSaleReturn";

const BASE = {
  organizationId: "b230c582-4f0b-420f-b18b-bef26c2f5ce8",
  creditNoteId: "cn-8",
  creditNoteNumber: "CN/26-27/8",
  customerId: "cust-ziba",
  customerName: "ZIBA",
  amount: 700.0005,
  returnDate: "2026-09-22",
  returnNumber: "SR/26-27/99",
  saleNumber: "POS/26-27/323",
};

describe("buildExchangeExcessSaleReturn", () => {
  it("creates a pending unlinked parent for the excess only", () => {
    const row = buildExchangeExcessSaleReturn(BASE);
    expect(row).toMatchObject({
      organization_id: BASE.organizationId,
      customer_id: "cust-ziba",
      customer_name: "ZIBA",
      net_amount: 700,
      gross_amount: 700,
      gst_amount: 0,
      credit_available_balance: 700,
      credit_status: "pending",
      credit_note_id: "cn-8",
      refund_type: "credit_note",
      linked_sale_id: null,
      original_sale_number: "POS/26-27/323",
      return_number: "SR/26-27/99",
    });
    expect(String(row?.notes)).toContain("CN/26-27/8");
    expect(String(row?.notes)).toContain("POS/26-27/323");
  });

  it("rejects a zero excess", () => {
    expect(buildExchangeExcessSaleReturn({ ...BASE, amount: 0 })).toBeNull();
  });
});
