import { describe, expect, it } from "vitest";
import { storefrontEnquiryAlert, storefrontEnquiryKind } from "./storefrontEnquiryAlert";

describe("storefront enquiry alerts", () => {
  it("tells orders, bookings and enquiries apart", () => {
    expect(storefrontEnquiryKind("STORE ORDER · EN-1 M x1 · Total ₹5,000")).toBe("order");
    expect(storefrontEnquiryKind("[EN-1] · UPI shop@upi · Booking ₹5,000")).toBe("booking");
    expect(storefrontEnquiryKind("Is this available in blue?")).toBe("enquiry");
    expect(storefrontEnquiryKind(null)).toBe("enquiry");
  });

  it("names the customer and drops internal variant marks", () => {
    const alert = storefrontEnquiryAlert({
      id: "1",
      customer_name: "Aisha",
      customer_phone: "9876543210",
      message: "STORE ORDER · EN-1 M x1 · Total ₹5,000 [v:0b9f6a1e-1d2c-4a5b-9c8d-7e6f5a4b3c2d]",
    });
    expect(alert.title).toBe("New website order · Aisha");
    expect(alert.body).toBe("EN-1 M x1 · Total ₹5,000 · 9876543210");
  });
});
