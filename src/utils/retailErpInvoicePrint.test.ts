import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LETTERPAD_COMPOSITION_DECLARATION,
  allocateByGrossWeight,
  retailErpDisplayDiscount,
  retailErpLetterpadNoteText,
  coalesceCrmPointsPrint,
  resolveSaleCrmPointsPrint,
  retailErpNoteWithCrmPoints,
  crmPointsPrintSnapshot,
  retailErpLineDisplayRate,
  retailErpLineGross,
  retailErpLinePrintPlan,
  retailErpPoolDisposition,
} from "./retailErpInvoicePrint";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa A5 billed unit rate (POS unit-price edit)", () => {
  /** POS/26-27/1892: qty 2, edited unit ₹2,750, master/MRP ₹4,000, net ₹5,500. */
  const line = { mrp: 4_000, rate: 2_750, qty: 2, total: 5_500 };

  it("prints the edited unit price in Rate, not the old sale price / MRP", () => {
    expect(retailErpLineDisplayRate(line, true)).toBe(2_750);
    expect(retailErpLineGross(line, true)).toBe(5_500);
  });

  it("does not reprint the MRP−unit gap as Discount when Rate is the billed unit", () => {
    const subTotal = retailErpLineGross(line, true);
    const merchandiseNet = 5_500;
    const computed = Math.max(0, subTotal - merchandiseNet);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 2_500,
        computedFromLines: computed,
      }),
    ).toBe(0);
  });

  it("standard Retail ERP still shows list/MRP in Rate and the gap as Discount", () => {
    expect(retailErpLineDisplayRate(line, false)).toBe(4_000);
    expect(retailErpLineGross(line, false)).toBe(8_000);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: false,
        propDiscount: 2_500,
        computedFromLines: 2_500,
      }),
    ).toBe(2_500);
  });

  it("keeps an explicit bill discount (flat / Disc%) under billed unit rates", () => {
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 500,
        computedFromLines: 500,
      }),
    ).toBe(500);
  });
});

describe("Retail ERP bill pool vs printed line amounts", () => {
  it("gives the last line the remainder so shares sum to the pool", () => {
    const shares = allocateByGrossWeight([100, 100, 100], 1);
    expect(shares).toEqual([0.33, 0.33, 0.34]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 2);
  });

  it("treats a sub-rupee pool with no stored discount as round-off dust", () => {
    expect(
      retailErpPoolDisposition({
        flatDiscountPool: 0.56,
        propDiscount: 0,
        roundOffRowHidden: false,
      }),
    ).toBe("round-off");
    const plan = retailErpLinePrintPlan({
      grosses: [1470, 4428, 4480],
      lineTotals: [1470, 4428, 4480],
      displayDiscount: 0.56,
      propDiscount: 0,
      roundOffRowHidden: false,
    });
    expect(plan.flatDiscountPool).toBe(0.56);
    expect(plan.disposition).toBe("round-off");
    expect(plan.lineNetAmounts).toEqual([1470, 4428, 4480]);
  });

  it("keeps a sub-rupee stored discount on the discount row instead of smearing lines", () => {
    const plan = retailErpLinePrintPlan({
      grosses: [100, 200],
      lineTotals: [100, 200],
      displayDiscount: 0.56,
      propDiscount: 0.56,
      roundOffRowHidden: false,
    });
    expect(plan.disposition).toBe("discount-row");
    expect(plan.lineNetAmounts).toEqual([100, 200]);
  });

  it("keeps sub-rupee dust on the discount row when Round Off is hidden", () => {
    expect(
      retailErpPoolDisposition({
        flatDiscountPool: 0.56,
        propDiscount: 0,
        roundOffRowHidden: true,
      }),
    ).toBe("discount-row");
  });

  it("still allocates a genuine bill discount of at least one rupee", () => {
    const plan = retailErpLinePrintPlan({
      grosses: [100, 100, 100],
      lineTotals: [100, 100, 100],
      displayDiscount: 50,
      propDiscount: 50,
      roundOffRowHidden: false,
    });
    expect(plan.disposition).toBe("allocate");
    expect(plan.lineNetAmounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(250, 2);
    expect(plan.lineBillDiscounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(50, 2);
  });

  it("does not treat an existing per-line discount as the bill pool", () => {
    const plan = retailErpLinePrintPlan({
      grosses: [200, 200],
      lineTotals: [150, 150],
      displayDiscount: 100.56,
      propDiscount: 100.56,
      roundOffRowHidden: false,
    });
    expect(plan.flatDiscountPool).toBe(0.56);
    expect(plan.disposition).toBe("discount-row");
    expect(plan.lineNetAmounts).toEqual([150, 150]);
  });

  it("allocates a ₹1.00 pool and leaves ₹0.99 as dust", () => {
    expect(
      retailErpPoolDisposition({ flatDiscountPool: 1, propDiscount: 1, roundOffRowHidden: false }),
    ).toBe("allocate");
    expect(
      retailErpPoolDisposition({
        flatDiscountPool: 0.99,
        propDiscount: 0,
        roundOffRowHidden: false,
      }),
    ).toBe("round-off");
  });
});

describe("preprinted letter-pad Note declaration", () => {
  it("wires the helper into the Retail ERP Note: block", () => {
    const template = readFileSync(
      resolve(here, "../components/invoice-templates/RetailERPTemplate.tsx"),
      "utf8",
    );
    expect(template).toContain("retailErpLetterpadNoteText");
    expect(template).toContain("Note:");
  });

  it("fills the Note section with the composition declaration on letter-pad", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "",
        declarationText: "",
      }),
    ).toBe(LETTERPAD_COMPOSITION_DECLARATION);
  });

  it("does not add the declaration on standard Retail ERP", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: false,
        saleNote: "",
        declarationText: "",
      }),
    ).toBe("");
  });

  it("keeps an existing sale note and appends the declaration", () => {
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "Handle with care",
        declarationText: "",
      }),
    ).toBe(`Handle with care\n${LETTERPAD_COMPOSITION_DECLARATION}`);
  });

  it("uses Settings declaration text when it is not the generic certified line", () => {
    const custom = "Composition taxable person, not eligible to collect tax on supplies.";
    expect(
      retailErpLetterpadNoteText({
        isPreprinted: true,
        saleNote: "",
        declarationText: custom,
      }),
    ).toBe(custom);
  });
});

describe("Retail ERP Note CRM points", () => {
  it("leaves the note unchanged when CRM is off", () => {
    expect(
      retailErpNoteWithCrmPoints("Handle with care", {
        crmEnabled: false,
        pointsBalance: 40,
      }),
    ).toBe("Handle with care");
  });

  it("shows the balance in the Note section when CRM is on", () => {
    expect(
      retailErpNoteWithCrmPoints("", {
        crmEnabled: true,
        pointsBalance: 40,
      }),
    ).toBe("CRM Points: 40");
  });

  it("keeps the sale note and adds redeemed points", () => {
    expect(
      retailErpNoteWithCrmPoints("Gift wrap", {
        crmEnabled: true,
        pointsBalance: 10,
        pointsRedeemed: 5,
      }),
    ).toBe("Gift wrap\nCRM Points: 10\nRedeemed: 5");
  });

  it("omits the line for a walk-in with no balance", () => {
    expect(crmPointsPrintSnapshot({ crmEnabled: true, customerId: "", balanceBefore: 80, pointsEarned: 4 })).toEqual({});
  });

  it("adds points earned on this bill and drops earn when points are redeemed", () => {
    expect(
      crmPointsPrintSnapshot({
        crmEnabled: true,
        customerId: "cust-1",
        balanceBefore: 20,
        pointsToRedeem: 0,
        pointsEarned: 8,
      }),
    ).toEqual({ pointsBalance: 28, pointsRedeemed: 0 });
    expect(
      crmPointsPrintSnapshot({
        crmEnabled: true,
        customerId: "cust-1",
        balanceBefore: 20,
        pointsToRedeem: 5,
        pointsEarned: 8,
      }),
    ).toEqual({ pointsBalance: 15, pointsRedeemed: 5 });
  });
});

describe("resolveSaleCrmPointsPrint", () => {
  it("keeps a zero balance instead of dropping the Note line", () => {
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: true,
        customerId: "cust-1",
        existingBalance: 0,
        balanceBefore: 50,
        pointsEarned: 5,
      }),
    ).toEqual({ pointsBalance: 0, pointsRedeemed: 0 });
  });

  it("keeps the balance the POS screen already computed", () => {
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: true,
        customerId: "cust-1",
        existingBalance: 40,
        existingRedeemed: 0,
        balanceBefore: 10,
        pointsEarned: 99,
      }),
    ).toEqual({ pointsBalance: 40, pointsRedeemed: 0 });
  });

  it("fills the WhatsApp snapshot when the customer is linked only at save", () => {
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: true,
        customerId: "cust-1",
        balanceBefore: 12,
        pointsEarned: 8,
      }),
    ).toEqual({ pointsBalance: 20, pointsRedeemed: 0 });
  });

  it("does not earn on pay-later or when points were redeemed", () => {
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: true,
        customerId: "cust-1",
        balanceBefore: 12,
        pointsToRedeem: 5,
        pointsEarned: 8,
        suppressEarn: true,
      }),
    ).toEqual({ pointsBalance: 7, pointsRedeemed: 5 });
  });

  it("stays empty for a walk-in or when CRM is off", () => {
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: true,
        customerId: "",
        balanceBefore: 12,
        pointsEarned: 8,
      }),
    ).toEqual({});
    expect(
      resolveSaleCrmPointsPrint({
        crmEnabled: false,
        customerId: "cust-1",
        balanceBefore: 12,
        pointsEarned: 8,
      }),
    ).toEqual({});
  });

  it("uses the save-time balance when the screen snapshot is empty", () => {
    expect(coalesceCrmPointsPrint({}, { pointsBalance: 20, pointsRedeemed: 0 })).toEqual({
      pointsBalance: 20,
      pointsRedeemed: 0,
    });
    expect(
      coalesceCrmPointsPrint({ pointsBalance: 4, pointsRedeemed: 1 }, { pointsBalance: 20, pointsRedeemed: 0 }),
    ).toEqual({ pointsBalance: 4, pointsRedeemed: 1 });
  });
});

describe("POS WhatsApp CRM points wiring", () => {
  it("fills the balance before points are awarded and before the PDF snapshot", () => {
    const src = readFileSync(resolve(here, "../hooks/useSaveSale.tsx"), "utf8");
    const fillAt = src.indexOf("saleData = await attachMissingCrmPointsPrint");
    expect(fillAt).toBeGreaterThan(0);
    const afterFill = src.slice(fillAt);
    const awardAt = afterFill.indexOf("void awardPoints");
    const captureAt = afterFill.indexOf("buildPosWhatsAppCaptureMeta");
    expect(awardAt).toBeGreaterThan(0);
    expect(captureAt).toBeGreaterThan(awardAt);
  });
});
