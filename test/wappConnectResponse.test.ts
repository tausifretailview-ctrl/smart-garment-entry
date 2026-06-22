import { describe, expect, it } from "vitest";
import {
  buildWappConnectPdfServeUrl,
  classifyWappConnectResponse,
  extractWappConnectErrorMessage,
  isAllowedWappConnectPdfPath,
} from "../supabase/functions/_shared/wappConnectResponse.ts";

describe("extractWappConnectErrorMessage", () => {
  it("detects body status 400 on HTTP 200 responses", () => {
    expect(
      extractWappConnectErrorMessage({
        status: "400",
        message: "unsupported media type: eyJhbGciOiJIUzI1NiJ9",
      }),
    ).toBe("unsupported media type: eyJhbGciOiJIUzI1NiJ9");
  });

  it("returns undefined for successful provider payloads", () => {
    expect(extractWappConnectErrorMessage({ status: "200", message: "ok" })).toBeUndefined();
  });
});

describe("classifyWappConnectResponse", () => {
  it("fails when HTTP is 200 but provider status is 400", () => {
    const result = classifyWappConnectResponse(200, {
      status: "400",
      message: "unsupported media type",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("unsupported media type");
  });

  it("fails on non-2xx HTTP", () => {
    const result = classifyWappConnectResponse(502, { message: "bad gateway" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("WappConnect request failed (HTTP 502)");
  });
});

describe("buildWappConnectPdfServeUrl", () => {
  it("builds a stable functions URL with encoded path", () => {
    const orgId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const path = `${orgId}/wappconnect/1710000000000_Invoice.pdf`;
    expect(buildWappConnectPdfServeUrl("https://example.supabase.co", path)).toBe(
      `https://example.supabase.co/functions/v1/serve-wappconnect-pdf?path=${encodeURIComponent(path)}`,
    );
  });
});

describe("isAllowedWappConnectPdfPath", () => {
  it("allows only org/wappconnect/*.pdf paths", () => {
    const orgId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(isAllowedWappConnectPdfPath(`${orgId}/wappconnect/171_Invoice.pdf`)).toBe(true);
    expect(isAllowedWappConnectPdfPath(`${orgId}/invoices/171_Invoice.pdf`)).toBe(false);
    expect(isAllowedWappConnectPdfPath("../wappconnect/x.pdf")).toBe(false);
  });
});
