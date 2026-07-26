import { describe, expect, it } from "vitest";
import { retailErpWhatsAppProductLabel } from "./retailErpWhatsAppProductLabel";

describe("retailErpWhatsAppProductLabel", () => {
  it("prefers explicit productNameOnly", () => {
    expect(
      retailErpWhatsAppProductLabel("LONG-NAME-BRAND-CAT", "SHORT"),
    ).toBe("SHORT");
  });

  it("takes the first hyphen segment when no explicit name", () => {
    expect(
      retailErpWhatsAppProductLabel("31 PINK DUCHESS-COSMETICS-REVLON-PINK"),
    ).toBe("31 PINK DUCHESS");
  });

  it("returns empty for blank input", () => {
    expect(retailErpWhatsAppProductLabel("")).toBe("");
  });
});
