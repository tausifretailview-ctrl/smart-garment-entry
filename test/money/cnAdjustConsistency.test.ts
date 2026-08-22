import { describe, expect, it, vi } from "vitest";
import {
  creditNoteLiveRemaining,
  formatCnApplyError,
  isSaleReturnConsumedAtBilling,
  resolveCnAvailableFromRows,
} from "@/utils/saleReturnCnBalance";
import { createReceiptVoucher, voucherMetaFromAdjustInvoiceRpc } from "@/utils/saleSettlement";

describe("P0-2 CN single writer — createReceiptVoucher guard", () => {
  it("rejects direct credit_note_adjustment voucher creation", async () => {
    const mockClient = {} as never;
    await expect(
      createReceiptVoucher(mockClient, {
        organizationId: "org-1",
        referenceId: "sale-1",
        amount: 500,
        paymentMethod: "credit_note_adjustment",
        description: "should not be allowed",
      }),
    ).rejects.toThrow(/adjust_invoice_balance/);
  });
});

describe("P0-2 CN single writer — adjust_invoice_balance jsonb payload", () => {
  it("reads voucher_entry_id from object response", () => {
    const meta = voucherMetaFromAdjustInvoiceRpc({
      success: true,
      voucher_entry_id: "ve-abc",
      voucher_number: "RCP/26-27/42",
      amount_applied: 1500,
    });
    expect(meta.voucherEntryId).toBe("ve-abc");
    expect(meta.voucherNumber).toBe("RCP/26-27/42");
  });

  it("reads voucher_entry_id from array-wrapped response", () => {
    const meta = voucherMetaFromAdjustInvoiceRpc([
      { voucher_entry_id: "ve-xyz", voucher_number: "RCP/26-27/99" },
    ]);
    expect(meta.voucherEntryId).toBe("ve-xyz");
    expect(meta.voucherNumber).toBe("RCP/26-27/99");
  });

  it("returns empty ids for null/invalid payload", () => {
    expect(voucherMetaFromAdjustInvoiceRpc(null)).toEqual({
      voucherEntryId: "",
      voucherNumber: "",
    });
    expect(voucherMetaFromAdjustInvoiceRpc("not-json")).toEqual({
      voucherEntryId: "",
      voucherNumber: "",
    });
  });
});

describe("P0-2 CN pool helpers — heal-down policy", () => {
  it("creditNoteLiveRemaining = credit_amount − used_amount", () => {
    expect(
      creditNoteLiveRemaining({ id: "cn-1", credit_amount: 5000, used_amount: 1200 }),
    ).toBe(3800);
    expect(creditNoteLiveRemaining({ id: "cn-1", credit_amount: 1000, used_amount: 1500 })).toBe(
      0,
    );
  });

  it("resolveCnAvailableFromRows prefers live CN remaining over stale CAB", () => {
    const available = resolveCnAvailableFromRows(
      {
        id: "sr-1",
        net_amount: 6000,
        credit_available_balance: 6000,
        credit_status: "pending",
      },
      { id: "cn-1", credit_amount: 5000, used_amount: 2000 },
    );
    expect(available).toBe(3000);
  });

  it("billing-absorbed return shows zero when no CN header and no applied hint", () => {
    const available = resolveCnAvailableFromRows(
      {
        id: "sr-1",
        net_amount: 6250,
        credit_available_balance: null,
        credit_status: "adjusted",
        credit_note_id: null,
        linked_sale_id: "sale-1",
      } as { id: string; net_amount: number; credit_available_balance: null; credit_status: string; credit_note_id: null; linked_sale_id: string },
      null,
    );
    expect(available).toBe(0);
  });

  it("isSaleReturnConsumedAtBilling detects adjusted + linked invoice", () => {
    expect(
      isSaleReturnConsumedAtBilling({ credit_status: "adjusted", linked_sale_id: "sale-1" }),
    ).toBe(true);
    expect(
      isSaleReturnConsumedAtBilling({ credit_status: "pending", linked_sale_id: "sale-1" }),
    ).toBe(false);
  });

  it("formatCnApplyError surfaces user-friendly CN balance message", () => {
    expect(formatCnApplyError(new Error("exceeds available credit note balance"))).toMatch(
      /live CN balance/i,
    );
  });
});
