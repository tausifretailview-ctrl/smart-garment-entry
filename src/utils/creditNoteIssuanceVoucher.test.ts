import { describe, expect, it } from "vitest";
import { buildCreditNoteIssuanceVoucher } from "./creditNoteIssuanceVoucher";

const BASE = {
  organizationId: "org-1",
  voucherNumber: "VCH/26-27/42",
  customerId: "cust-1",
  creditNoteNumber: "CN/26-27/8",
  saleNumber: "POS/26-27/323",
  creditAmount: 700,
  voucherDate: "2026-09-22",
  createdBy: "user-1",
};

describe("buildCreditNoteIssuanceVoucher", () => {
  it("builds the RPC-readable linkage row", () => {
    const row = buildCreditNoteIssuanceVoucher(BASE);
    expect(row).toMatchObject({
      organization_id: "org-1",
      voucher_number: "VCH/26-27/42",
      voucher_type: "credit_note",
      voucher_date: "2026-09-22",
      reference_type: "customer",
      reference_id: "cust-1",
      total_amount: 700,
      created_by: "user-1",
    });
    expect(row?.description).toContain("CN/26-27/8");
    expect(row?.description).toContain("POS/26-27/323");
  });

  it("never sets trigger-sensitive columns", () => {
    const row = buildCreditNoteIssuanceVoucher(BASE);
    expect(row).not.toHaveProperty("payment_method");
    expect(row).not.toHaveProperty("source_document_id");
  });

  it("works without a sale number", () => {
    const row = buildCreditNoteIssuanceVoucher({ ...BASE, saleNumber: null });
    expect(row?.description).toContain("CN/26-27/8");
    expect(row?.description).not.toContain("invoice");
  });

  it("returns null for walk-ins (no customer record to link)", () => {
    expect(buildCreditNoteIssuanceVoucher({ ...BASE, customerId: "" })).toBeNull();
  });

  it("returns null for non-positive amounts and missing keys", () => {
    expect(buildCreditNoteIssuanceVoucher({ ...BASE, creditAmount: 0 })).toBeNull();
    expect(buildCreditNoteIssuanceVoucher({ ...BASE, creditAmount: -5 })).toBeNull();
    expect(buildCreditNoteIssuanceVoucher({ ...BASE, voucherNumber: "" })).toBeNull();
    expect(buildCreditNoteIssuanceVoucher({ ...BASE, organizationId: "" })).toBeNull();
  });

  it("rounds to paise", () => {
    const row = buildCreditNoteIssuanceVoucher({ ...BASE, creditAmount: 700.005 });
    expect(row?.total_amount).toBe(700.01);
  });
});
