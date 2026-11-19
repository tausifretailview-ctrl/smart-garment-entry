import { describe, expect, it } from "vitest";
import { isCustomerReceiptVoucher } from "./paymentVoucherFilters";

describe("customer receipts exclude third-party and owner capital receipts", () => {
  it("an RCP receipt from a third party or the owner's capital is not a customer receipt", () => {
    const capital = { voucher_type: "receipt", reference_type: "third_party", voucher_number: "RCP/26-27/21", description: "Capital Invested: Owner's Capital — Capital introduced" };
    const loan = { voucher_type: "receipt", reference_type: "third_party", voucher_number: "RCP/26-27/22", description: "Third-party Received: Loan — x" };
    expect(isCustomerReceiptVoucher(capital as never)).toBe(false);
    expect(isCustomerReceiptVoucher(loan as never)).toBe(false);
  });

  it("customer receipts are unchanged", () => {
    expect(isCustomerReceiptVoucher({ voucher_type: "receipt", reference_type: "customer", voucher_number: "RCP/1" } as never)).toBe(true);
    expect(isCustomerReceiptVoucher({ voucher_type: "receipt", reference_type: null, voucher_number: "RCP/2" } as never)).toBe(true);
    expect(isCustomerReceiptVoucher({ voucher_type: "receipt", reference_type: "supplier", voucher_number: "RCP/3" } as never)).toBe(false);
  });
});
