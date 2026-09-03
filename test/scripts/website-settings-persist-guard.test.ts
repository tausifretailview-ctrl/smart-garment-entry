import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("WebsiteSettings persist-safe query data", () => {
  it("does not call .get on React Query data (IndexedDB restores Map as a plain object)", async () => {
    const src = await readFile(path.join(ROOT, "src/pages/WebsiteSettings.tsx"), "utf8");
    expect(src).not.toMatch(/Query\.data\?\.get\(/);
    expect(src).not.toMatch(/new Map</);
    expect(src).toMatch(/lookupMap/);
    expect(src).toMatch(/coerceToArray/);
    expect(src).toMatch(/aggregateWebsiteVariantStock/);
    expect(src).toMatch(/UPI ID \(store booking\)/);
    expect(src).toMatch(/bill_barcode_settings/);
  });
});
