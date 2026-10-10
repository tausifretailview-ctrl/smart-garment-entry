import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PrintHtmlPayload = { copies?: number; printKind?: string };

describe("appPrint copies (desktop app)", () => {
  const store = new Map<string, string>();
  let printHtml: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    store.clear();
    printHtml = vi.fn(async (_payload: PrintHtmlPayload) => ({ success: true }));
    vi.stubGlobal("window", { electronAPI: { isElectron: true, printHtml } });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const html = "<html><body><p>Label</p></body></html>";

  it("uses Default Copies for bills", async () => {
    store.set("ezzy_print_copies", "2");
    const { appPrint } = await import("./appPrint");
    await appPrint({ type: "invoice", html });
    expect((printHtml.mock.calls[0][0] as PrintHtmlPayload).copies).toBe(2);
  });

  it("never multiplies barcode labels by Default Copies", async () => {
    store.set("ezzy_print_copies", "2");
    const { appPrint } = await import("./appPrint");
    await appPrint({ type: "barcode", html, pageSize: { width: 50000, height: 25000 } });
    const payload = printHtml.mock.calls[0][0] as PrintHtmlPayload;
    expect(payload.printKind).toBe("barcode");
    expect(payload.copies).toBe(1);
  });

  it("still honours an explicit copies value for labels", async () => {
    const { appPrint } = await import("./appPrint");
    await appPrint({ type: "barcode", html, copies: 3 });
    expect((printHtml.mock.calls[0][0] as PrintHtmlPayload).copies).toBe(3);
  });
});
