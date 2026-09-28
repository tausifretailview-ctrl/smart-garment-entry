import { describe, expect, it } from "vitest";
import { descriptionNamesReturn } from "./saleReturnRefundPayout";

describe("descriptionNamesReturn", () => {
  it("matches the exact return number", () => {
    expect(descriptionNamesReturn("Refund paid for Sale Return: SR/26-27/32", "SR/26-27/32")).toBe(true);
    expect(descriptionNamesReturn("Credit note refund for SR/26-27/32 to ZIBA", "SR/26-27/32")).toBe(true);
  });

  it("does not match a longer return number", () => {
    expect(descriptionNamesReturn("Refund paid for Sale Return: SR/26-27/320", "SR/26-27/32")).toBe(false);
    expect(
      descriptionNamesReturn("Refund paid for SR/26-27/320 and SR/26-27/32", "SR/26-27/32"),
    ).toBe(true);
  });
});
