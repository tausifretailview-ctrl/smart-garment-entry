import { describe, expect, it } from "vitest";
import {
  buildDebitNoteDetails,
  computeDebitNote,
  debitNoteBalance,
  debitNoteDetailsToForms,
  debitNotePrintItems,
  debitNotePrintNote,
  debitNoteReasonLabel,
  isDebitNoteSale,
  newDebitNoteLineForm,
  parseDebitNoteDetails,
  validateDebitNote,
} from "./debitNote";

const line = (patch: Parameters<typeof newDebitNoteLineForm>[0]) => newDebitNoteLineForm(patch);

describe("computeDebitNote", () => {
  it("adds GST per line and rounds the total to the rupee (intra-state)", () => {
    const t = computeDebitNote(
      [
        line({ description: "Rate difference", hsn: "7306", qty: "960", rate: "1.5", gst_percent: "18" }),
        line({ description: "Freight", hsn: "9965", qty: "1", rate: "1250", gst_percent: "5" }),
      ],
      false,
    );
    expect(t.taxable).toBe(2690);
    expect(t.gst).toBe(321.7);
    expect(t.cgst).toBe(160.85);
    expect(t.sgst).toBe(160.85);
    expect(t.igst).toBe(0);
    expect(t.net).toBe(3012);
    expect(t.roundOff).toBe(0.3);
  });

  it("puts all GST in IGST for inter-state and skips empty rows", () => {
    const t = computeDebitNote([line({ description: "Interest", qty: "1", rate: "999", gst_percent: "18" }), line({})], true);
    expect(t.lines).toHaveLength(1);
    expect(t.igst).toBe(179.82);
    expect(t.cgst + t.sgst).toBe(0);
    expect(t.net).toBe(1179);
  });
});

describe("validateDebitNote", () => {
  const ok = { customerId: "c1", againstSaleNumber: "INV/26-27/12", reason: "rate_difference", forms: [line({ description: "Rate diff", rate: "10" })] };

  it("passes a complete note", () => {
    expect(validateDebitNote(ok)).toBeNull();
  });

  it("names the first problem", () => {
    expect(validateDebitNote({ ...ok, customerId: "" })).toMatch(/customer/);
    expect(validateDebitNote({ ...ok, againstSaleNumber: " " })).toMatch(/original invoice/);
    expect(validateDebitNote({ ...ok, reason: "x" })).toMatch(/reason/);
    expect(validateDebitNote({ ...ok, forms: [line({})] })).toMatch(/at least one line/);
    expect(validateDebitNote({ ...ok, forms: [line({ description: "A", rate: "0" })] })).toMatch(/Line 1: rate/);
    expect(validateDebitNote({ ...ok, forms: [line({ description: "A", rate: "5", gst_percent: "7" })] })).toMatch(/GST rate/);
    expect(validateDebitNote({ ...ok, forms: [line({ description: "A", rate: "5", hsn: "12" })] })).toMatch(/HSN/);
  });
});

describe("details", () => {
  const totals = computeDebitNote([line({ description: "Rate difference", hsn: "7306", qty: "100", rate: "2", gst_percent: "18" })], false);
  const details = buildDebitNoteDetails({
    againstSaleId: "s1",
    againstSaleNumber: " INV/26-27/12 ",
    againstSaleDate: "2026-10-05T00:00:00",
    reason: "rate_difference",
    reasonNote: "  revised price list ",
    interState: false,
    totals,
  });

  it("round-trips through parse and back to form rows", () => {
    const parsed = parseDebitNoteDetails(JSON.parse(JSON.stringify(details)));
    expect(parsed).toEqual(details);
    expect(parsed?.against_sale_number).toBe("INV/26-27/12");
    expect(parsed?.against_sale_date).toBe("2026-10-05");
    const forms = debitNoteDetailsToForms(parsed!);
    expect(computeDebitNote(forms, false).net).toBe(totals.net);
  });

  it("rejects values that are not debit note details", () => {
    expect(parseDebitNoteDetails(null)).toBeNull();
    expect(parseDebitNoteDetails({ customer_po_no: "x" })).toBeNull();
  });

  it("prints the original invoice and reason", () => {
    expect(debitNotePrintNote(details, "Thank you")).toBe(
      "Against Invoice INV/26-27/12 dated 05/10/2026. Reason: Rate difference (price increase) - revised price list. Thank you",
    );
    expect(debitNotePrintItems(details)[0]).toMatchObject({ sr: 1, hsn: "7306", qty: 100, rate: 2, total: 200, gstPercent: 18 });
  });
});

describe("helpers", () => {
  it("labels, type check and balance", () => {
    expect(debitNoteReasonLabel("freight")).toBe("Freight / packing charged later");
    expect(isDebitNoteSale({ sale_type: "debit_note" })).toBe(true);
    expect(isDebitNoteSale({ sale_type: "invoice" })).toBe(false);
    expect(debitNoteBalance(3012, 1000)).toBe(2012);
    expect(debitNoteBalance(100, 150)).toBe(0);
  });
});
