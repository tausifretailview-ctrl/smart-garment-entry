import { describe, expect, it } from "vitest";
import { getEffectiveWhatsAppLogStatus } from "../src/utils/whatsappLogStatus.ts";

describe("getEffectiveWhatsAppLogStatus", () => {
  it("shows read when read_at is set even if status is still sent (WappConnect)", () => {
    expect(
      getEffectiveWhatsAppLogStatus({
        status: "sent",
        provider: "wappconnect",
        read_at: "2026-06-30T10:00:00.000Z",
        delivered_at: null,
      }),
    ).toBe("read");
  });

  it("shows delivered when delivered_at is set", () => {
    expect(
      getEffectiveWhatsAppLogStatus({
        status: "sent",
        provider: "wappconnect",
        delivered_at: "2026-06-30T10:00:00.000Z",
      }),
    ).toBe("delivered");
  });
});
