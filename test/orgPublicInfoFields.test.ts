import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STOREFRONT_BANNERS_KEY } from "@/lib/storefrontBanners";
import { STOREFRONT_THEME_KEY } from "@/lib/storefrontThemes";
import { STOREFRONT_PRODUCT_SECTIONS_KEY, STOREFRONT_SECTIONS_KEY } from "@/lib/websiteSectionStore";

/**
 * get_org_public_info is callable without signing in, so it returns named fields only
 * (20270415120000). If the login page or the public store starts reading a new key,
 * this fails until the key is added to the function too.
 */
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

function latestDefinition(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /FUNCTION public\.get_org_public_info\s*\(/i.test(readFileSync(path.join(MIGRATIONS, f), "utf8")));
  const sql = readFileSync(path.join(MIGRATIONS, files[files.length - 1]), "utf8");
  const start = sql.search(/CREATE OR REPLACE FUNCTION public\.get_org_public_info/i);
  return sql.slice(start, sql.indexOf("$$;", start));
}

function readKeys(file: string, pattern: RegExp): string[] {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  return [...new Set([...src.matchAll(pattern)].map((m) => m[1]))];
}

describe("get_org_public_info returns what its public readers need, and only that", () => {
  const fn = latestDefinition();
  const settingsPart = fn.slice(fn.indexOf("'settings'"), fn.indexOf("'business_name'"));
  const billPart = fn.slice(fn.indexOf("'bill_barcode_settings'"));

  it("no longer returns the whole settings objects", () => {
    expect(fn).not.toMatch(/'settings',\s*o\.settings\s*,/);
    expect(fn).not.toMatch(/'bill_barcode_settings',\s*s\.bill_barcode_settings\s*\)/);
  });

  it("returns every organization setting the public store reads", () => {
    const storeReads = [
      ...readKeys("src/storefront/storefrontTheme.ts", /orgSettings\.([a-z_]+)/g),
      STOREFRONT_THEME_KEY,
      STOREFRONT_BANNERS_KEY,
      STOREFRONT_SECTIONS_KEY,
      STOREFRONT_PRODUCT_SECTIONS_KEY,
    ];
    expect(storeReads).toEqual(expect.arrayContaining(["address", "mobile_number"]));
    for (const key of storeReads) expect(settingsPart).toContain(`'${key}'`);
  });

  it("returns every bill setting the login page and the store read", () => {
    const reads = [
      ...readKeys("src/pages/OrgAuth.tsx", /bill_barcode_settings\??\.([a-z_]+)/g),
      ...readKeys("src/storefront/storefrontTheme.ts", /bill\.([a-z_]+)/g),
      // resolveCompanyUpiId (storefront UPI) reads these three.
      "upi_id",
      "upi_id_2",
      "active_upi_id",
    ];
    expect(reads).toEqual(expect.arrayContaining(["logo_url", "login_display_name", "upi_business_name"]));
    for (const key of reads) expect(billPart).toContain(`'${key}'`);
  });

  it("does not send invoice or POS options to the public", () => {
    for (const key of ["stamp_image_base64", "cash_drawer_pin", "dc_upi_id", "footer_text", "einvoice_settings"]) {
      expect(fn).not.toContain(`'${key}'`);
    }
  });
});
