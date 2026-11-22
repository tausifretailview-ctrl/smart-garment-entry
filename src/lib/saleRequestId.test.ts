import { describe, expect, it } from "vitest";
import { createSaleRequestTracker, sameSavedBillQuestion, saleRequestFingerprint } from "./saleRequestId";

const header = { sale_type: "pos", customer_id: null, customer_name: "Walk in Customer", net_amount: 999, payment_method: "cash", cash_amount: 999 };
const line = (qty: number) => ({ variant_id: "v1", product_name: "SHIRT", size: "M", quantity: qty, unit_price: 999, line_total: 999 * qty });

/** Review item B6: the same bill saved again carries the same request id. */
describe("sale request id", () => {
  it("the fingerprint ignores times and numbers, and changes with the bill", () => {
    const a = saleRequestFingerprint({ ...header, sale_date: "2026-11-22T10:00:00Z", sale_number: "POS/1" }, [line(1)]);
    const b = saleRequestFingerprint({ ...header, sale_date: "2026-11-22T10:00:07Z", sale_number: "POS/2" }, [line(1)]);
    expect(a).toBe(b);
    expect(saleRequestFingerprint(header, [line(2)])).not.toBe(a);
    expect(saleRequestFingerprint({ ...header, payment_method: "upi" }, [line(1)])).not.toBe(a);
    expect(saleRequestFingerprint({ ...header, customer_id: "c1" }, [line(1)])).not.toBe(a);
  });

  it("a failed attempt keeps its id for the retry of the same bill", () => {
    const t = createSaleRequestTracker(() => 1000);
    const first = t.idFor("bill-A");
    expect(t.idFor("bill-A")).toBe(first);
  });

  it("after a successful save the next bill gets a new id, even when it is identical", () => {
    const t = createSaleRequestTracker(() => 1000);
    const first = t.idFor("bill-A");
    t.saved();
    expect(t.idFor("bill-A")).not.toBe(first);
  });

  it("a changed bill, or one saved much later, gets a new id", () => {
    let now = 0;
    const t = createSaleRequestTracker(() => now, 60_000);
    const first = t.idFor("bill-A");
    expect(t.idFor("bill-B")).not.toBe(first);
    const again = t.idFor("bill-A");
    now = 61_000;
    expect(t.idFor("bill-A")).not.toBe(again);
  });

  it("fresh gives a new id that the next retry then keeps", () => {
    const t = createSaleRequestTracker(() => 1000);
    const first = t.idFor("bill-A");
    const fresh = t.fresh("bill-A");
    expect(fresh).not.toBe(first);
    expect(t.idFor("bill-A")).toBe(fresh);
  });

  it("the question names the saved bill and both choices", () => {
    const q = sameSavedBillQuestion({ sale_number: "POS/26-27/415", net_amount: 1200.4, created_at: "2026-11-22T07:11:00Z" });
    expect(q).toContain("POS/26-27/415 for ₹1,200");
    expect(q).toContain("OK = it is the same bill");
    expect(q).toContain("Cancel = it is a different sale");
  });
});
