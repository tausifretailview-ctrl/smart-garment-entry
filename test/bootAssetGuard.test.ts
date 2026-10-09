import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import vm from "vm";

/** The inline boot guard in index.html that recovers from a dead /assets entry bundle. */
const guardSource = (() => {
  const html = readFileSync(path.resolve(__dirname, "../index.html"), "utf-8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const src = scripts.find((s) => s.includes("ezzy_boot_asset_recovery"));
  if (!src) throw new Error("boot guard script not found in index.html");
  return src;
})();

const ORIGIN = "https://app.inventoryshop.in";
const ENTRY = `${ORIGIN}/assets/index-BI_rm-r4.js`;
const PRELOAD = `${ORIGIN}/assets/vite-preload-CLcXU_4U.js`;

function makeBrowser(opts: { rendered?: boolean; online?: boolean; session?: Record<string, string> } = {}) {
  const listeners: Array<(e: unknown) => void> = [];
  const session: Record<string, string> = { ...(opts.session ?? {}) };
  const fetchMock = vi.fn(async () => ({ status: 200 }));
  const reload = vi.fn();
  const unregister = vi.fn(async () => true);
  const cacheDelete = vi.fn(async () => true);
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (type === "error") listeners.push(fn);
    },
  };
  const context = {
    window: win,
    URL,
    JSON,
    Date,
    Array,
    Promise,
    setTimeout,
    location: { href: `${ORIGIN}/smhair`, origin: ORIGIN, reload },
    navigator: {
      onLine: opts.online ?? true,
      serviceWorker: { getRegistrations: async () => [{ unregister }] },
    },
    caches: { keys: async () => ["app-js-chunks"], delete: cacheDelete },
    sessionStorage: {
      getItem: (k: string) => (k in session ? session[k] : null),
      setItem: (k: string, v: string) => {
        session[k] = v;
      },
    },
    fetch: fetchMock,
    document: {
      getElementById: () => ({ childNodes: opts.rendered ? [{}] : [] }),
      querySelectorAll: () => [
        { src: ENTRY },
        { href: PRELOAD },
        { src: "https://cdn.example.com/x.js" },
      ],
    },
  };
  win.caches = context.caches;
  win.fetch = fetchMock;
  vm.createContext(context);
  vm.runInContext(guardSource, context);
  const fireError = (target: unknown) => listeners.forEach((fn) => fn({ target }));
  const settle = () => new Promise((r) => setTimeout(r, 20));
  return { win, fetchMock, reload, unregister, cacheDelete, session, fireError, settle };
}

describe("index.html boot guard for a dead entry bundle", () => {
  it("re-downloads the page assets past the HTTP cache, drops the SW and reloads", async () => {
    const b = makeBrowser();
    b.fireError({ tagName: "SCRIPT", src: ENTRY });
    await b.settle();
    expect(b.unregister).toHaveBeenCalled();
    expect(b.cacheDelete).toHaveBeenCalledWith("app-js-chunks");
    const urls = b.fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(expect.arrayContaining([ENTRY, PRELOAD, `${ORIGIN}/smhair`]));
    expect(urls).not.toContain("https://cdn.example.com/x.js");
    for (const call of b.fetchMock.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ cache: "reload" }));
    }
    expect(b.reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing once the app has rendered (never reloads a working screen)", async () => {
    const b = makeBrowser({ rendered: true });
    b.fireError({ tagName: "SCRIPT", src: ENTRY });
    await b.settle();
    expect(b.reload).not.toHaveBeenCalled();
  });

  it("ignores other hosts, images and offline", async () => {
    const b = makeBrowser();
    b.fireError({ tagName: "SCRIPT", src: "https://cdn.example.com/x.js" });
    b.fireError({ tagName: "IMG", src: `${ORIGIN}/assets/logo.png` });
    b.fireError({ tagName: "LINK", rel: "icon", href: `${ORIGIN}/assets/a.png` });
    await b.settle();
    expect(b.reload).not.toHaveBeenCalled();

    const off = makeBrowser({ online: false });
    off.fireError({ tagName: "SCRIPT", src: ENTRY });
    await off.settle();
    expect(off.reload).not.toHaveBeenCalled();
  });

  it("stops auto-reloading after two tries in two minutes", async () => {
    const now = Date.now();
    const b = makeBrowser({
      session: { ezzy_boot_asset_recovery: JSON.stringify([now - 1000, now - 500]) },
    });
    b.fireError({ tagName: "SCRIPT", src: ENTRY });
    await b.settle();
    expect(b.reload).not.toHaveBeenCalled();

    // The Reload button on the "taking longer" screen still runs the full recovery.
    (b.win.__ezzyBootRecover as () => void)();
    await b.settle();
    expect(b.fetchMock).toHaveBeenCalledWith(ENTRY, expect.objectContaining({ cache: "reload" }));
    expect(b.reload).toHaveBeenCalledTimes(1);
  });

  it("allows a new try once older attempts have aged out", async () => {
    const old = Date.now() - 3 * 60 * 1000;
    const b = makeBrowser({ session: { ezzy_boot_asset_recovery: JSON.stringify([old, old]) } });
    b.fireError({ tagName: "LINK", rel: "modulepreload", href: PRELOAD });
    await b.settle();
    expect(b.reload).toHaveBeenCalledTimes(1);
  });
});
