/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SPIN_MAX_FRAMES,
  SPIN_MIN_FRAMES,
  applyProductSpins,
  cleanSpinUrls,
  hasProductSpin,
  isMissingSpinColumn,
  sortSpinFiles,
  spinFilesProblem,
  spinFrameIndex,
  spinStep,
} from "./productSpin";
import type { PublicStorefrontProduct } from "./websiteTypes";
import { StreetSpinViewer } from "@/storefront/StreetSpinViewer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const frames = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.example/spin-${i + 1}.jpg`);

describe("360° product spin", () => {
  it("keeps only https frames and caps the count", () => {
    expect(cleanSpinUrls(["https://a.example/1.jpg", "http://a.example/2.jpg", "javascript:x", 5, null, " https://a.example/3.jpg "])).toEqual([
      "https://a.example/1.jpg",
      "https://a.example/3.jpg",
    ]);
    expect(cleanSpinUrls(frames(60))).toHaveLength(SPIN_MAX_FRAMES);
    expect(cleanSpinUrls("nope")).toEqual([]);
    expect(hasProductSpin(frames(SPIN_MIN_FRAMES))).toBe(true);
    expect(hasProductSpin(frames(SPIN_MIN_FRAMES - 1))).toBe(false);
    expect(hasProductSpin(undefined)).toBe(false);
  });

  it("turns one full circle per drag across the picture, wrapping both ways", () => {
    // 12 frames on a 300px picture: 25px per frame.
    expect(spinFrameIndex(0, 0, 300, 12)).toBe(0);
    expect(spinFrameIndex(0, -25, 300, 12)).toBe(1);
    expect(spinFrameIndex(0, 25, 300, 12)).toBe(11);
    expect(spinFrameIndex(0, -300, 300, 12)).toBe(0);
    expect(spinFrameIndex(10, -75, 300, 12)).toBe(1);
    expect(spinFrameIndex(3, 1000, 0, 0)).toBe(0);
    expect(spinStep(11, 1, 12)).toBe(0);
    expect(spinStep(0, -1, 12)).toBe(11);
  });

  it("orders picked photos the way the camera took them", () => {
    const f = (name: string, type = "image/jpeg") => ({ name, type });
    expect(sortSpinFiles([f("IMG_0101.jpg"), f("IMG_0012.jpg"), f("notes.pdf", "application/pdf"), f("IMG_0100.jpg")]).map((x) => x.name)).toEqual([
      "IMG_0012.jpg",
      "IMG_0100.jpg",
      "IMG_0101.jpg",
    ]);
    expect(sortSpinFiles([f("b.jpg"), f("a.jpg"), f("c.jpg")]).map((x) => x.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(sortSpinFiles(Array.from({ length: 50 }, (_, i) => f(`${i}.jpg`)))).toHaveLength(SPIN_MAX_FRAMES);
    expect(spinFilesProblem(3)).toContain("at least");
    expect(spinFilesProblem(SPIN_MIN_FRAMES)).toBeNull();
  });

  it("adds a listing's frames to its product only when there are enough", () => {
    const products = [{ id: "w1", name: "Shirt" }, { id: "w2", name: "Jeans" }, { id: "w3", name: "Tee" }] as PublicStorefrontProduct[];
    const out = applyProductSpins(products, [
      { id: "w1", spin_urls: frames(12) },
      { id: "w2", spin_urls: frames(3) },
      { id: "gone", spin_urls: frames(12) },
    ]);
    expect(out[0].spin_urls).toHaveLength(12);
    expect(out[1].spin_urls).toBeUndefined();
    expect(out[2]).toBe(products[2]);
    expect(applyProductSpins(products, [])).toBe(products);
    expect(isMissingSpinColumn("column website_products.spin_urls does not exist")).toBe(true);
    expect(isMissingSpinColumn("permission denied")).toBe(false);
  });

  it("loads the other frames when shown, then rotates with a drag and the arrow keys", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const more = { clicks: 0 };
    act(() => root.render(<StreetSpinViewer frames={frames(8)} name="Oxford Shirt" onMorePhotos={() => (more.clicks += 1)} />));
    const box = host.querySelector(".st-spin") as HTMLDivElement;
    // jsdom has no IntersectionObserver, so the frames start loading straight away.
    const imgs = () => Array.from(host.querySelectorAll(".st-spin img")) as HTMLImageElement[];
    expect(imgs()).toHaveLength(8);
    expect(host.querySelector(".st-spin-badge")?.textContent).toContain("loading");
    const shown = () => imgs().findIndex((img) => img.classList.contains("st-spin-on"));
    expect(shown()).toBe(0);
    // Not draggable until every frame has loaded.
    act(() => box.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 })));
    act(() => box.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100 })));
    expect(shown()).toBe(0);
    act(() => imgs().forEach((img) => img.dispatchEvent(new Event("load"))));
    expect(host.querySelector(".st-spin-badge")?.textContent).toContain("drag to rotate");
    expect(host.querySelector(".st-spin-progress")).toBeNull();
    Object.defineProperty(box, "clientWidth", { value: 400, configurable: true });
    act(() => box.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 })));
    const start = shown();
    // 400px wide, 8 frames: 50px per frame; dragging 100px left moves two frames on.
    act(() => box.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 100 })));
    expect(shown()).toBe((start + 2) % 8);
    act(() => box.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    act(() => box.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 0 })));
    expect(shown()).toBe((start + 2) % 8);
    act(() => box.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })));
    expect(shown()).toBe((start + 3) % 8);
    act(() => (host.querySelector(".st-spin-more") as HTMLButtonElement).click());
    expect(more.clicks).toBe(1);
    act(() => root.unmount());
    host.remove();
  });

  it("is wired into the store, the Photos dialog and the database", () => {
    const client = read("src/storefront/storefrontClient.ts");
    expect(client).toContain('.select("id, spin_urls")');
    // A separate request from the name/description one, so a missing column cannot hide those.
    expect(client).toContain('.select("id, display_name, description")');
    expect(client).toContain("applyProductSpins(applyWebsiteProductDetails(payload.products, details), spins)");
    expect(read("src/storefront/ellaProduct.ts")).toContain("spin: cleanSpinUrls(product.spin_urls),");
    expect(read("src/storefront/StreetStorefront.tsx")).toContain("<StreetSpinViewer");
    expect(read("src/components/website/WebsiteProductPhotosDialog.tsx")).toContain(
      "<WebsiteProductSpinSection orgId={orgId} listingId={listingId} />",
    );
    const sql = read("supabase/migrations/20270503120000_website_products_spin_urls.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS spin_urls text[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain(`CHECK (cardinality(spin_urls) <= ${SPIN_MAX_FRAMES})`);
  });
});
