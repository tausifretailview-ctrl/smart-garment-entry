import { describe, expect, it } from "vitest";
import {
  LABEL_DESIGNER_FONT_FAMILIES,
  mapLabelFontFamilyToPdfGroup,
} from "./labelPdfFonts";
import {
  LABEL_NARROW_FONT_FACE_CSS,
  LABEL_NARROW_FONT_FAMILY,
} from "./labelFontFace";

describe("condensed thermal label font (Arial Narrow / EzzyNarrow)", () => {
  it("is offered in the designer dropdown", () => {
    expect(LABEL_DESIGNER_FONT_FAMILIES).toContain(LABEL_NARROW_FONT_FAMILY);
    expect(LABEL_NARROW_FONT_FAMILY).toBe(
      "'Arial Narrow', 'EzzyNarrow', sans-serif",
    );
  });

  it("maps the narrow stack to the Helvetica PDF group (A4 PDF unchanged)", () => {
    expect(mapLabelFontFamilyToPdfGroup(LABEL_NARROW_FONT_FAMILY)).toBe(
      "helvetica",
    );
    expect(mapLabelFontFamilyToPdfGroup("Arial Narrow")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("EzzyNarrow")).toBe("helvetica");
  });

  it("keeps the Arial default for fields without a fontFamily", () => {
    expect(mapLabelFontFamilyToPdfGroup(undefined)).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup(null)).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("")).toBe("helvetica");
    expect(mapLabelFontFamilyToPdfGroup("Arial")).toBe("helvetica");
  });

  it("inlines both EzzyNarrow weights as base64 data URIs", () => {
    expect(LABEL_NARROW_FONT_FACE_CSS).toContain("font-family: 'EzzyNarrow'");
    expect(LABEL_NARROW_FONT_FACE_CSS).toContain("font-weight: 400");
    expect(LABEL_NARROW_FONT_FACE_CSS).toContain("font-weight: 700");
    expect(LABEL_NARROW_FONT_FACE_CSS).toContain("data:font/woff2;base64,");
  });
});
