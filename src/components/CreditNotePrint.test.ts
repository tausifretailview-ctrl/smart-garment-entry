import { describe, expect, it } from "vitest";
import { formatCreditNoteAmount } from "./CreditNotePrint";

describe("formatCreditNoteAmount", () => {
  it("formats a normal amount", () => {
    expect(formatCreditNoteAmount(1234.5)).toBe("1234.50");
  });

  it("treats null as zero", () => {
    expect(formatCreditNoteAmount(null)).toBe("0.00");
  });

  it("treats undefined as zero", () => {
    expect(formatCreditNoteAmount(undefined)).toBe("0.00");
  });
});
