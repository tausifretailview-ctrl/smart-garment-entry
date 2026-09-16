import { describe, expect, it } from "vitest";
import {
  canSelectUpiSlot,
  coerceActiveUpiId,
  patchCompanyUpi,
  resolveCompanyUpiId,
  resolveInvoiceUpiId,
} from "./companyUpi";

describe("coerceActiveUpiId / resolveCompanyUpiId", () => {
  it("treats a legacy single upi_id as UPI ID 1 and default", () => {
    const bill = { upi_id: "shop@okaxis" };
    expect(coerceActiveUpiId(bill)).toBe("primary");
    expect(resolveCompanyUpiId(bill)).toBe("shop@okaxis");
  });

  it("uses UPI ID 2 when it is marked default", () => {
    const bill = {
      upi_id: "one@upi",
      upi_id_2: "two@upi",
      active_upi_id: "secondary" as const,
    };
    expect(coerceActiveUpiId(bill)).toBe("secondary");
    expect(resolveCompanyUpiId(bill)).toBe("two@upi");
  });

  it("falls back to UPI ID 1 when the secondary slot is selected but empty", () => {
    const bill = {
      upi_id: "one@upi",
      upi_id_2: "  ",
      active_upi_id: "secondary" as const,
    };
    expect(coerceActiveUpiId(bill)).toBe("primary");
    expect(resolveCompanyUpiId(bill)).toBe("one@upi");
    expect(canSelectUpiSlot(bill, "secondary")).toBe(false);
  });

  it("selects UPI ID 2 when it is the only value set", () => {
    const bill = { upi_id: "", upi_id_2: "only@upi" };
    expect(coerceActiveUpiId(bill)).toBe("secondary");
    expect(resolveCompanyUpiId(bill)).toBe("only@upi");
  });

  it("returns empty when neither company UPI is set", () => {
    expect(resolveCompanyUpiId({})).toBe("");
    expect(coerceActiveUpiId({})).toBe("primary");
  });
});

describe("resolveInvoiceUpiId DC fallback", () => {
  it("uses dc_upi_id when set, ignoring the company default", () => {
    expect(
      resolveInvoiceUpiId(
        {
          upi_id: "one@upi",
          upi_id_2: "two@upi",
          active_upi_id: "secondary",
          dc_upi_id: "personal@upi",
        },
        true,
      ),
    ).toBe("personal@upi");
  });

  it("falls back to the currently default company UPI when DC is blank", () => {
    expect(
      resolveInvoiceUpiId(
        {
          upi_id: "one@upi",
          upi_id_2: "two@upi",
          active_upi_id: "secondary",
          dc_upi_id: "",
        },
        true,
      ),
    ).toBe("two@upi");
  });

  it("does not use dc_upi_id on non-DC invoices", () => {
    expect(
      resolveInvoiceUpiId(
        {
          upi_id: "one@upi",
          dc_upi_id: "personal@upi",
        },
        false,
      ),
    ).toBe("one@upi");
  });
});

describe("patchCompanyUpi", () => {
  it("refuses to keep an empty slot as default", () => {
    const next = patchCompanyUpi(
      { upi_id: "one@upi", upi_id_2: "two@upi", active_upi_id: "secondary" },
      { upi_id_2: "", active_upi_id: "secondary" },
    );
    expect(next.active_upi_id).toBe("primary");
    expect(resolveCompanyUpiId(next)).toBe("one@upi");
  });
});
