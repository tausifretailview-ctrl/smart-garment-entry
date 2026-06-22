import { describe, expect, it } from "vitest";
import { buildWappConnectPdfServeUrl, isWappConnectSignedStorageUrl } from "../src/utils/wappConnectPdfUrl";
import { getEffectiveWhatsAppLogStatus } from "../src/utils/whatsappLogStatus";

describe("wappConnectPdfUrl", () => {
  it("builds serve-wappconnect-pdf URL", () => {
    const orgId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const path = `${orgId}/wappconnect/171_Invoice.pdf`;
    expect(buildWappConnectPdfServeUrl("https://example.supabase.co", path)).toBe(
      `https://example.supabase.co/functions/v1/serve-wappconnect-pdf?path=${encodeURIComponent(path)}`,
    );
  });

  it("detects signed storage URLs", () => {
    expect(
      isWappConnectSignedStorageUrl(
        "https://lkbbrqcs.supabase.co/storage/v1/object/sign/invoice-pdfs/org/wappconnect/x.pdf?token=abc",
      ),
    ).toBe(true);
    expect(
      isWappConnectSignedStorageUrl(
        "https://example.supabase.co/functions/v1/serve-wappconnect-pdf?path=org/wappconnect/x.pdf",
      ),
    ).toBe(false);
  });
});

describe("getEffectiveWhatsAppLogStatus", () => {
  it("marks legacy sent rows as failed when provider returned 400", () => {
    expect(
      getEffectiveWhatsAppLogStatus({
        status: "sent",
        provider: "wappconnect",
        provider_response: { status: "400", message: "unsupported media type" },
        error_message: null,
      }),
    ).toBe("failed");
  });

  it("keeps successful sent rows as sent", () => {
    expect(
      getEffectiveWhatsAppLogStatus({
        status: "sent",
        provider: "wappconnect",
        provider_response: { status: "200", message: "ok" },
        error_message: null,
      }),
    ).toBe("sent");
  });
});
