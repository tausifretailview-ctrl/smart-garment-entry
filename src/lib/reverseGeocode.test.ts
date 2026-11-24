import { describe, expect, it } from "vitest";
import { areaLabelFromAddress, coordsLabel } from "./reverseGeocode";

describe("area label from an OpenStreetMap address", () => {
  it("locality and city", () => {
    expect(areaLabelFromAddress({ suburb: "Dadar West", city: "Mumbai", state: "Maharashtra" })).toBe("Dadar West, Mumbai");
  });
  it("falls back through the address parts", () => {
    expect(areaLabelFromAddress({ neighbourhood: "Hiranandani", town: "Thane" })).toBe("Hiranandani, Thane");
    expect(areaLabelFromAddress({ village: "Karjat" })).toBe("Karjat");
    expect(areaLabelFromAddress({ city: "Pune", city_district: "Pune" })).toBe("Pune");
    expect(areaLabelFromAddress({ state: "Goa" })).toBe("Goa");
    expect(areaLabelFromAddress({})).toBeNull();
    expect(areaLabelFromAddress(null)).toBeNull();
  });
  it("coordinates when no name", () => {
    expect(coordsLabel(19.01763, 72.85621)).toBe("19.0176, 72.8562");
  });
});
