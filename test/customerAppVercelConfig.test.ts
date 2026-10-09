import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// customer-app/ is the Vercel Root Directory of the customer bill page project.
const config = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../customer-app/vercel.json"), "utf8"),
) as {
  buildCommand: string;
  outputDirectory: string;
  rewrites: Array<{ source: string; destination: string }>;
};

const spaRewrite = config.rewrites.find((r) => r.destination === "/index.html")!;
const rewritten = (p: string) => new RegExp(`^${spaRewrite.source}$`).test(p);

describe("customer-app/vercel.json", () => {
  it("builds the customer app into the served folder", () => {
    expect(config.buildCommand).toContain("npm run build:customer");
    expect(config.buildCommand).toContain("customer-app/dist");
    expect(config.outputDirectory).toBe("dist");
    // Served as index.html so "/" and the SPA rewrite find a real file (no cleanUrls).
    expect(config.buildCommand).toContain("customer-app/dist/index.html");
  });

  it("serves the push service worker and static files as files", () => {
    for (const file of [
      "/firebase-messaging-sw.js",
      "/manifest.webmanifest",
      "/icon.svg",
      "/apple-touch-icon.png",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/badge-96.png",
      "/assets/main-abc.js",
    ]) {
      expect(rewritten(file), file).toBe(false);
    }
  });

  it("sends customer page routes to the app", () => {
    for (const route of ["/", "/t/abc123", "/join/abc", "/m/uuid"]) {
      expect(rewritten(route), route).toBe(true);
    }
  });
});
