import { describe, expect, it } from "vitest";
import {
  getQuotationStatusConfig,
  getQuotationStatusLabel,
  QUOTATION_UPDATABLE_STATUSES,
} from "./quotationStatus";

describe("quotationStatus", () => {
  it("returns known status labels", () => {
    expect(getQuotationStatusLabel("confirmed")).toBe("Confirmed");
    expect(getQuotationStatusLabel("hold")).toBe("Hold");
    expect(getQuotationStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("includes hold in updatable statuses", () => {
    expect(QUOTATION_UPDATABLE_STATUSES).toContain("hold");
    expect(QUOTATION_UPDATABLE_STATUSES).toContain("confirmed");
    expect(QUOTATION_UPDATABLE_STATUSES).toContain("cancelled");
  });

  it("falls back for unknown status", () => {
    const config = getQuotationStatusConfig("custom");
    expect(config.label).toBe("Custom");
  });
});
