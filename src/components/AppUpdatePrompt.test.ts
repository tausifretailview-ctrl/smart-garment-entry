import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("AppUpdatePrompt remote shells", () => {
  it("does not register a PWA service worker inside Electron or Capacitor", () => {
    const src = readFileSync(resolve(here, "./AppUpdatePrompt.tsx"), "utf8");
    expect(src).toContain("Capacitor.isNativePlatform()");
    expect(src).toContain("isElectronShell()");
    expect(src).toContain("ElectronWebUpdatePrompt");
  });
});
