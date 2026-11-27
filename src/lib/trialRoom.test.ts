import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STOREFRONT_TRIAL_ROOM_KEY,
  TRIAL_ROOM_DEFAULT_DAILY_LIMIT,
  TRIAL_ROOM_MAX_DAILY_LIMIT,
  TRIAL_ROOM_MAX_PHOTO_CHARS,
  TRIAL_ROOM_VISITOR_HOURLY_LIMIT,
  parseStorefrontTrialRoom,
  pickGarmentPhoto,
  readTrialRoomRequest,
  serializeStorefrontTrialRoom,
  storefrontTrialRoomForStore,
  trialRoomImageFromReply,
  trialRoomLimitProblem,
  trialRoomProductAllowed,
  trialRoomPrompt,
} from "./trialRoom";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const PRODUCT = "3f0b8a52-6d1c-4e6f-9a57-0d2b1c9e4f10";

describe("AI Trial Room setting", () => {
  it("is off unless the shop switched it on", () => {
    expect(parseStorefrontTrialRoom(null)).toEqual({ enabled: false, dailyLimit: TRIAL_ROOM_DEFAULT_DAILY_LIMIT });
    expect(parseStorefrontTrialRoom({ [STOREFRONT_TRIAL_ROOM_KEY]: { enabled: "yes" } }).enabled).toBe(false);
    expect(parseStorefrontTrialRoom({ [STOREFRONT_TRIAL_ROOM_KEY]: { enabled: true, daily_limit: 120 } })).toEqual({
      enabled: true,
      dailyLimit: 120,
    });
  });

  it("keeps the daily limit in range", () => {
    const limit = (v: unknown) => parseStorefrontTrialRoom({ [STOREFRONT_TRIAL_ROOM_KEY]: { daily_limit: v } }).dailyLimit;
    expect(limit(0)).toBe(TRIAL_ROOM_DEFAULT_DAILY_LIMIT);
    expect(limit("abc")).toBe(TRIAL_ROOM_DEFAULT_DAILY_LIMIT);
    expect(limit(99999)).toBe(TRIAL_ROOM_MAX_DAILY_LIMIT);
    expect(serializeStorefrontTrialRoom({ enabled: true, dailyLimit: 75.4 })).toEqual({ enabled: true, daily_limit: 75 });
  });

  it("shows on the store only when the database lists the feature and the shop switched it on", () => {
    const settings = { [STOREFRONT_TRIAL_ROOM_KEY]: { enabled: true } };
    expect(storefrontTrialRoomForStore({ store_features: ["reserve_try", "trial_room"], settings }).enabled).toBe(true);
    // SQL not run yet: no dead button.
    expect(storefrontTrialRoomForStore({ store_features: ["reserve_try"], settings }).enabled).toBe(false);
    expect(storefrontTrialRoomForStore({ settings }).enabled).toBe(false);
    expect(storefrontTrialRoomForStore({ store_features: ["trial_room"], settings: {} }).enabled).toBe(false);
    expect(storefrontTrialRoomForStore(null).enabled).toBe(false);
  });
});

describe("try-on request", () => {
  const ok = { slug: "ella-noor", productId: PRODUCT, photo: PHOTO };

  it("accepts a store, a product and a photo", () => {
    expect(readTrialRoomRequest({ ...ok, photoUrl: " https://x.test/a.jpg " })).toEqual({
      request: { slug: "ella-noor", productId: PRODUCT, photoUrl: "https://x.test/a.jpg", photo: PHOTO },
    });
    expect(readTrialRoomRequest(ok)).toEqual({ request: { ...ok, photoUrl: null } });
  });

  it("refuses anything else with a message for the shopper", () => {
    expect(readTrialRoomRequest(null)).toEqual({ error: "A valid store is required" });
    expect(readTrialRoomRequest({ ...ok, slug: "../x" })).toEqual({ error: "A valid store is required" });
    expect(readTrialRoomRequest({ ...ok, productId: "1" })).toEqual({ error: "A valid product is required" });
    expect(readTrialRoomRequest({ ...ok, photo: "" })).toEqual({ error: "Please add your photo" });
    expect(readTrialRoomRequest({ ...ok, photo: "https://x.test/me.jpg" })).toEqual({
      error: "Please use a JPG, PNG or WebP photo",
    });
    expect(readTrialRoomRequest({ ...ok, photo: "data:image/svg+xml;base64,AAAA" })).toEqual({
      error: "Please use a JPG, PNG or WebP photo",
    });
    expect(readTrialRoomRequest({ ...ok, photo: PHOTO + "A".repeat(TRIAL_ROOM_MAX_PHOTO_CHARS) })).toEqual({
      error: "That photo is too large. Please try a smaller one.",
    });
  });

  it("only ever uses one of the product's own photos", () => {
    const photos = ["https://cdn.test/1.jpg", "http://insecure.test/2.jpg", "https://cdn.test/3.jpg", 7];
    expect(pickGarmentPhoto(photos, "https://cdn.test/3.jpg")).toBe("https://cdn.test/3.jpg");
    // A link that is not one of the product's photos is ignored.
    expect(pickGarmentPhoto(photos, "https://evil.test/x.jpg")).toBe("https://cdn.test/1.jpg");
    expect(pickGarmentPhoto(photos, "http://insecure.test/2.jpg")).toBe("https://cdn.test/1.jpg");
    expect(pickGarmentPhoto(photos, null)).toBe("https://cdn.test/1.jpg");
    expect(pickGarmentPhoto([], null)).toBeNull();
    expect(pickGarmentPhoto("https://cdn.test/1.jpg", null)).toBeNull();
  });
});

describe("products offered for try-on", () => {
  it("leaves out innerwear, swimwear and nightwear", () => {
    for (const p of [
      { name: "Silk Kurta", category: "KURTA" },
      { name: "Bridal Lehenga", category: "LEHENGA" },
      { name: "Slim Fit Shirt", category: "SHIRT" },
      { name: "Braided Belt Dress", category: "DRESS" }, // "bra" only as a whole word
      { name: "Cotton Trousers", category: "TROUSER" },
    ]) {
      expect(trialRoomProductAllowed(p), p.name).toBe(true);
    }
    for (const p of [
      { name: "Padded Bra", category: "LADIES" },
      { name: "Cotton Pack of 3", category: "INNERWEAR" },
      { name: "Men Briefs", category: null },
      { name: "Floral Bikini Set", category: "BEACH" },
      { name: "Satin Nighty", category: "NIGHT WEAR" },
      { name: "Lace Camisole", category: "TOPS" },
      { name: "Swimsuit", category: "SWIM WEAR" },
    ]) {
      expect(trialRoomProductAllowed(p), p.name).toBe(false);
    }
  });
});

describe("try-on limits", () => {
  it("allows up to the limits, counting this try-on", () => {
    expect(trialRoomLimitProblem({ shopToday: 50, visitorThisHour: TRIAL_ROOM_VISITOR_HOURLY_LIMIT }, 50)).toBeNull();
    expect(trialRoomLimitProblem({ shopToday: 51, visitorThisHour: 1 }, 50)).toMatch(/busy today/);
    expect(trialRoomLimitProblem({ shopToday: 2, visitorThisHour: TRIAL_ROOM_VISITOR_HOURLY_LIMIT + 1 }, 50)).toMatch(
      /try again in an hour/,
    );
  });
});

describe("AI call", () => {
  it("asks for the same person in the product, fully clothed", () => {
    const prompt = trialRoomPrompt({ name: "Silk Kurta", category: "Kurta" });
    expect(prompt).toContain("(Silk Kurta, Kurta)");
    expect(prompt).toMatch(/face, hair, skin tone, body shape, pose/);
    expect(prompt).toMatch(/fully and modestly clothed/);
    expect(trialRoomPrompt({})).not.toContain("()");
  });

  it("puts on the whole look in the product photo, styled the same way (Nov 2026: only the shirt changed)", () => {
    const prompt = trialRoomPrompt({ name: "SHIRT-TEST", category: "Shirt" });
    // A model wearing a full look: top, bottom, layers and shoes all change.
    expect(prompt).toMatch(/complete look: the top, the bottom \(trousers/);
    expect(prompt).toMatch(/no original trousers under a new set/);
    // A garment shown on its own still changes only what it covers.
    expect(prompt).toMatch(/only one garment on its own .* replace only the clothing that garment covers/);
    // Styling details.
    expect(prompt).toMatch(/sleeve length and how the sleeves end/);
    expect(prompt).toMatch(/tucked or untucked/);
    expect(prompt).toMatch(/fit \(slim, regular or relaxed\)/);
    // Never someone else's face.
    expect(prompt).toMatch(/Do not copy the face, hair or body of anyone in image 2/);
    // The old "only the clothing the product would cover" rule is gone.
    expect(prompt).not.toMatch(/Replace only the clothing the product would cover/);
  });

  it("reads the picture from the reply shapes gateways use", () => {
    const img = "data:image/png;base64,iVBORw0KGgo=";
    expect(trialRoomImageFromReply({ choices: [{ message: { images: [{ type: "image_url", image_url: { url: img } }] } }] })).toBe(img);
    expect(
      trialRoomImageFromReply({ choices: [{ message: { content: [{ type: "text", text: "ok" }, { image_url: { url: img } }] } }] }),
    ).toBe(img);
    // A text-only answer (the model declined) or a link is not a picture.
    expect(trialRoomImageFromReply({ choices: [{ message: { content: "I can't help with that." } }] })).toBeNull();
    expect(trialRoomImageFromReply({ choices: [{ message: { images: [{ image_url: { url: "https://x.test/a.png" } }] } }] })).toBeNull();
    expect(trialRoomImageFromReply(null)).toBeNull();
  });
});

describe("trial room wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the function takes the product photo from the database and fails closed without the usage table", () => {
    const fn = read("supabase/functions/storefront-try-on/index.ts");
    expect(fn).toContain('admin.rpc("get_public_storefront"');
    expect(fn).toContain("pickGarmentPhoto(product.photo_urls, photoUrl)");
    expect(fn).toContain("if (!room.enabled) return json(403");
    // The usage row is written before the AI is called; no row = refuse.
    expect(fn.indexOf('.from("storefront_tryons")')).toBeLessThan(fn.indexOf("fetch(AI_URL"));
    expect(fn).toMatch(/if \(insertError \|\| !row\?\.id\) \{[\s\S]*?return json\(503/);
    // The shopper's photo is never written to the database or to storage.
    expect(fn).not.toMatch(/storage\.from|\.upload\(/);
    expect(fn).not.toMatch(/insert\(\{[^}]*photo[^}]*\}\)/);
  });

  it("is a public function pinned in config.toml", () => {
    expect(read("supabase/config.toml")).toMatch(/\[functions\.storefront-try-on\]\nverify_jwt = false/);
  });

  it("the SQL lists the feature, returns the setting and lets only the function write", () => {
    const sql = read("supabase/migrations/20270511120000_storefront_trial_room.sql");
    expect(sql).toContain("json_build_array('reserve_try', 'restock_alert', 'trial_room')");
    expect(sql).toContain("'storefront_trial_room', o.settings -> 'storefront_trial_room'");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("every theme's product page has the Try it on button, and Website → Theme has the switch", () => {
    for (const file of ["StorefrontProduct.tsx", "EllaProductSheet.tsx", "StreetStorefront.tsx"]) {
      expect(read(`src/storefront/${file}`), file).toContain("<TryOnButton");
    }
    expect(read("src/components/website/WebsiteThemePanel.tsx")).toContain("<StoreTrialRoomSettings orgId={orgId} />");
  });
});
