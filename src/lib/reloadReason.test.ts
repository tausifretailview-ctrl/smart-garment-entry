import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("reloadReason", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("carries the reason of an automatic reload into the next page load", async () => {
    const first = await import("./reloadReason");
    first.noteReloadReason("silent update");

    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const next = await import("./reloadReason");
    next.recordPageLoad();

    const history = next.getReloadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].appReason).toBe("silent update");
    expect(localStorage.getItem("ezzy_reload_pending")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("ignores a stale pending reason and stays quiet on a normal load", async () => {
    localStorage.setItem(
      "ezzy_reload_pending",
      JSON.stringify({ at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), reason: "old", path: "/" }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mod = await import("./reloadReason");
    mod.recordPageLoad();
    expect(mod.getReloadHistory()[0].appReason).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("UpdatePrompt service worker", () => {
  it("does not use virtual:pwa-register, whose prompt mode hard-reloads every tab on deploy", () => {
    const src = readFileSync(resolve(here, "../components/UpdatePrompt.tsx"), "utf8");
    expect(src).not.toContain("virtual:pwa-register");
    expect(src).toContain('addEventListener("controllerchange"');
  });
});
