import { describe, expect, it } from "vitest";
import {
  formatKidsParticularsLine,
  KIDS_MAX_NAME_LEN_58,
  KIDS_MAX_NAME_LEN_80,
  kidsLayoutForPaper,
} from "@/utils/kidsThermalParticulars";

const sandal = {
  particulars: "MFR1305-SANDAL WITH ANKLE STRAP",
  size: "5",
  mrp: 1499,
  rate: 1499,
};

describe("kids 80mm Particulars width", () => {
  it("80mm name cap is wide enough to reach Qty (not the old 16-char cut)", () => {
    expect(KIDS_MAX_NAME_LEN_80).toBeGreaterThan(16);
    const line = formatKidsParticularsLine(sandal, KIDS_MAX_NAME_LEN_80, true);
    expect(line.startsWith("MFR1305-SANDAL WITH ANKLE STRAP")).toBe(true);
    expect(line).not.toMatch(/SANDAL\.\./);
    expect(line).toContain("5");
    expect(line).toContain("1499.000");
  });

  it("80mm Qty/Amt columns are compact so Particulars flexes up to Qty", () => {
    const layout = kidsLayoutForPaper("80mm");
    expect(layout.colQtyFlex).toBe("0 0 8mm");
    expect(layout.colAmtFlex).toBe("0 0 16mm");
    expect(layout.maxNameLen).toBe(KIDS_MAX_NAME_LEN_80);
  });

  it("still JS-truncates only when the name exceeds the paper cap", () => {
    const huge = "X".repeat(KIDS_MAX_NAME_LEN_80 + 8);
    const line = formatKidsParticularsLine(
      { particulars: huge, rate: 100 },
      KIDS_MAX_NAME_LEN_80,
      false,
    );
    expect(line.endsWith("..")).toBe(true);
    expect(line.length).toBe(KIDS_MAX_NAME_LEN_80);
  });

  it("58mm stays narrower than 80mm", () => {
    expect(KIDS_MAX_NAME_LEN_58).toBeLessThan(KIDS_MAX_NAME_LEN_80);
    expect(kidsLayoutForPaper("58mm").colQtyFlex).toBe("0 0 11%");
  });
});
