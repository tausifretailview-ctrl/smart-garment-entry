import { describe, expect, it } from "vitest";
import { planInvoicePdfPages } from "@/utils/invoiceElementToPdf";

describe("planInvoicePdfPages", () => {
  it("keeps a bill that fits on one page at full width", () => {
    expect(planInvoicePdfPages(280, 297)).toEqual({ mode: "fit-page", drawWidthScale: 1 });
  });

  it("scales a slightly tall bill onto one page instead of cropping the EMI footer", () => {
    const plan = planInvoicePdfPages(310, 297);
    expect(plan.mode).toBe("fit-page");
    if (plan.mode !== "fit-page") return;
    expect(plan.drawWidthScale).toBeCloseTo(297 / 310);
    expect(310 * plan.drawWidthScale).toBeCloseTo(297);
  });

  it("paginates a bill that is much taller than one sheet", () => {
    expect(planInvoicePdfPages(420, 297)).toEqual({ mode: "paginate" });
  });
});
