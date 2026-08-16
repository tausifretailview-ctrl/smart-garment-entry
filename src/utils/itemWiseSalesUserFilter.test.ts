import { describe, expect, it } from "vitest";
import { parseItemWiseUserFilter } from "./itemWiseSalesUserFilter";

describe("parseItemWiseUserFilter", () => {
  it("maps login user selection to created_by", () => {
    expect(parseItemWiseUserFilter("created:abc-123")).toEqual({
      createdById: "abc-123",
      salesmanName: null,
    });
  });

  it("maps salesman selection and legacy plain names", () => {
    expect(parseItemWiseUserFilter("salesman:BALAVANT")).toEqual({
      createdById: null,
      salesmanName: "BALAVANT",
    });
    expect(parseItemWiseUserFilter("GOVIND BHAI")).toEqual({
      createdById: null,
      salesmanName: "GOVIND BHAI",
    });
  });

  it("all clears both", () => {
    expect(parseItemWiseUserFilter("all")).toEqual({
      createdById: null,
      salesmanName: null,
    });
  });
});
