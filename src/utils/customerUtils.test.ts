import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG,
  matchDuplicateCustomer,
  normalizeCustomerNameKey,
} from "./customerUtils";

const rahul = { id: "c1", customer_name: "RAHUL", phone: "9819082836" };
const anita = { id: "c2", customer_name: "ANITA", phone: "919876543210" };

describe("customer create duplicate match", () => {
  it("treats names as uppercase trimmed keys", () => {
    expect(normalizeCustomerNameKey("  rahul ")).toBe("RAHUL");
  });

  it("matches an existing phone even when country code differs", () => {
    expect(
      matchDuplicateCustomer([rahul, anita], {
        nameKey: "NEW NAME",
        normalizedPhone: "9876543210",
      })?.id,
    ).toBe("c2");
  });

  it("matches an existing name when the phone is new", () => {
    expect(
      matchDuplicateCustomer([rahul, anita], {
        nameKey: "RAHUL",
        normalizedPhone: "9000000000",
      })?.id,
    ).toBe("c1");
  });

  it("does not match empty name against stored rows", () => {
    expect(
      matchDuplicateCustomer([rahul], {
        nameKey: "",
        normalizedPhone: null,
      }),
    ).toBeNull();
  });

  it("exposes the cashier message for reuse in UI", () => {
    expect(CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG).toMatch(/different name or number/i);
  });
});
