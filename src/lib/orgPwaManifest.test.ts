import { describe, expect, it } from "vitest";
import { buildPwaIconEntries } from "@/lib/orgPwaManifest";

describe("buildPwaIconEntries", () => {
  it("uses absolute icon URLs so blob manifests stay installable", () => {
    const icons = buildPwaIconEntries("https://app.inventoryshop.in");
    expect(icons).toEqual([
      {
        src: "https://app.inventoryshop.in/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "https://app.inventoryshop.in/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "https://app.inventoryshop.in/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "https://app.inventoryshop.in/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });
});
