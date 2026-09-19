import { describe, expect, it } from "vitest";
import { mergePRNTemplate } from "./prnTemplateParser";

describe("PRN {DISPERCENT}", () => {
  it("prints DIS: 25% from stored Sale Disc %", () => {
    expect(mergePRNTemplate("DISC {DISPERCENT}", { saleDiscPercent: 25 })).toBe("DISC DIS: 25%");
  });

  it("is blank when Sale Disc % is unset or 0", () => {
    expect(mergePRNTemplate("DISC {DISPERCENT}", { saleDiscPercent: 0 })).toBe("DISC ");
    expect(mergePRNTemplate("DISC {DISPERCENT}", {})).toBe("DISC ");
  });
});
