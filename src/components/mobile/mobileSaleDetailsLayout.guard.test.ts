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

  it("customer/supplier balance reports use paginated fetchAll* utilities", () => {
    const src = readFileSync(join(here, "MobileOwnerBalanceReports.tsx"), "utf8");
    expect(src).toContain("fetchAllCustomers");
    expect(src).toContain("fetchAllSuppliers");
    expect(src).not.toMatch(/\.from\("customers"\)/);
    expect(src).not.toMatch(/\.from\("suppliers"\)/);

    const util = readFileSync(join(here, "../../utils/fetchAllRows.ts"), "utf8");
    expect(util).toMatch(/\.from\("customers"\)[\s\S]*?\.range\(offset, offset \+ pageSize - 1\)/);
    expect(util).toMatch(/\.from\("suppliers"\)[\s\S]*?\.range\(offset, offset \+ pageSize - 1\)/);
    expect(util).toContain("pageSize = 1000");
    expect(util).toContain(
      "id, customer_name, phone, email, gst_number, address, opening_balance, points_balance, discount_percent",
    );
    expect(util).toContain("id, supplier_name, phone, email, gst_number, address, opening_balance");
  });
});

describe("Sales Summary WhatsApp", () => {
  it("opens wa.me to the customer number via useWhatsAppSend", () => {
    const src = readFileSync(join(here, "../../pages/mobile/MobileSalesHub.tsx"), "utf8");
    expect(src).toContain("useWhatsAppSend");
    expect(src).toContain("resolveSaleWhatsAppPhone");
    expect(src).toContain("customers(gst_number, phone)");
    expect(src).not.toMatch(/wa\.me\/\?text=/);
  });
});
