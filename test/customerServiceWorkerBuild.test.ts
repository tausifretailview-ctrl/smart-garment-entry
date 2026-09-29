import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// firebase-messaging-sw.js is registered as a classic worker, so it must be
// built alone as one IIFE file. As a second entry of the page build it came out
// as an ES module importing shared chunks, and Chrome refused to register it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

describe("customer service worker build", () => {
  it("is not an entry of the page build", () => {
    expect(read("vite.customer.config.ts")).not.toContain("src/customer/sw.ts");
  });

  it("is built on its own as a self-contained IIFE after the page build", () => {
    const swConfig = read("vite.customer-sw.config.ts");
    expect(swConfig).toContain("src/customer/sw.ts");
    expect(swConfig).toContain('formats: ["iife"]');
    expect(swConfig).toContain("firebase-messaging-sw.js");
    expect(swConfig).toContain("emptyOutDir: false");

    const script = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts[
      "build:customer"
    ];
    expect(script.indexOf("vite.customer.config.ts")).toBeGreaterThanOrEqual(0);
    expect(script.indexOf("vite.customer-sw.config.ts")).toBeGreaterThan(script.indexOf("vite.customer.config.ts"));
  });
});
