/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { getOrgSlugFromUrl, isValidOrgSlug, storeOrgSlug } from "./orgSlug";

describe("orgSlug reserved app paths", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("does not treat organization-setup or auth as a shop slug", () => {
    expect(isValidOrgSlug("trendzo")).toBe(true);
    expect(isValidOrgSlug("organization-setup")).toBe(false);
    expect(isValidOrgSlug("auth")).toBe(false);
    expect(isValidOrgSlug("reset-password")).toBe(false);
  });

  it("does not read a shop slug from /organization-setup", () => {
    window.history.replaceState({}, "", "/organization-setup");
    expect(getOrgSlugFromUrl()).toBeNull();
  });

  it("reads a real shop slug from the first path segment", () => {
    window.history.replaceState({}, "", "/trendzo/pos-sales");
    expect(getOrgSlugFromUrl()).toBe("trendzo");
  });

  it("refuses to persist a reserved path as selectedOrgSlug", () => {
    expect(storeOrgSlug("organization-setup")).toBeNull();
    expect(localStorage.getItem("selectedOrgSlug")).toBeNull();
    expect(storeOrgSlug("trendzo")).toBe("trendzo");
    expect(localStorage.getItem("selectedOrgSlug")).toBe("trendzo");
  });
});
