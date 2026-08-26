import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG,
  checkDuplicateCustomer,
  customerNameNeedsPhoneMessage,
  matchDuplicateCustomer,
  normalizeCustomerNameKey,
} from "./customerUtils";

const rahul = { id: "c1", customer_name: "RAHUL", phone: "9819082836" };
const anita = { id: "c2", customer_name: "ANITA", phone: "919876543210" };

describe("customer create duplicate match", () => {
  it("treats names as uppercase trimmed keys", () => {
    expect(normalizeCustomerNameKey("  rahul ")).toBe("RAHUL");
  });

  it("blocks when the phone already exists even when the name differs", () => {
    expect(
      checkDuplicateCustomer([rahul, anita], {
        nameKey: "NEW NAME",
        normalizedPhone: "9876543210",
      }),
    ).toEqual({ kind: "duplicate", row: anita });
  });

  it("allows the same name when a genuinely new phone is provided", () => {
    expect(
      checkDuplicateCustomer([rahul, anita], {
        nameKey: "RAHUL",
        normalizedPhone: "9000000000",
        nameDisplay: "Rahul",
      }),
    ).toEqual({ kind: "clear" });
  });

  it("asks for a phone when the name matches and none was entered", () => {
    expect(
      checkDuplicateCustomer([rahul, anita], {
        nameKey: "RAHUL",
        normalizedPhone: null,
        nameDisplay: "Rahul",
      }),
    ).toEqual({
      kind: "name_needs_phone",
      row: rahul,
      nameDisplay: "Rahul",
    });
  });

  it("allows a unique name with no phone", () => {
    expect(
      checkDuplicateCustomer([rahul], {
        nameKey: "UNIQUE",
        normalizedPhone: null,
      }),
    ).toEqual({ kind: "clear" });
  });

  it("blocks exact same name and phone as an existing customer", () => {
    expect(
      checkDuplicateCustomer([rahul, anita], {
        nameKey: "RAHUL",
        normalizedPhone: "9819082836",
      }),
    ).toEqual({ kind: "duplicate", row: rahul });
  });

  it("blocks when a new name reuses an existing phone on another customer", () => {
    expect(
      checkDuplicateCustomer([rahul, anita], {
        nameKey: "BRAND NEW",
        normalizedPhone: "9819082836",
      }),
    ).toEqual({ kind: "duplicate", row: rahul });
  });

  it("does not treat empty name as a match against stored rows", () => {
    expect(
      checkDuplicateCustomer([rahul], {
        nameKey: "",
        normalizedPhone: null,
      }),
    ).toEqual({ kind: "clear" });
  });

  it("exposes the genuine-duplicate message for reuse in UI", () => {
    expect(CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG).toMatch(/different name or number/i);
  });

  it("exposes a validation-style message when the name exists without a phone", () => {
    const msg = customerNameNeedsPhoneMessage("Rahul");
    expect(msg).toMatch(/already exists/i);
    expect(msg).toMatch(/mobile number/i);
    expect(msg).not.toMatch(/different name or number/i);
  });

  it("matchDuplicateCustomer returns a row only for genuine phone duplicates", () => {
    expect(
      matchDuplicateCustomer([rahul, anita], {
        nameKey: "RAHUL",
        normalizedPhone: "9000000000",
      }),
    ).toBeNull();
    expect(
      matchDuplicateCustomer([rahul], {
        nameKey: "RAHUL",
        normalizedPhone: null,
      }),
    ).toBeNull();
    expect(
      matchDuplicateCustomer([rahul], {
        nameKey: "RAHUL",
        normalizedPhone: "9819082836",
      })?.id,
    ).toBe("c1");
  });
});
