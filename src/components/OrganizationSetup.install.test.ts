import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("OrganizationSetup after install", () => {
  it("lets a generic APK / desktop shell enter a shop URL instead of a dead-end", () => {
    const src = readFileSync(resolve(here, "./OrganizationSetup.tsx"), "utf8");
    expect(src).not.toContain("App Not Linked to a Shop");
    expect(src).toContain("Enter your organization URL");
  });
});
