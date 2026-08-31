import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("mobile sale details + size-wise regressions", () => {
  it("Sale Details sheet covers the Sales Summary header (no 92vh peek)", () => {
    const src = readFileSync(join(here, "MobileInvoiceDetail.tsx"), "utf8");
    expect(src).toContain("h-[100dvh]");
    expect(src).not.toContain("92vh");
  });

  it("item grid uses minmax so Amt is not clipped", () => {
    const src = readFileSync(join(here, "MobileInvoiceDetail.tsx"), "utf8");
    expect(src).toContain("minmax(0,1fr)");
    expect(src).toContain("line-clamp-2");
  });

  it("size-wise fallback selects products.style, not department", () => {
    const src = readFileSync(join(here, "MobileOwnerBalanceReports.tsx"), "utf8");
    expect(src).toContain("brand, category, style");
    expect(src).not.toContain("brand, category, department");
  });
});
