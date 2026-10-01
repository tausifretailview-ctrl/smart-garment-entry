import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("POS EMI option (works without Mobile ERP mode)", () => {
  it("Settings has the pos_emi_option switch", () => {
    const src = read("src/pages/Settings.tsx");
    expect(src).toContain("POS EMI option");
    expect(src).toContain("pos_emi_option: checked");
  });

  it("the hook keeps Mobile ERP shops unchanged and honours the flag", () => {
    const src = read("src/hooks/useMobileERP.ts");
    expect(src).toContain("export function usePosEmiOption");
    expect(src).toContain("mobileErp.enabled && mobileErp.financer_billing");
    expect(src).toContain("pos_emi_option === true");
  });

  it("POS shows the EMI button and dialog from the hook, not Mobile ERP alone", () => {
    const src = read("src/pages/POSSales.tsx");
    expect(src.match(/\{showEmiOption && \(/g)?.length).toBe(2);
    expect(src).not.toContain("{mobileERP.enabled && mobileERP.financer_billing && (");
  });
});
