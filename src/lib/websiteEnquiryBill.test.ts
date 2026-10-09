import { describe, expect, it } from "vitest";
import { websiteEnquiryBillPrefill } from "./websiteEnquiryBill";

describe("websiteEnquiryBillPrefill", () => {
  it("fills the shopper, booked barcodes and the order note", () => {
    const prefill = websiteEnquiryBillPrefill({
      customer_name: " Asha ",
      customer_phone: "+91 98765 43210",
      message:
        "STORE ORDER · EN-101 M x1 · Code DIWALI -₹200 · Total ₹1,800 [v:11111111-1111-1111-1111-111111111111]",
      barcode: "890001",
      booked_pieces: [
        { variant_id: "11111111-1111-1111-1111-111111111111", product_id: "p", size: "M", barcode: "890001" },
        { variant_id: "22222222-2222-2222-2222-222222222222", product_id: "p", size: "L", barcode: "890002" },
      ],
    });
    expect(prefill.customerName).toBe("Asha");
    expect(prefill.customerPhone).toBe("9876543210");
    expect(prefill.barcodes).toEqual(["890001", "890002"]);
    expect(prefill.notes).toBe("Website order: STORE ORDER · EN-101 M x1 · Code DIWALI -₹200 · Total ₹1,800");
  });

  it("falls back to the single barcode on older enquiries", () => {
    const prefill = websiteEnquiryBillPrefill({
      customer_name: "Ravi",
      customer_phone: "9876543210",
      message: null,
      barcode: "77",
      booked_pieces: null,
    });
    expect(prefill.barcodes).toEqual(["77"]);
    expect(prefill.notes).toBe("Website order");
  });
});
