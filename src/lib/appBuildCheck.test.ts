import { describe, expect, it } from "vitest";
import {
  claimNewerBuildReload,
  entryScriptFromHtml,
  newerServerEntryScript,
} from "./appBuildCheck";

const html = (entry: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head></html>`;
const fetchReturning = (body: string, ok = true) =>
  (async () => ({ ok, text: async () => body })) as unknown as typeof fetch;

describe("entryScriptFromHtml", () => {
  it("reads the hashed entry", () => {
    expect(entryScriptFromHtml(html("/assets/index-AbC_12-x.js"))).toBe("/assets/index-AbC_12-x.js");
    expect(entryScriptFromHtml("<html></html>")).toBeNull();
  });
});

describe("newerServerEntryScript", () => {
  it("returns the server entry when it differs from the running one", async () => {
    expect(await newerServerEntryScript(fetchReturning(html("/assets/index-NEW.js")), "/assets/index-OLD.js")).toBe(
      "/assets/index-NEW.js",
    );
  });
  it("is null for the same build, an error, a bad response or an unknown running entry", async () => {
    expect(await newerServerEntryScript(fetchReturning(html("/assets/index-OLD.js")), "/assets/index-OLD.js")).toBeNull();
    expect(
      await newerServerEntryScript((async () => { throw new Error("offline"); }) as unknown as typeof fetch, "/assets/index-OLD.js"),
    ).toBeNull();
    expect(await newerServerEntryScript(fetchReturning("", false), "/assets/index-OLD.js")).toBeNull();
    expect(await newerServerEntryScript(fetchReturning(html("/assets/index-NEW.js")), null)).toBeNull();
  });
});

describe("claimNewerBuildReload", () => {
  it("allows one reload per server build, so it cannot loop", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(claimNewerBuildReload("/assets/index-NEW.js", storage)).toBe(true);
    expect(claimNewerBuildReload("/assets/index-NEW.js", storage)).toBe(false);
    expect(claimNewerBuildReload("/assets/index-NEWER.js", storage)).toBe(true);
  });
  it("does nothing without storage", () => {
    expect(claimNewerBuildReload("/assets/index-NEW.js", null)).toBe(false);
  });
});
