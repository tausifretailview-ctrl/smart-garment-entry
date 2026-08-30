import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  isOrgSlug,
  parseOrgSlugFromHref,
  resolveElectronStartUrl,
  writeSavedOrgSlug,
} = require("../electron/startupUrl.cjs") as {
  isOrgSlug: (value: string) => boolean;
  parseOrgSlugFromHref: (href: string) => string | null;
  resolveElectronStartUrl: (opts: {
    prodUrl?: string;
    userDataPath?: string;
    argv?: string[];
  }) => string;
  writeSavedOrgSlug: (userDataPath: string, slug: string) => boolean;
};

describe("electron startup URL", () => {
  it("rejects reserved first segments as shop slugs", () => {
    expect(isOrgSlug("trendzo")).toBe(true);
    expect(isOrgSlug("organization-setup")).toBe(false);
    expect(isOrgSlug("auth")).toBe(false);
  });

  it("parses ezzyerp://trendzo from the install-page protocol", () => {
    expect(parseOrgSlugFromHref("ezzyerp://trendzo")).toBe("trendzo");
    expect(parseOrgSlugFromHref("ezzyerp://open/trendzo")).toBe("trendzo");
  });

  it("opens the shop login when a slug is known", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ezzy-startup-"));
    writeSavedOrgSlug(dir, "trendzo");
    expect(
      resolveElectronStartUrl({
        prodUrl: "https://app.inventoryshop.in",
        userDataPath: dir,
        argv: [],
      }),
    ).toBe("https://app.inventoryshop.in/trendzo");
  });

  it("opens organization-setup on a cold install instead of bare /", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ezzy-startup-"));
    expect(
      resolveElectronStartUrl({
        prodUrl: "https://app.inventoryshop.in",
        userDataPath: dir,
        argv: ["EzzyERP.exe"],
      }),
    ).toBe("https://app.inventoryshop.in/organization-setup");
  });
});
