/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFieldSalesPwaManifest,
  applyOrgPwaManifest,
  buildFieldSalesManifest,
  fieldSalesInstallLink,
} from "./orgPwaManifest";

describe("Field Sales install (salesman phone)", () => {
  let n = 0;
  const blobs = new Map<string, string>();
  beforeEach(() => {
    document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">';
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        const url = `blob:test/${++n}`;
        void b.text().then((t) => blobs.set(url, t));
        return url;
      },
      revokeObjectURL: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is its own app that opens the salesman screens of this shop", () => {
    const m = buildFieldSalesManifest("Swamini", "Swamini Sarees", "https://app.example.in/");
    expect(m).toMatchObject({
      id: "https://app.example.in/swamini/salesman",
      start_url: "https://app.example.in/swamini/salesman?app=fieldsales",
      scope: "https://app.example.in/",
      name: "Swamini Sarees · Field Sales",
      short_name: "Field Sales",
      display: "standalone",
    });
    expect(m.icons.every((i) => i.src.startsWith("https://app.example.in/icon-field-sales-"))).toBe(true);
    expect(fieldSalesInstallLink("Swamini", "https://app.example.in")).toBe("https://app.example.in/swamini/field-sales");
  });

  it("Field Sales manifest wins on its screens; leaving puts the shop app back", () => {
    applyOrgPwaManifest("swamini", "Swamini Sarees");
    const link = () => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    expect(link().getAttribute("data-ezzy-org-manifest")).toBe("swamini");

    const restore = applyFieldSalesPwaManifest("swamini", "Swamini Sarees");
    expect(link().getAttribute("data-ezzy-field-sales-manifest")).toBe("swamini");
    const fieldHref = link().href;

    // The shop layout re-applying its manifest must not take the Field Sales install away.
    applyOrgPwaManifest("swamini", "Swamini Sarees");
    expect(link().href).toBe(fieldHref);

    restore();
    expect(link().hasAttribute("data-ezzy-field-sales-manifest")).toBe(false);
    expect(link().getAttribute("data-ezzy-org-manifest")).toBe("swamini");
    expect(link().href).not.toBe(fieldHref);
  });
});
