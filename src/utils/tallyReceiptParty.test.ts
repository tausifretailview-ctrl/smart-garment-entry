import { describe, expect, it } from "vitest";
import { applyReceiptPartyNames, receiptPartyLedger } from "./tallyReceiptParty";

const SALE_ID = "78b7c398-6d1a-4ed7-bb29-e4b38dc6edac";
const CUSTOMER_ID = "22fbae4f-502b-49bf-a23d-caec99126f19";

describe("applyReceiptPartyNames", () => {
  it("uses the linked sale customer name instead of the payment description", () => {
    const [row] = applyReceiptPartyNames(
      [
        {
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/4387-1",
          reference_type: "sale",
          reference_id: SALE_ID,
          description: "Payment for INV/26-27/17 | Transaction ID: 78b7c398-6d1a-4ed7-bb29-e4b38dc6edac",
        },
      ],
      [{ id: SALE_ID, sale_number: "INV/26-27/17", customer_name: "RAHUL SHARMA", customer_id: CUSTOMER_ID }],
      [],
    );
    expect(row.customer_name).toBe("RAHUL SHARMA");
    expect(receiptPartyLedger(row)).toBe("RAHUL SHARMA");
  });

  it("resolves a POS bill number from the description when reference_id is not the sale", () => {
    const [row] = applyReceiptPartyNames(
      [
        {
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/10",
          reference_type: "sale",
          reference_id: "not-a-sale",
          description: "Payment for POS/26-27/323",
        },
      ],
      [{ id: "sale-pos", sale_number: "POS/26-27/323", customer_name: "ZIBA" }],
      [],
    );
    expect(row.customer_name).toBe("ZIBA");
  });

  it("uses the customer row for opening-balance and CustomerReceipt references", () => {
    const rows = applyReceiptPartyNames(
      [
        {
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/1-OB",
          reference_type: "customer",
          reference_id: CUSTOMER_ID,
          description: "Opening Balance Payment",
        },
        {
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/2",
          reference_type: "CustomerReceipt",
          reference_id: CUSTOMER_ID,
          description: "Advance received",
        },
      ],
      [],
      [{ id: CUSTOMER_ID, customer_name: "ZIBA" }],
    );
    expect(rows.map((r) => r.customer_name)).toEqual(["ZIBA", "ZIBA"]);
  });

  it("falls back to the customer master when the sale name is blank", () => {
    const [row] = applyReceiptPartyNames(
      [
        {
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/3",
          reference_type: "sale",
          reference_id: SALE_ID,
          description: "Payment for INV/26-27/9",
        },
      ],
      [{ id: SALE_ID, sale_number: "INV/26-27/9", customer_name: "  ", customer_id: CUSTOMER_ID }],
      [{ id: CUSTOMER_ID, customer_name: "MEENA" }],
    );
    expect(row.customer_name).toBe("MEENA");
  });

  it("leaves a fee receipt narration untouched", () => {
    const [row] = applyReceiptPartyNames(
      [
        {
          voucher_type: "receipt",
          voucher_number: "FEE/1",
          reference_type: "student_fee",
          reference_id: CUSTOMER_ID,
          description: "Fee Collection - ASHA",
        },
      ],
      [{ id: CUSTOMER_ID, customer_name: "WRONG", sale_number: "INV/26-27/1" }],
      [{ id: CUSTOMER_ID, customer_name: "WRONG" }],
    );
    expect(row.customer_name).toBeUndefined();
    expect(receiptPartyLedger(row)).toBe("Fee Collection - ASHA");
  });
});
