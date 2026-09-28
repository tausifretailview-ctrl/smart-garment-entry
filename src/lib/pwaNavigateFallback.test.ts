import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const viteConfig = readFileSync(resolve(here, "../../vite.config.ts"), "utf8");

describe("PWA navigation fallback", () => {
  it("does not serve offline.html for every Chrome / PWA route", () => {
    expect(viteConfig).toMatch(/navigateFallback:\s*null/);
    expect(viteConfig).not.toMatch(/navigateFallback:\s*['"]offline\.html['"]/);
    expect(viteConfig).toMatch(/skipWaiting:\s*true/);
    expect(viteConfig).toMatch(/clientsClaim:\s*true/);
  });

  it("does not precache JavaScript chunks (every deploy would re-download ~all of them)", () => {
    const glob = viteConfig.match(/globPatterns:\s*\[([^\]]*)\]/);
    expect(glob).not.toBeNull();
    expect(glob![1]).not.toMatch(/\bjs\b/);
    expect(viteConfig).toMatch(/cacheName:\s*'app-js-chunks'/);
  });
});
