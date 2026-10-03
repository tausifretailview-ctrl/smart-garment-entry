import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  planPosEditCreditSave,
  posEditCreditSaveMessage,
} from "./posEditCreditSave";

const here = dirname(fileURLToPath(import.meta.url));

describe("planPosEditCreditSave", () => {
  it("applies a pending credit note on an unpaid invoice (1000 − 200 = 800)", () => {
    expect(
      planPosEditCreditSave({
        requested: 200,
        storedSaleReturnAdjust: 0,
        liveCreditNoteAdjust: 0,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
        paymentStatus: "pending",
      }),
    ).toEqual({
      kind: "apply",
      releaseFirst: false,
      amount: 200,
      resultingAdjust: 200,
      payable: 800,
    });
  });

  it("leaves credit alone when Save Changes did not move the S/R field", () => {
    expect(
      planPosEditCreditSave({
        requested: 0,
        storedSaleReturnAdjust: 0,
        liveCreditNoteAdjust: 200,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
      }).kind,
    ).toBe("unchanged");
    expect(
      planPosEditCreditSave({
        requested: 200,
        storedSaleReturnAdjust: 200,
        liveCreditNoteAdjust: 200,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
      }).kind,
    ).toBe("unchanged");
  });

  it("adds only the extra amount when the credit note is increased", () => {
    expect(
      planPosEditCreditSave({
        requested: 200,
        storedSaleReturnAdjust: 100,
        liveCreditNoteAdjust: 100,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
      }),
    ).toMatchObject({ kind: "apply", releaseFirst: false, amount: 100, payable: 800 });
  });

  it("releases the bill credit before applying a smaller amount", () => {
    expect(
      planPosEditCreditSave({
        requested: 100,
        storedSaleReturnAdjust: 200,
        liveCreditNoteAdjust: 200,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
      }),
    ).toMatchObject({ kind: "apply", releaseFirst: true, amount: 100, payable: 900 });
  });

  it("releases credit when the adjust is cleared", () => {
    expect(
      planPosEditCreditSave({
        requested: 0,
        storedSaleReturnAdjust: 200,
        liveCreditNoteAdjust: 200,
        netAmount: 1000,
        paidAmount: 0,
        customerId: "cust-1",
      }),
    ).toEqual({ kind: "release", resultingAdjust: 0, payable: 1000 });
  });

  it("refuses a credit note without a customer or without invoice balance", () => {
    expect(
      planPosEditCreditSave({
        requested: 200,
        storedSaleReturnAdjust: 0,
        liveCreditNoteAdjust: 0,
        netAmount: 1000,
        paidAmount: 0,
        customerId: null,
      }),
    ).toMatchObject({ kind: "reject" });
    expect(
      planPosEditCreditSave({
        requested: 200,
        storedSaleReturnAdjust: 0,
        liveCreditNoteAdjust: 0,
        netAmount: 1000,
        paidAmount: 1000,
        customerId: "cust-1",
      }),
    ).toMatchObject({
      kind: "reject",
      message: "This invoice has no balance left for a credit note.",
    });
  });

  it("describes the saved payable", () => {
    expect(posEditCreditSaveMessage({ applied: 200, payable: 800 })).toBe(
      "Credit note ₹200 applied. Invoice total is now ₹800.",
    );
    expect(posEditCreditSaveMessage({ applied: 0, payable: 1000 })).toBe(
      "Credit note removed. Invoice total is now ₹1,000.",
    );
  });
});

describe("POS Save Changes wiring", () => {
  it("persists the credit-note adjust from Save Changes", () => {
    const page = readFileSync(resolve(here, "../pages/POSSales.tsx"), "utf8");
    const start = page.indexOf("const handleSaveMetadataChanges");
    const block = page.slice(start, page.indexOf("setOnSaveChanges(() => handleSaveMetadataChanges)"));
    expect(block).toContain("persistPosEditCreditAdjust");
    expect(block).toContain("posEditCreditSaveMessage");
    const layout = readFileSync(resolve(here, "../components/POSLayout.tsx"), "utf8");
    expect(layout).toContain("credit-note adjustment");
  });
});
