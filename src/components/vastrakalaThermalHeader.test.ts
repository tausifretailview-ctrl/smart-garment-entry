import { describe, expect, it } from "vitest";
import { splitVastrakalaShopHeader } from "@/utils/vastrakalaThermalHeader";

describe("splitVastrakalaShopHeader", () => {
  it("splits long ERP name into title + tagline", () => {
    expect(splitVastrakalaShopHeader("VASTRAKALA SAREES & LADIES WEAR")).toEqual({
      title: "VASTRAKALA",
      tagline: "Sarees & ladies wear",
    });
  });

  it("uses default tagline when only one word", () => {
    expect(splitVastrakalaShopHeader("Vastrakala")).toEqual({
      title: "VASTRAKALA",
      tagline: "Sarees & ladies wear",
    });
  });
});
