import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src/storefront/street-storefront.css"), "utf8");

describe("Street store home banner on desktop", () => {
  it("drops the phone 2:1 shape on desktop so the banner spans the full width", () => {
    // The last desktop rule for the hero must reset aspect-ratio and take the full width;
    // a 2:1 ratio with a fixed height pinned the banner to 1360px wide (user report).
    const phoneRule = css.lastIndexOf(".street-store .st-hero-images { aspect-ratio: 2 / 1; }");
    expect(phoneRule).toBeGreaterThan(-1);
    const after = css.slice(phoneRule);
    const desktop = after.slice(after.indexOf("@media (min-width: 1024px)"));
    const heroRule = desktop.slice(0, desktop.indexOf("}") + 1);
    expect(heroRule).toMatch(/aspect-ratio:\s*auto/);
    expect(heroRule).toMatch(/width:\s*100%/);
    expect(heroRule).toMatch(/height:\s*clamp\(460px,\s*min\(42vw,\s*78vh\),\s*780px\)/);
  });

  it("centres a short category row on desktop without hiding the start of a long one", () => {
    expect(css).toMatch(/\.st-cats-rail \{[^}]*justify-content:\s*safe center/);
  });

  it("centres a short video row, widens the page on big screens and scales the showcase", () => {
    expect(css).toMatch(/\.st-reels\[data-few="true"\] \.st-reel-rail \{[^}]*justify-content:\s*safe center/);
    expect(css).toMatch(/--st-page:\s*min\(1920px,\s*94vw\)/);
    expect(css).toMatch(/\.st-show-stage \{[^}]*height:\s*clamp\(460px,\s*32vw,\s*640px\)/);
  });
});
