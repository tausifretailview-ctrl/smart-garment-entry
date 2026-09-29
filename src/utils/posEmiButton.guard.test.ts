import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("POS EMI button", () => {
  it("is shown only when Mobile ERP and financer billing are on", () => {
    const src = readFileSync(resolve(here, "../pages/POSSales.tsx"), "utf8");
    expect(src).toContain("{mobileERP.enabled && mobileERP.financer_billing && (");
    expect(src).toContain("<span>EMI</span>");
    expect(src).not.toContain("Enable Mobile ERP in Settings");
    expect(src).not.toContain("disabled={!mobileERP.enabled}");
  });
});
