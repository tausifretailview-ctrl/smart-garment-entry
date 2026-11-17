/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  STOREFRONT_VIDEOS_KEY,
  STOREFRONT_VIDEOS_MAX,
  moveStorefrontVideo,
  parseStorefrontVideos,
  storefrontVideoFileProblem,
} from "./storefrontVideos";
import { StreetVideoRail } from "@/storefront/StreetVideoRail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("store home videos (Street theme Watch & shop)", () => {
  it("keeps only https clips, trims fields and caps the count", () => {
    const raw = [
      { id: "a", video_url: "https://x.supabase.co/storage/v1/object/public/website-photos/o/videos/1.mp4", caption: "  Bridal  ", target: "lehenga" },
      { id: "b", video_url: "javascript:alert(1)" },
      { id: "c", video_url: "http://insecure.example/v.mp4" },
      null,
      ...Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, video_url: `https://cdn.example/${i}.mp4` })),
    ];
    const videos = parseStorefrontVideos({ [STOREFRONT_VIDEOS_KEY]: raw });
    expect(videos[0]).toEqual({
      id: "a",
      video_url: "https://x.supabase.co/storage/v1/object/public/website-photos/o/videos/1.mp4",
      caption: "Bridal",
      target: "lehenga",
    });
    expect(videos.some((v) => v.id === "b" || v.id === "c")).toBe(false);
    expect(videos).toHaveLength(STOREFRONT_VIDEOS_MAX);
    expect(parseStorefrontVideos(null)).toEqual([]);
    expect(parseStorefrontVideos({ [STOREFRONT_VIDEOS_KEY]: "x" })).toEqual([]);
  });

  it("reorders and checks uploads", () => {
    const list = [1, 2, 3].map((n) => ({ id: `v${n}`, video_url: "https://a/v.mp4", caption: "", target: "" }));
    expect(moveStorefrontVideo(list, 0, 1).map((v) => v.id)).toEqual(["v2", "v1", "v3"]);
    expect(moveStorefrontVideo(list, 0, -1)).toBe(list);
    expect(storefrontVideoFileProblem({ type: "video/mp4", size: 5e6, name: "a.mp4" })).toBeNull();
    expect(storefrontVideoFileProblem({ type: "image/jpeg", size: 5e5, name: "a.jpg" })).toMatch(/not a video/);
    expect(storefrontVideoFileProblem({ type: "video/mp4", size: 60 * 1024 * 1024, name: "big.mp4" })).toMatch(/over 40 MB/);
  });

  it("shows a muted, looping, inline clip per video with Shop now only when linked", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onShop = vi.fn();
    act(() => {
      root.render(
        <StreetVideoRail
          title="Watch & shop"
          onShop={onShop}
          videos={[
            { id: "a", video_url: "https://cdn.example/a.mp4", caption: "Bridal edit", shopLabel: "Lehenga" },
            { id: "b", video_url: "https://cdn.example/b.mp4", caption: "", shopLabel: null },
          ]}
        />,
      );
    });
    const vids = host.querySelectorAll("video");
    expect(vids).toHaveLength(2);
    expect(vids[0].muted).toBe(true);
    expect(vids[0].loop).toBe(true);
    expect(vids[0].hasAttribute("playsinline")).toBe(true);
    const shop = Array.from(host.querySelectorAll("button")).filter((b) => b.textContent === "Shop now");
    expect(shop).toHaveLength(1);
    act(() => shop[0].click());
    expect(onShop).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(host.querySelector('[aria-label="Next videos"]')).not.toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("renders nothing without videos, and the Street home / theme editor are wired", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<StreetVideoRail title="Watch & shop" videos={[]} onShop={() => {}} />));
    expect(host.innerHTML).toBe("");
    act(() => root.unmount());
    const street = readFileSync(join(process.cwd(), "src/storefront/StreetStorefront.tsx"), "utf8");
    expect(street).toContain("<StreetVideoRail");
    const client = readFileSync(join(process.cwd(), "src/storefront/storefrontClient.ts"), "utf8");
    expect(client).toContain("payload.videos = parseStorefrontVideos(orgInfo?.settings);");
    const panel = readFileSync(join(process.cwd(), "src/components/website/WebsiteThemePanel.tsx"), "utf8");
    expect(panel).toContain("<StoreVideos");
  });
});
