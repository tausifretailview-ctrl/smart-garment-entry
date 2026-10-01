import { describe, expect, it } from "vitest";
import { isValidMobileNumber, mobileDigits, mobileNumberError } from "./mobileNumberValidation";

describe("mobileNumberError", () => {
  it("accepts exactly 10 digits", () => {
    expect(mobileNumberError("9876543210")).toBeNull();
  });

  it("accepts spaces, dashes and brackets", () => {
    expect(mobileNumberError("98765 43210")).toBeNull();
    expect(mobileNumberError("(98765) 43-210")).toBeNull();
  });

  it("accepts +91 / 91 and a leading 0", () => {
    expect(mobileNumberError("+91 98765 43210")).toBeNull();
    expect(mobileNumberError("919876543210")).toBeNull();
    expect(mobileNumberError("09876543210")).toBeNull();
  });

  it.each(["987654321", "98765432", "9876", "1"])("rejects short number %s", (value) => {
    expect(mobileNumberError(value)).toBe(
      `Mobile number must be exactly 10 digits (you entered ${value.length}).`,
    );
  });

  it("rejects more than 10 digits that are not a +91 / 0 prefix", () => {
    expect(mobileNumberError("98765432101")).not.toBeNull();
    expect(mobileNumberError("9876543210123")).not.toBeNull();
    expect(mobileNumberError("929876543210")).not.toBeNull();
  });

  it("treats blank as valid unless required", () => {
    expect(mobileNumberError("")).toBeNull();
    expect(mobileNumberError("   ")).toBeNull();
    expect(mobileNumberError(null)).toBeNull();
    expect(mobileNumberError("", { required: true })).toBe("Mobile number is required");
  });

  it("rejects text with no digits", () => {
    expect(mobileNumberError("abc")).toContain("you entered 0");
  });
});

describe("helpers", () => {
  it("mobileDigits strips the country prefix only when the length fits", () => {
    expect(mobileDigits("+91 98765 43210")).toBe("9876543210");
    expect(mobileDigits("9198765432")).toBe("9198765432");
  });

  it("isValidMobileNumber mirrors mobileNumberError", () => {
    expect(isValidMobileNumber("9876543210")).toBe(true);
    expect(isValidMobileNumber("987654321")).toBe(false);
  });
});
