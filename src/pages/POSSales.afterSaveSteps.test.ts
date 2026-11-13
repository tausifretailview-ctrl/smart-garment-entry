import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The three POS save paths (edit save, F1–F5, F6 Mix) share their after-save steps through one
 * function each, so a step changed on one path cannot be missed on another (Plan Phase 4).
 */
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "POSSales.tsx"), "utf8");

function handlerBody(start: string): string {
  const a = src.indexOf(start);
  expect(a, `missing: ${start}`).toBeGreaterThan(-1);
  return src.slice(a, src.indexOf("\n  };", a));
}

const handlers = [
  "const handleSaveSale = async (",
  "const handlePaymentAndPrint = async (",
  "const handleMixPaymentSave = async (",
];

describe("POSSales after-save steps", () => {
  for (const h of handlers) {
    it(`${h.slice(6, h.indexOf(" ="))} uses the shared financer, commission and reset steps`, () => {
      const body = handlerBody(h);
      expect(body).toContain("await saveFinancerAfterSave(result)");
      expect(body).toContain("recordCommissionAfterSave(result,");
      expect(body).toContain("resetPosBillAfterSave()");
    });
  }

  it("the finance-discount voucher and commission booking are written once", () => {
    // One call each, inside the shared helpers (plus the import / offline-sync paths).
    expect(src.split("await syncFinanceDiscountVoucher(").length - 1).toBe(1);
    expect(src.split("shouldCreatePosCommissionOnSave({ salesmanName, isEditingExistingSale })").length - 1).toBe(1);
  });

  it("commission is skipped for bills saved offline", () => {
    const helper = handlerBody("const recordCommissionAfterSave = (");
    expect(helper).toContain(".offline) return;");
  });
});
