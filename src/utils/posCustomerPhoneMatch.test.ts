import { describe, expect, it } from "vitest";
import {
  normalizePosPhoneDigits,
  phonesMatchExactly,
  resolvePosCustomerPhoneMatch,
} from "./posCustomerPhoneMatch";

const c = (id: string, phone: string, name = "A") => ({
  id,
  customer_name: name,
  phone,
});

describe("normalizePosPhoneDigits", () => {
  it("strips non-digits", () => {
    expect(normalizePosPhoneDigits("+91 98765-43210")).toBe("919876543210");
    expect(normalizePosPhoneDigits("")).toBe("");
  });
});

describe("phonesMatchExactly", () => {
  it("matches equal digit strings", () => {
    expect(phonesMatchExactly("9876543210", "98765-43210")).toBe(true);
  });

  it("matches last-10 when one has country code", () => {
    expect(phonesMatchExactly("919876543210", "9876543210")).toBe(true);
  });

  it("rejects different numbers", () => {
    expect(phonesMatchExactly("9876543210", "9876543211")).toBe(false);
  });
});

describe("resolvePosCustomerPhoneMatch", () => {
  it("incomplete under 10 digits", () => {
    expect(resolvePosCustomerPhoneMatch("98765", [c("1", "9876543210")]).kind).toBe(
      "incomplete",
    );
  });

  it("none when complete and unknown", () => {
    expect(resolvePosCustomerPhoneMatch("9876543210", []).kind).toBe("none");
    expect(
      resolvePosCustomerPhoneMatch("9876543210", [c("1", "1111111111")]).kind,
    ).toBe("none");
  });

  it("unique when exactly one exact match", () => {
    const result = resolvePosCustomerPhoneMatch("9876543210", [
      c("1", "9876543210", "Ravi"),
      c("2", "1111111111"),
    ]);
    expect(result).toEqual({
      kind: "unique",
      customer: c("1", "9876543210", "Ravi"),
    });
  });

  it("ambiguous when more than one exact match — do not guess", () => {
    const result = resolvePosCustomerPhoneMatch("9876543210", [
      c("1", "9876543210", "A"),
      c("2", "91-9876543210", "B"),
    ]);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.matches).toHaveLength(2);
    }
  });
});
