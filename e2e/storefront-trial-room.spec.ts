import { deflateSync } from "node:zlib";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * AI Trial Room: "Try it on" on a store product page. The shopper adds a photo, the store sends
 * it (scaled down) with the product to the storefront-try-on function and shows the preview.
 * The function is answered here; the real AI call is not part of this test.
 */
const PRODUCT_ID = "3f0b8a52-6d1c-4e6f-9a57-0d2b1c9e4f10";
const PRODUCT_PHOTO = "https://img.example/kurta.svg";

const svg = (label: string, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="100%" height="100%" fill="${fill}"/><text x="40" y="400" font-size="60" fill="#111">${label}</text></svg>`;

/** A plain PNG (the shopper's "photo"), big enough to pass the size check. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0).map((_, i) => [r, g, b][i % 3])]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const RESULT = `data:image/png;base64,${png(300, 400, [20, 120, 90]).toString("base64")}`;

function store(backend: import("./support/mockBackend").MockBackend, opts: { theme?: string; trialRoom: boolean; features?: string[] }) {
  backend.onRpc("get_public_storefront", () => ({
    published: true,
    shop: { name: "ELLA NOOR", slug: E2E_ORG_SLUG },
    products: [
      {
        id: "w1", product_id: PRODUCT_ID, name: "Silk Kurta", brand: "NOOR", category: "KURTA", display_order: 1,
        display_price: 1499, photo_urls: [PRODUCT_PHOTO], stock_status: "in_stock", stock_left: 4,
        variants: [{ id: "v1", size: "M", color: "RED", display_price: 1499, stock_status: "in_stock", stock_left: 4 }],
      },
    ],
    menus: [],
  }));
  backend.onRpc("get_org_public_info", () => ({
    id: E2E_ORG_ID, name: "ELLA NOOR", slug: E2E_ORG_SLUG,
    store_features: opts.features ?? ["reserve_try", "restock_alert", "trial_room"],
    settings: {
      ...(opts.theme ? { storefront_theme: opts.theme } : {}),
      storefront_trial_room: { enabled: opts.trialRoom, daily_limit: 50 },
    },
  }));
}

for (const theme of [undefined, "street", "ella-noor"] as const) {
  test(`Try it on (${theme ?? "default"} theme): photo in, preview out`, async ({ page, backend }, testInfo) => {
    store(backend, { theme, trialRoom: true });
    await page.route("https://img.example/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: svg("KURTA", "#d8c3a5") }));
    const sent: Array<Record<string, unknown>> = [];
    let reply: { status: number; json: Record<string, unknown> } = {
      status: 429,
      json: { error: "The trial room is busy today. Please try again tomorrow or message the shop." },
    };
    await page.route("**/functions/v1/storefront-try-on", async (route) => {
      sent.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({ status: reply.status, json: reply.json });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${E2E_ORG_SLUG}/store/p/${PRODUCT_ID}`);
    const open = page.getByTestId("try-on-button");
    await expect(open).toBeVisible({ timeout: 60_000 });
    await open.click();

    const sheet = page.getByTestId("trial-room");
    await expect(sheet).toContainText("Silk Kurta");
    await expect(sheet).toContainText("not saved by the shop");
    // No photo yet: nothing to send.
    await expect(sheet.getByTestId("trial-room-go")).toHaveCount(0);

    await sheet.getByTestId("trial-room-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png(1600, 2000, [200, 170, 150]) });
    await expect(sheet.getByTestId("trial-room-photo")).toBeVisible();

    // The shop's limit is reached: the shopper sees the reason and keeps their photo.
    await sheet.getByTestId("trial-room-go").click();
    await expect(sheet.getByTestId("trial-room-working")).toBeVisible();
    await expect(sheet.getByTestId("trial-room-error")).toHaveText("The trial room is busy today. Please try again tomorrow or message the shop.");
    await expect(sheet.getByTestId("trial-room-photo")).toBeVisible();

    reply = { status: 200, json: { image: RESULT } };
    await sheet.getByTestId("trial-room-go").click();
    const result = sheet.getByTestId("trial-room-result");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("src", RESULT);
    await expect(sheet).toContainText("AI preview");
    await page.screenshot({ path: testInfo.outputPath(`trial-room-${theme ?? "default"}.png`) });

    // What left the phone: the store, the product, the product photo on screen and a scaled-down JPEG.
    expect(sent).toHaveLength(2);
    const body = sent[1] as { slug: string; productId: string; photoUrl: string; photo: string };
    expect(body.slug).toBe(E2E_ORG_SLUG);
    expect(body.productId).toBe(PRODUCT_ID);
    expect(body.photoUrl).toBe(PRODUCT_PHOTO);
    expect(body.photo.startsWith("data:image/jpeg;base64,")).toBe(true);
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, body.photo);
    expect(size).toEqual([819, 1024]); // 1600 × 2000 scaled to a 1024 longest side

    // Compare, then close: Escape closes the sheet.
    await sheet.getByRole("button", { name: "Your photo" }).click();
    await expect(result).not.toHaveAttribute("src", RESULT);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    // The photo is remembered for the next product in this tab, and not written to storage.
    await open.click();
    await expect(page.getByTestId("trial-room-photo")).toBeVisible();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain("data:image/jpeg");
  });
}

test("No Try it on button while the shop has it off, or before the SQL has run", async ({ page, backend }) => {
  store(backend, { trialRoom: false });
  await page.route("https://img.example/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: svg("KURTA", "#d8c3a5") }));
  await page.goto(`/${E2E_ORG_SLUG}/store/p/${PRODUCT_ID}`);
  await expect(page.getByRole("heading", { name: "Silk Kurta" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("try-on-button")).toHaveCount(0);

  // Switched on, but this database does not list the feature yet.
  store(backend, { trialRoom: true, features: ["reserve_try", "restock_alert"] });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Silk Kurta" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("try-on-button")).toHaveCount(0);
});
