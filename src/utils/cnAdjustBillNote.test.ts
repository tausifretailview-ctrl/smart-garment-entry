import { describe, expect, it } from "vitest";
import {
  formatCnAdjustBillNote,
  mergeInvoiceNotesWithCnAdjust,
} from "@/utils/cnAdjustBillNote";

describe("formatCnAdjustBillNote", () => {
  it("returns null when no adjust", () => {
    expect(formatCnAdjustBillNote({ saleReturnAdjust: 0 })).toBeNull();
    expect(formatCnAdjustBillNote({})).toBeNull();
  });

  it("formats amount only", () => {
    expect(formatCnAdjustBillNote({ saleReturnAdjust: 1474 })).toBe("CN Adjust: ₹1,474");
  });

  it("formats amount with adj date", () => {
    expect(
      formatCnAdjustBillNote({
        saleReturnAdjust: 1474,
        cnAdjustDate: "2026-07-03",
      }),
    ).toBe("CN Adjust: ₹1,474 (adj. 03/07/2026)");
  });
});

describe("mergeInvoiceNotesWithCnAdjust", () => {
  it("uses CN note alone when notes empty", () => {
    expect(mergeInvoiceNotesWithCnAdjust("", "CN Adjust: ₹100")).toBe("CN Adjust: ₹100");
  });

  it("appends CN note under existing notes", () => {
    expect(mergeInvoiceNotesWithCnAdjust("Handle with care", "CN Adjust: ₹100")).toBe(
      "Handle with care\nCN Adjust: ₹100",
    );
  });

  it("does not duplicate when notes already mention CN/S/R adjust", () => {
    expect(mergeInvoiceNotesWithCnAdjust("CN Adjust: ₹100", "CN Adjust: ₹100")).toBe(
      "CN Adjust: ₹100",
    );
    expect(mergeInvoiceNotesWithCnAdjust("+S/R: ₹50", "CN Adjust: ₹50")).toBe("+S/R: ₹50");
  });
});
