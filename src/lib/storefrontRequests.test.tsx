/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.fn();
vi.mock("@/storefront/storefrontClient", () => ({ submitStorefrontRequest: (...args: unknown[]) => submit(...args) }));

import {
  SHOPPER_DETAILS_STORAGE_KEY,
  STOREFRONT_REQUESTS_KEY,
  enquiryKindNote,
  enquiryKindOf,
  holdUntilLabel,
  parseStorefrontRequestSwitches,
  parseStorefrontRequests,
  restockMessage,
} from "./storefrontRequests";
import { StreetRequestPanel } from "@/storefront/StreetRequestPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("store requests: reserve & try, tell me when it's back", () => {
  beforeEach(() => {
    submit.mockReset();
    window.localStorage.clear();
  });

  it("offers a request only when the database lists it and the shop has not switched it off", () => {
    const features = ["reserve_try", "restock_alert"];
    expect(parseStorefrontRequests({ store_features: features, settings: {} })).toEqual({ reserve: true, restock: true });
    // A database without the function: no button, even though the shop never switched anything off.
    expect(parseStorefrontRequests({ settings: {} })).toEqual({ reserve: false, restock: false });
    expect(parseStorefrontRequests(null)).toEqual({ reserve: false, restock: false });
    expect(parseStorefrontRequests({ store_features: ["restock_alert"], settings: {} })).toEqual({ reserve: false, restock: true });
    expect(
      parseStorefrontRequests({ store_features: features, settings: { [STOREFRONT_REQUESTS_KEY]: { reserve: false } } }),
    ).toEqual({ reserve: false, restock: true });
    expect(parseStorefrontRequestSwitches(null)).toEqual({ reserve: true, restock: true });
    expect(parseStorefrontRequestSwitches({ [STOREFRONT_REQUESTS_KEY]: { restock: false } })).toEqual({ reserve: true, restock: false });
  });

  it("says till when a piece is held in plain words", () => {
    const now = new Date(2026, 10, 18, 18, 0, 0);
    expect(holdUntilLabel(new Date(2026, 10, 18, 21, 15, 0).toISOString(), now)).toBe("today, 9:15 pm");
    expect(holdUntilLabel(new Date(2026, 10, 19, 18, 30, 0).toISOString(), now)).toBe("tomorrow, 6:30 pm");
    expect(holdUntilLabel(new Date(2026, 10, 21, 10, 5, 0).toISOString(), now)).toMatch(/^21 Nov, 10:05 am$/);
    expect(holdUntilLabel(null, now)).toBeNull();
    expect(holdUntilLabel("junk", now)).toBeNull();
  });

  it("tells the shop what each request needs", () => {
    const now = new Date(2026, 10, 18, 18, 0, 0);
    const later = new Date(2026, 10, 19, 18, 0, 0).toISOString();
    const earlier = new Date(2026, 10, 17, 18, 0, 0).toISOString();
    expect(enquiryKindOf({})).toBe("enquiry");
    expect(enquiryKindOf({ kind: "junk" })).toBe("enquiry");
    expect(enquiryKindNote({ kind: "enquiry" }, undefined, now)).toBeNull();
    expect(enquiryKindNote({ kind: "reserve", hold_until: later, status: "new" }, undefined, now)).toEqual({
      tone: "amber",
      text: "Reserve & try · keep aside till tomorrow, 6:00 pm",
    });
    expect(enquiryKindNote({ kind: "reserve", hold_until: earlier, status: "new" }, undefined, now)?.text).toBe("Reserve & try · time is over");
    expect(enquiryKindNote({ kind: "restock", status: "new" }, 0, now)?.tone).toBe("sky");
    expect(enquiryKindNote({ kind: "restock", status: "new" }, undefined, now)?.tone).toBe("sky");
    expect(enquiryKindNote({ kind: "restock", status: "new" }, 3, now)).toEqual({
      tone: "emerald",
      text: "Back in stock now · tell the customer",
    });
    // Once the customer has been told, the row no longer asks for a message.
    expect(enquiryKindNote({ kind: "restock", status: "contacted" }, 3, now)?.tone).toBe("slate");
    expect(
      restockMessage({ customerName: "Asha Patel", productName: "Oxford Shirt", size: "M", shopName: "Style Hub", productUrl: "https://s.example/p/1" }),
    ).toBe("Hi Asha, good news from Style Hub! Oxford Shirt in size M is back in stock.\nhttps://s.example/p/1");
    expect(restockMessage({ customerName: "", productName: "Saree", shopName: "Style Hub" })).toBe(
      "Hi, good news from Style Hub! Saree is back in stock.",
    );
  });

  it("sends a reservation with name and mobile, and remembers them for next time", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = () =>
      act(() =>
        root.render(
          <StreetRequestPanel kind="reserve" slug="style-hub" productId="11111111-2222-4333-8444-555555555555" variantId="v1" sizeLabel="M" shopName="Style Hub" onClose={() => {}} />,
        ),
      );
    draw();
    const [name, phone] = Array.from(host.querySelectorAll("input")) as HTMLInputElement[];
    const form = host.querySelector("form") as HTMLFormElement;
    // A bad number never reaches the shop.
    act(() => {
      type(name, "Asha");
      type(phone, "123");
    });
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).not.toHaveBeenCalled();
    expect(host.querySelector(".st-req-error")).not.toBeNull();

    submit.mockResolvedValueOnce({ ok: false, error: "Every piece of this size is reserved right now. Please try again later.", holdUntil: null });
    act(() => type(phone, "98765 43210"));
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith({ slug: "style-hub", kind: "reserve", customerName: "Asha", customerPhone: "9876543210", productId: "11111111-2222-4333-8444-555555555555", variantId: "v1" });
    expect(host.querySelector(".st-req-error")?.textContent).toContain("reserved right now");
    expect(window.localStorage.getItem(SHOPPER_DETAILS_STORAGE_KEY)).toBeNull();

    submit.mockResolvedValueOnce({ ok: true, holdUntil: new Date(Date.now() + 86_400_000).toISOString() });
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.querySelector(".st-req-done")?.textContent).toContain("Style Hub is keeping size M aside till tomorrow");
    expect(JSON.parse(window.localStorage.getItem(SHOPPER_DETAILS_STORAGE_KEY)!)).toEqual({ name: "Asha", phone: "9876543210" });
    act(() => root.unmount());
    host.remove();
  });

  it("is wired into the store, the Enquiries list and the database", () => {
    const client = read("src/storefront/storefrontClient.ts");
    expect(client).toContain('"submit_public_storefront_request"');
    expect(client).toContain("payload.requests = parseStorefrontRequests(orgInfo);");
    const street = read("src/storefront/StreetStorefront.tsx");
    expect(street).toContain("<StreetRequestPanel");
    // A sold-out size can be chosen only when "tell me when it's back" is offered.
    expect(street).toContain("disabled={!option.inStock && !(requests.restock && option.variantId)}");
    // The sample catalogue never takes requests.
    expect(street).toContain("requests={sampleMode || !requests ? NO_STOREFRONT_REQUESTS : requests}");
    const settings = read("src/pages/WebsiteSettings.tsx");
    expect(settings).toContain("enquiryKindNote(row, stockNow)");
    expect(settings).toContain("Tell on WhatsApp: back in stock");
    expect(read("src/components/website/WebsiteThemePanel.tsx")).toContain("<StoreRequestsSettings orgId={orgId} />");

    const sql = read("supabase/migrations/20270505120000_website_reserve_and_restock.sql");
    expect(sql).toContain("'store_features', json_build_array('reserve_try', 'restock_alert')");
    expect(sql).toContain("CHECK (kind IN ('enquiry', 'reserve', 'restock'))");
    // The public website writes an enquiry row, never a bill.
    const fn = sql.slice(sql.indexOf("FUNCTION public.submit_public_storefront_request"), sql.indexOf("REVOKE ALL ON FUNCTION public.submit_public_storefront_request"));
    expect(fn).toContain("INSERT INTO public.website_enquiries");
    expect(fn).not.toMatch(/INSERT INTO public\.(sales|sale_items)\b/);
    expect(fn).toContain("storefront_public_lookup_rate_ok(v_org, 'request', v_phone, 8)");
    // Never more reservations for a size than the shop has pieces.
    expect(fn).toContain("IF v_held >= v_stock THEN");
  });
});
