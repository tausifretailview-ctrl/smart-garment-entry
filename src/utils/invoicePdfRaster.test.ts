import { describe, expect, it } from "vitest";
import { resolveInvoicePdfRasterOptions } from "@/utils/invoicePdfRaster";

describe("resolveInvoicePdfRasterOptions", () => {
  it("uses PNG at scale 2 for desktop print/download", () => {
    const r = resolveInvoicePdfRasterOptions({});
    expect(r.useJpeg).toBe(false);
    expect(r.scale).toBe(2);
    expect(r.imageType).toBe("PNG");
  });

  it("uses JPEG for mobileOptimized (yesterday size fix)", () => {
    const r = resolveInvoicePdfRasterOptions({ mobileOptimized: true });
    expect(r.useJpeg).toBe(true);
    expect(r.scale).toBe(1.5);
    expect(r.imageType).toBe("JPEG");
  });

  it("uses JPEG for WappConnect even when mobileOptimized is false", () => {
    // Regression: wappConnectPdf previously forced PNG and blew past storage limits.
    const r = resolveInvoicePdfRasterOptions({
      mobileOptimized: true,
      wappConnectPdf: true,
    });
    expect(r.useJpeg).toBe(true);
    expect(r.scale).toBe(1.5);
    expect(r.imageType).toBe("JPEG");
    expect(r.imageQuality).toBeLessThanOrEqual(0.85);
  });
});
