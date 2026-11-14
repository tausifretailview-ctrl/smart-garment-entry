import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { nextSequenceFrom, planSaleNumberPreview } from "@/utils/saleNumber";

/** The next-invoice-number preview, one shared helper for every numbering style (Plan Phase 4, S4). */
describe("planSaleNumberPreview", () => {
  const nov2026 = new Date("2026-11-14T10:00:00+05:30");
  const feb2027 = new Date("2027-02-10T10:00:00+05:30");

  it("default series follows the Indian financial year", () => {
    expect(planSaleNumberPreview(null, nov2026).likePattern).toBe("INV/26-27/%");
    expect(planSaleNumberPreview(null, feb2027).likePattern).toBe("INV/26-27/%");
    expect(planSaleNumberPreview({}, nov2026).render(7)).toBe("INV/26-27/7");
  });

  it("a custom {###} format pads the number and honours Series Start From", () => {
    const plan = planSaleNumberPreview({ invoice_numbering_format: "SHOP/{####}", invoice_series_start: "SHOP/0120" }, nov2026);
    expect(plan.likePattern).toBe("SHOP/%");
    expect(plan.minSequence).toBe(121);
    expect(plan.render(121)).toBe("SHOP/0121");
  });

  it("a literal format treats its trailing digits as the sequence", () => {
    const plan = planSaleNumberPreview({ invoice_numbering_format: "BILL-100" }, nov2026);
    expect(plan.likePattern).toBe("BILL-%");
    expect(plan.render(5)).toBe("BILL-005");
  });

  it("a format with no digits gets the sequence appended", () => {
    expect(planSaleNumberPreview({ invoice_numbering_format: "TX/" }, nov2026).render(3)).toBe("TX/003");
  });
});

describe("nextSequenceFrom", () => {
  it("is the highest trailing number + 1, never below the series start", () => {
    expect(nextSequenceFrom(["INV/26-27/9", "INV/26-27/12", "INV/26-27/3"], 1)).toBe(13);
    expect(nextSequenceFrom([], 1)).toBe(1);
    expect(nextSequenceFrom(["SHOP/0004"], 121)).toBe(121);
  });
});
