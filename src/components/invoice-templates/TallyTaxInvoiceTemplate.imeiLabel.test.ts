import { describe, expect, it } from "vitest";
import { tallyItemCodeLabel } from "@/components/invoice-templates/TallyTaxInvoiceTemplate";

describe("tallyItemCodeLabel", () => {
  it("labels a real IMEI as IMEI even without the Mobile ERP flag", () => {
    expect(tallyItemCodeLabel("869673086100512")).toBe("IMEI");
  });

  it("labels 14-17 digit codes as IMEI in Mobile ERP shops", () => {
    expect(tallyItemCodeLabel("869673086100513", true)).toBe("IMEI");
    expect(tallyItemCodeLabel("869673086100513", false)).toBe("Barcode");
  });

  it("keeps Barcode for garment codes and accessory EANs", () => {
    expect(tallyItemCodeLabel("10001234")).toBe("Barcode");
    expect(tallyItemCodeLabel("8901326030868", true)).toBe("Barcode");
    expect(tallyItemCodeLabel("")).toBe("Barcode");
  });
});
