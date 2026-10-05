import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "./POSSales.tsx"), "utf8");

describe("POS invoice number field", () => {
  it("keeps a minimum width wide enough for a full POS invoice number", () => {
    const start = page.indexOf("Invoice No</Label>");
    expect(start).toBeGreaterThan(-1);
    const block = page.slice(start, start + 700);
    expect(block).toContain("min-w-[20ch]");
    expect(block).toContain("w-[20ch]");
    expect(block).toContain('placeholder="Invoice #"');
    expect(block).not.toContain("w-40");
  });
});
