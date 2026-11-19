import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

const svg = (w: number, h: number, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#d8c3a5"/><rect x="${w * 0.6}" y="0" width="${w * 0.4}" height="${h}" fill="#7a5c3e"/><text x="40" y="${h / 2}" font-size="${h / 6}" fill="#111">${label}</text></svg>`;

const products = Array.from({ length: 8 }, (_, i) => ({
  id: `w${i}`, product_id: `p${i}`, name: ["2154-JEANS", "2PCS SET", "SHIRT", "SHIRT-F/S"][i % 4],
  brand: "QASANI", category: ["SHIRT", "TROUSER"][i % 2], display_order: i, display_price: 500 + i * 100,
  photo_urls: [`https://img.example/p${i}.svg`], stock_status: "in_stock", stock_left: 5,
  variants: i === 3 ? [{ id: `v${i}`, size: "NONE", color: null, display_price: 1500, stock_status: "in_stock", stock_left: 2 }]
    : i === 5 ? [{ id: `v${i}`, size: "0", color: null, display_price: 379, stock_status: "in_stock", stock_left: 2 }]
    : [{ id: `v${i}a`, size: "S", color: "BLACK", display_price: 600, stock_status: "in_stock", stock_left: 3 }, { id: `v${i}b`, size: "M", color: "BLACK", display_price: 600, stock_status: "in_stock", stock_left: 3 }],
}));

/**
 * Street theme store on desktop (user report): the home banner spans the full screen width
 * (it was pinned to 1360px by the phone 2:1 rule), "no size" placeholders are not shown as
 * sizes, a single shop video sits centred, the page widens on big screens and the 3D
 * showcase scales up.
 */
for (const width of [1366, 1920, 2560]) {
  test(`Street store on a ${width}px desktop: full-width banner, no placeholder sizes`, async ({ page, backend }, testInfo) => {
    backend.onRpc("get_public_storefront", () => ({
      published: true,
      shop: { name: "QASANI", slug: E2E_ORG_SLUG, upi_id: "x@upi" },
      products,
      menus: [
        { id: "m1", label: "SHIRT", category_filter: "SHIRT", display_order: 1, parent_id: null },
        { id: "m2", label: "TROUSER", category_filter: "TROUSER", display_order: 2, parent_id: null },
      ],
    }));
    backend.onRpc("get_org_public_info", () => ({
      id: E2E_ORG_ID, name: "QASANI", slug: E2E_ORG_SLUG,
      settings: {
        storefront_theme: "street",
        storefront_banners: [{ id: "b1", image_url: "https://img.example/banner.svg", heading: "", subheading: "", target: "" }],
        storefront_videos: [{ id: "vid1", video_url: "https://img.example/clip.mp4", caption: "Emerald Bloom Suit", target: "" }],
      },
    }));
    await page.route("https://img.example/**", (route) => {
      const name = route.request().url();
      const body = name.includes("banner") ? svg(2400, 1200, "BANNER 2:1") : svg(600, 800, "P");
      return route.fulfill({ contentType: "image/svg+xml", body });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${E2E_ORG_SLUG}/store`);
    await page.waitForSelector(".st-hero", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const hero = await page.locator(".st-hero").boundingBox();
    const photo = await page.locator(".st-slide.st-on .st-slide-photo").boundingBox();
    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.round(hero!.width)).toBe(pageWidth);
    expect(Math.round(photo!.width)).toBe(pageWidth);
    expect(hero!.height).toBeGreaterThanOrEqual(460);
    expect(hero!.height).toBeLessThanOrEqual(780);
    // "NONE" / "0" sizes are free-size placeholders: no size line on those cards.
    const sizeLines = await page.locator(".st-card-sizes").allTextContents();
    expect(sizeLines.length).toBeGreaterThan(0);
    for (const line of sizeLines) expect(line).not.toMatch(/\bNONE\b|^0$/);
    // One shop video: centred under its heading, not a lone card on the left.
    const reel = await page.locator(".st-reel").first().boundingBox();
    const reelCentre = reel!.x + reel!.width / 2;
    expect(Math.abs(reelCentre - pageWidth / 2)).toBeLessThan(40);
    // The page grows with big screens; the 3D showcase is not a fixed 980 x 460 box.
    const content = await page.locator(".st-grid").first().boundingBox();
    const stage = await page.locator(".st-show-stage").boundingBox();
    if (width >= 1920) expect(content!.width).toBeGreaterThan(1600);
    expect(stage!.height).toBeGreaterThanOrEqual(460);
    if (width >= 1920) expect(stage!.width).toBeGreaterThan(1200);
    await page.screenshot({ path: testInfo.outputPath(`store-${width}.png`) });
  });
}
