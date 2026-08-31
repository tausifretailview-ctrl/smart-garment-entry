/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

import { Capacitor } from "@capacitor/core";
import { deliverFileBlob, deliverPdfBlob } from "./mobileDocumentDelivery";

describe("deliverFileBlob / deliverPdfBlob", () => {
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  let click: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    click = vi.fn();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = document.implementation.createHTMLDocument().createElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: click });
      }
      return el;
    });
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("deliverPdfBlob keeps the invoice contract: .pdf name + application/pdf", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
      canShare: () => true,
    });

    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const result = await deliverPdfBlob(blob, "Invoice_30082026_1100");

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0][0];
    expect(shared.title).toBe("Invoice_30082026_1100.pdf");
    expect(shared.files[0]).toBeInstanceOf(File);
    expect(shared.files[0].name).toBe("Invoice_30082026_1100.pdf");
    expect(shared.files[0].type).toBe("application/pdf");
  });

  it("does not double-append .pdf when the name already has it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
      canShare: () => true,
    });

    await deliverPdfBlob(new Blob(["x"], { type: "application/pdf" }), "Invoice.pdf");
    expect(share.mock.calls[0][0].title).toBe("Invoice.pdf");
  });

  it("rethrows AbortError so invoice share-cancel stays silent", async () => {
    const abort = Object.assign(new Error("user cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn().mockRejectedValue(abort),
      canShare: () => true,
    });

    await expect(deliverPdfBlob(new Blob(["x"]), "Invoice.pdf")).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("falls back to an anchor download for CSV when share is unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: undefined, canShare: undefined });

    const blob = new Blob(["a,b\r\n1,2"], { type: "text/csv;charset=utf-8" });
    const result = await deliverFileBlob(blob, "daily-sales-30082026.csv", "text/csv;charset=utf-8");

    expect(result).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("opens a blob URL on native when share is unavailable", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, canShare: undefined });
    const opened = { closed: false };
    const open = vi.fn(() => opened);
    vi.stubGlobal("open", open);

    const result = await deliverFileBlob(
      new Blob(["%PDF"], { type: "application/pdf" }),
      "Invoice.pdf",
      "application/pdf",
    );

    expect(result).toBe("opened");
    expect(open).toHaveBeenCalledWith("blob:mock-url", "_blank", "noopener,noreferrer");
  });
});
