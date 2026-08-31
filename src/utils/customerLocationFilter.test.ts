import { describe, expect, it } from "vitest";
import {
  customerAddressMatchesLocation,
  customerLocationMatchTerms,
  customerLocationOrFilter,
  extractLocationLabelFromAddress,
  uniqueCustomerLocations,
} from "./customerLocationFilter";

describe("Customer Master location filter", () => {
  it("matches Bangalore clients whether address says Bangalore or Bengaluru", () => {
    expect(customerAddressMatchesLocation("12 MG Road, Bangalore 560001", "Bangalore")).toBe(
      true,
    );
    expect(customerAddressMatchesLocation("Indiranagar, Bengaluru", "Bangalore")).toBe(true);
    expect(customerAddressMatchesLocation("HSR Layout, BENGALURU", "bengaluru")).toBe(true);
    expect(customerAddressMatchesLocation("Andheri West, Mumbai", "Bangalore")).toBe(false);
  });

  it("builds an address ILIKE or-filter for PostgREST", () => {
    expect(customerLocationOrFilter("Bangalore")).toBe(
      "address.ilike.%bangalore%,address.ilike.%bengaluru%",
    );
    expect(customerLocationOrFilter("   ")).toBeNull();
  });

  it("expands known city aliases", () => {
    expect(customerLocationMatchTerms("Mumbai")).toEqual(["mumbai", "bombay"]);
    expect(customerLocationMatchTerms("Gurugram")).toEqual(["gurugram", "gurgaon"]);
  });

  it("extracts the city from a typical Indian address", () => {
    expect(extractLocationLabelFromAddress("42 Church Street, Bangalore 560001")).toBe(
      "Bangalore",
    );
    expect(extractLocationLabelFromAddress("Koramangala / Bengaluru")).toBe("Bengaluru");
  });

  it("dedupes Bangalore and Bengaluru in the location dropdown", () => {
    const cities = uniqueCustomerLocations([
      "MG Road, Bangalore",
      "Whitefield, Bengaluru",
      "Bandra, Mumbai",
      null,
      "",
    ]);
    expect(cities).toContain("Mumbai");
    expect(cities.filter((c) => /bangal|bengal/i.test(c))).toHaveLength(1);
  });
});
