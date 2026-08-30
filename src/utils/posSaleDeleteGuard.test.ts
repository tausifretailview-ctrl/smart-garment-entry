import { describe, expect, it } from "vitest";
import {
  decidePosSaveAutoRollback,
  POS_BULK_DELETE_CONFIRM_WORD,
  requiresTypedPosDeleteConfirm,
  selectionIncludesProtectedPosSale,
  typedBulkDeleteMatches,
  typedSaleNumberMatches,
} from "@/utils/posSaleDeleteGuard";

describe("decidePosSaveAutoRollback", () => {
  it("allows rollback of an empty unsettled header", () => {
    expect(
      decidePosSaveAutoRollback({
        saleType: "pos",
        paymentStatus: "pending",
        itemCount: 0,
      }),
    ).toEqual({ action: "rollback_empty_header" });
  });

  it("keeps a sale that already has line items", () => {
    const decision = decidePosSaveAutoRollback({
      saleType: "pos",
      paymentStatus: "completed",
      itemCount: 1,
    });
    expect(decision.action).toBe("keep_sale");
  });

  it("keeps a settled sale even with zero counted items", () => {
    const decision = decidePosSaveAutoRollback({
      saleType: "pos",
      paymentStatus: "completed",
      itemCount: 0,
    });
    expect(decision.action).toBe("keep_sale");
  });

  it("keeps a partial sale", () => {
    const decision = decidePosSaveAutoRollback({
      saleType: "pos",
      paymentStatus: "partial",
      itemCount: 0,
    });
    expect(decision.action).toBe("keep_sale");
  });
});

describe("typed POS delete confirm", () => {
  it("matches sale numbers case-insensitively", () => {
    expect(typedSaleNumberMatches("pos/26-27/480", "POS/26-27/480")).toBe(true);
    expect(typedSaleNumberMatches("POS/26-27/481", "POS/26-27/480")).toBe(false);
    expect(typedSaleNumberMatches("  POS/26-27/480  ", "POS/26-27/480")).toBe(true);
  });

  it("requires typed confirm for completed POS, not cancelled or hold", () => {
    expect(
      requiresTypedPosDeleteConfirm({
        sale_type: "pos",
        payment_status: "completed",
        is_cancelled: false,
      }),
    ).toBe(true);
    expect(
      requiresTypedPosDeleteConfirm({
        sale_type: "pos",
        payment_status: "completed",
        is_cancelled: true,
      }),
    ).toBe(false);
    expect(
      requiresTypedPosDeleteConfirm({
        sale_type: "pos",
        payment_status: "hold",
        is_cancelled: false,
      }),
    ).toBe(false);
    expect(
      requiresTypedPosDeleteConfirm({
        sale_type: "sale_invoice",
        payment_status: "completed",
        is_cancelled: false,
      }),
    ).toBe(false);
  });

  it("flags a bulk selection that includes a completed POS bill", () => {
    expect(
      selectionIncludesProtectedPosSale([
        { sale_type: "pos", payment_status: "hold", is_cancelled: false },
        { sale_type: "pos", payment_status: "completed", is_cancelled: false },
      ]),
    ).toBe(true);
    expect(
      selectionIncludesProtectedPosSale([
        { sale_type: "pos", payment_status: "completed", is_cancelled: true },
      ]),
    ).toBe(false);
  });

  it("accepts the bulk confirm word", () => {
    expect(typedBulkDeleteMatches("delete")).toBe(true);
    expect(typedBulkDeleteMatches(POS_BULK_DELETE_CONFIRM_WORD)).toBe(true);
    expect(typedBulkDeleteMatches("remove")).toBe(false);
  });
});
