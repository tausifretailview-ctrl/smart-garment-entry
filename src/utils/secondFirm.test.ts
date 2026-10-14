import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import {
  applyPrintFirmToSettings,
  normalizePrintFirm,
  resolveSecondFirm,
  salePrintFirmPatch,
} from "./secondFirm";

const orgSettings = {
  business_name: "BIN HANIF",
  address: "25/B Trustee Building, Mumbai",
  mobile_number: "8879873678",
  email_id: "binhanif@example.com",
  gst_number: "27AFAPP8913J1Z5",
  sale_settings: { invoice_header_text: "Manufacturer & Wholesaler", pos_invoice_template: "retail-erp" },
  bill_barcode_settings: { logo_url: "https://logo", stamp_image_base64: "stamp", upi_id: "shop@upi" },
  report_settings: {
    second_firm: {
      enabled: true,
      name: "  KMS KIDS ",
      address: "25/B Trustee Building, Mumbai",
      phone: "8879873678",
      gstin: "",
    },
  },
};

describe("resolveSecondFirm", () => {
  it("returns the trimmed 2nd firm when enabled with a name", () => {
    expect(resolveSecondFirm(orgSettings)?.name).toBe("KMS KIDS");
  });

  it("is null when off, unnamed or missing", () => {
    expect(resolveSecondFirm(null)).toBeNull();
    expect(resolveSecondFirm({ report_settings: { second_firm: { enabled: false, name: "KMS" } } })).toBeNull();
    expect(resolveSecondFirm({ report_settings: { second_firm: { enabled: true, name: "  " } } })).toBeNull();
  });
});

describe("applyPrintFirmToSettings", () => {
  it("keeps main firm settings when not the 2nd firm", () => {
    expect(applyPrintFirmToSettings(orgSettings, null)).toBe(orgSettings);
    expect(applyPrintFirmToSettings(orgSettings, undefined)).toBe(orgSettings);
  });

  it("swaps header to the 2nd firm and drops main-firm GSTIN and branding", () => {
    const out = applyPrintFirmToSettings(orgSettings, "second")!;
    expect(out.business_name).toBe("KMS KIDS");
    expect(out.address).toBe("25/B Trustee Building, Mumbai");
    expect(out.mobile_number).toBe("8879873678");
    expect(out.gst_number).toBe("");
    expect(out.email_id).toBe("");
    expect(out.sale_settings.invoice_header_text).toBe("");
    expect(out.sale_settings.pos_invoice_template).toBe("retail-erp");
    expect(out.bill_barcode_settings.logo_url).toBe("");
    expect(out.bill_barcode_settings.upi_id).toBe("shop@upi");
    expect(orgSettings.business_name).toBe("BIN HANIF");
  });

  it("prints the 2nd firm's own GSTIN when one is set", () => {
    const withGst = {
      ...orgSettings,
      report_settings: { second_firm: { ...orgSettings.report_settings.second_firm, gstin: "27abcde1234f1z5" } },
    };
    expect(applyPrintFirmToSettings(withGst, "second")!.gst_number).toBe("27ABCDE1234F1Z5");
  });

  it("falls back to the main firm if the 2nd firm was switched off later", () => {
    const off = { ...orgSettings, report_settings: { second_firm: { enabled: false, name: "KMS KIDS" } } };
    expect(applyPrintFirmToSettings(off, "second")).toBe(off);
  });
});

describe("salePrintFirmPatch / normalizePrintFirm", () => {
  it("writes nothing when the feature is off", () => {
    expect(salePrintFirmPatch(undefined)).toEqual({});
  });

  it("writes the choice when the feature is on", () => {
    expect(salePrintFirmPatch("second")).toEqual({ print_firm: "second" });
    expect(salePrintFirmPatch(null)).toEqual({ print_firm: null });
  });

  it("normalizes unknown values to the main firm", () => {
    expect(normalizePrintFirm("second")).toBe("second");
    expect(normalizePrintFirm("other")).toBeNull();
    expect(normalizePrintFirm(undefined)).toBeNull();
  });
});
