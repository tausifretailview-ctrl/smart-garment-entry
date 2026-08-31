import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HIDDEN_SETTINGS_TABS,
  POS_TAB_SETTING_FIELD_IDS,
  SETTINGS_TAB_IDS,
  SETTINGS_TAB_ITEMS,
  SETTINGS_TAB_SUBTITLE,
  coerceSettingsTab,
  isVisibleSettingsTab,
} from "@/components/settings/settingsChrome";

const here = dirname(fileURLToPath(import.meta.url));
const settingsPage = readFileSync(resolve(here, "../../pages/Settings.tsx"), "utf8");
const posForm = readFileSync(resolve(here, "./PosSettingsForm.tsx"), "utf8");

describe("settingsChrome", () => {
  it("exposes POS and hides SMS", () => {
    expect(SETTINGS_TAB_IDS).toContain("pos");
    expect(SETTINGS_TAB_IDS).toContain("sale");
    expect(SETTINGS_TAB_IDS).not.toContain("sms");
    expect(HIDDEN_SETTINGS_TABS).toEqual(["sms", "backup"]);
    expect(SETTINGS_TAB_ITEMS.some((tab) => tab.label === "SMS")).toBe(false);
    expect(SETTINGS_TAB_ITEMS.some((tab) => tab.id === "backup")).toBe(false);
    expect(SETTINGS_TAB_ITEMS.some((tab) => tab.id === "pos" && tab.label === "POS")).toBe(true);
  });

  it("builds a subtitle without SMS", () => {
    expect(SETTINGS_TAB_SUBTITLE).toContain("POS");
    expect(SETTINGS_TAB_SUBTITLE).toContain("Sale");
    expect(SETTINGS_TAB_SUBTITLE).not.toMatch(/SMS/i);
    expect(SETTINGS_TAB_SUBTITLE).not.toMatch(/Backup/i);
  });

  it("coerces hidden or unknown tabs to company", () => {
    expect(isVisibleSettingsTab("sms")).toBe(false);
    expect(isVisibleSettingsTab("backup")).toBe(false);
    expect(isVisibleSettingsTab("pos")).toBe(true);
    expect(coerceSettingsTab("sms")).toBe("company");
    expect(coerceSettingsTab("backup")).toBe("company");
    expect(coerceSettingsTab("unknown")).toBe("company");
    expect(coerceSettingsTab("pos")).toBe("pos");
    expect(coerceSettingsTab(undefined)).toBe("company");
  });

  it("lists every POS-tab control that left Sale", () => {
    expect(POS_TAB_SETTING_FIELD_IDS).toEqual(
      expect.arrayContaining([
        "default_pos_tax_type",
        "pos_numbering_format",
        "pos_series_start",
        "default_discount_in_rupees",
        "default_discount",
        "pos_allow_date_change",
        "allow_pos_edit_unit_price",
        "pos_unit_price_override_confirm_pct",
        "pos_quick_price_code",
        "pos_retain_salesman",
        "pos_barcode_price_mode",
        "pos_goods_ask_qty_dialog",
        "pos_category_tier_pricing",
        "pos_scheme_auto_calculate_discount",
        "pos_bill_format",
        "pos_invoice_template",
      ]),
    );
    expect(new Set(POS_TAB_SETTING_FIELD_IDS).size).toBe(POS_TAB_SETTING_FIELD_IDS.length);
  });

  it("keeps POS field controls on the POS form, not the Sale page markup", () => {
    expect(settingsPage).not.toMatch(/value=["']sms["']/);
    expect(settingsPage).not.toMatch(/value=["']backup["']/);
    expect(settingsPage).not.toContain("LazyBackupSettings");
    expect(settingsPage).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
    expect(settingsPage).not.toContain("fix/purchase-sold-qty-import");
    expect(settingsPage).toContain("PosSettingsForm");

    for (const id of POS_TAB_SETTING_FIELD_IDS) {
      expect(settingsPage).not.toContain(`id="${id}"`);
      if (id === "pos_category_tier_pricing" || id === "pos_scheme_auto_calculate_discount") {
        expect(posForm).toContain("CategoryTierPricingSettings");
        continue;
      }
      const inPosForm = posForm.includes(`id="${id}"`) || posForm.includes(`htmlFor="${id}"`);
      expect(inPosForm, `${id} should be wired in PosSettingsForm`).toBe(true);
    }
  });
});
