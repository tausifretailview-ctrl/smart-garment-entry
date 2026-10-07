import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "../pages/SaleOrderEntry.tsx"), "utf8");

describe("sale order product search stays closed until clicked", () => {
  it("does not open the empty search popover on load or after a line is added", () => {
    expect(entry).not.toContain("focusProductSearchBar");
    expect(entry).not.toContain("setOpenProductSearch(true)");
    expect(entry).toContain("setOpenProductSearch(false)");
  });
});
