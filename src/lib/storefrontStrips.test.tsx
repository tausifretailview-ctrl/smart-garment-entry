/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INR_RATES,
  STOREFRONT_CURRENCY_KEY,
  STOREFRONT_STRIPS_KEY,
  formatShopperPrice,
  parseStorefrontCurrency,
  parseStorefrontStrips,
  resolveStorefrontStrips,
  stripLinesFromText,
} from "./storefrontStrips";
import { StreetCurrencyPicker, StreetNoticeSlider, StreetRunningStrip } from "@/storefront/StreetStrips";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("store notice strips and currency picker", () => {
  it("reads saved strips; never set uses the shop's general lines, emptied stays hidden", () => {
    const saved = parseStorefrontStrips({
      [STOREFRONT_STRIPS_KEY]: { top: ["  No exchange / no return ", "No exchange / no return", "", 5], footer: [] },
    });
    expect(saved).toEqual({ top: ["No exchange / no return"], after_banner: null, footer: [] });
    const shown = resolveStorefrontStrips(saved, { upi: true, whatsapp: false, location: null });
    expect(shown.top).toEqual(["No exchange / no return"]);
    expect(shown.after_banner).toContain("Order online · pay by UPI");
    expect(shown.footer).toEqual([]);
    expect(parseStorefrontStrips(null)).toEqual({ top: null, after_banner: null, footer: null });
    expect(stripLinesFromText("a\n\n b \na\n" + "x".repeat(300))).toEqual(["a", "b", "x".repeat(160)]);
    expect(stripLinesFromText(Array.from({ length: 20 }, (_, i) => `n${i}`).join("\n"))).toHaveLength(8);
  });

  it("shows another currency as an estimate from the shop's rate, rupees as usual", () => {
    const currency = parseStorefrontCurrency({ [STOREFRONT_CURRENCY_KEY]: { rates: { USD: "80", EUR: -1, GBP: "x" } } });
    expect(currency.enabled).toBe(true);
    expect(currency.rates.USD).toBe(80);
    expect(currency.rates.EUR).toBe(DEFAULT_INR_RATES.EUR);
    expect(currency.rates.GBP).toBe(DEFAULT_INR_RATES.GBP);
    expect(formatShopperPrice(2400, "INR", currency)).toBe("₹2,400");
    expect(formatShopperPrice(2400, "USD", currency)).toBe("≈ $30.00");
    expect(formatShopperPrice(null, "USD", currency)).toBe("");
    expect(parseStorefrontCurrency({ [STOREFRONT_CURRENCY_KEY]: { enabled: false } }).enabled).toBe(false);
  });

  it("top strip steps through notices with the arrows", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<StreetNoticeSlider lines={["No exchange", "See size guide"]} />));
    const text = () => host.querySelector(".st-notice-text")?.textContent;
    expect(text()).toBe("No exchange");
    act(() => (host.querySelectorAll(".st-notice-arrow")[1] as HTMLButtonElement).click());
    expect(text()).toBe("See size guide");
    act(() => (host.querySelectorAll(".st-notice-arrow")[1] as HTMLButtonElement).click());
    expect(text()).toBe("No exchange");
    act(() => root.render(<StreetNoticeSlider lines={["Only one"]} />));
    expect(host.querySelectorAll(".st-notice-arrow")).toHaveLength(0);
    act(() => root.render(<StreetRunningStrip lines={[]} label="x" />));
    expect(host.innerHTML).toBe("");
    act(() => root.render(<StreetRunningStrip lines={["Pay by UPI", "Delivery 5 days"]} label="Payment and delivery" />));
    expect(host.querySelectorAll(".st-visually-hidden li")).toHaveLength(2);
    act(() => root.unmount());
  });

  it("currency picker opens, lists INR first and reports the choice", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    act(() => root.render(<StreetCurrencyPicker value="INR" onChange={onChange} />));
    expect(host.querySelector(".st-currency-btn")?.textContent).toContain("INR");
    act(() => (host.querySelector(".st-currency-btn") as HTMLButtonElement).click());
    const options = host.querySelectorAll(".st-currency-option");
    expect(options[0].textContent).toContain("Indian Rupee (INR)");
    expect(host.querySelector(".st-currency-note")?.textContent).toContain("You pay in Indian rupees");
    act(() => (options[1] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith("USD");
    expect(host.querySelector(".st-currency-menu")).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("is wired into the store, the theme settings and the public settings function", () => {
    const street = read("src/storefront/StreetStorefront.tsx");
    expect(street).toContain("<StreetNoticeSlider lines={stripLines.top} />");
    expect(street).toContain('<StreetRunningStrip lines={stripLines.after_banner} label="Shop updates" />');
    expect(street).toContain('<StreetRunningStrip lines={stripLines.footer} label="Payment and delivery" tone="soft" />');
    expect(street).toContain("<StreetCurrencyPicker");
    // The bag and checkout keep rupees: only the label is converted.
    expect(street).toContain("priceLabel: formatShopperPrice(converted.price, activeCurrency, currencyConfig)");
    expect(street).toContain('className="st-section st-cats"');
    expect(read("src/components/website/WebsiteThemePanel.tsx")).toContain("<StoreStripsSettings orgId={orgId} />");
    const sql = read("supabase/migrations/20270506120000_org_public_info_store_strips.sql");
    expect(sql).toContain("'storefront_strips', o.settings -> 'storefront_strips'");
    expect(sql).toContain("'storefront_currency', o.settings -> 'storefront_currency'");
    expect(sql).toContain("'store_features', json_build_array('reserve_try', 'restock_alert')");
  });
});
