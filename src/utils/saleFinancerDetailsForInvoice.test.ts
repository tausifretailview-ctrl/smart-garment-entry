import { describe, expect, it } from "vitest";
import { mapSaleFinancerDetailsForInvoice } from "@/utils/saleFinancerDetailsForInvoice";

describe("mapSaleFinancerDetailsForInvoice", () => {
  it("maps all EMI fields for Tally / WhatsApp print", () => {
    const mapped = mapSaleFinancerDetailsForInvoice({
      financer_name: "Bajaj Finserv",
      loan_number: "DSBS-99",
      tenure: 12,
      down_payment: 5000,
      down_payment_mode: "cash",
      emi_amount: 2200,
      bank_transfer_amount: 18000,
      finance_discount: 500,
    });
    expect(mapped).toEqual({
      financer_name: "Bajaj Finserv",
      loan_number: "DSBS-99",
      tenure: 12,
      down_payment: 5000,
      down_payment_mode: "cash",
      emi_amount: 2200,
      bank_transfer_amount: 18000,
      finance_discount: 500,
    });
  });

  it("returns null when financer name is missing", () => {
    expect(mapSaleFinancerDetailsForInvoice({ loan_number: "x" })).toBeNull();
  });
});
