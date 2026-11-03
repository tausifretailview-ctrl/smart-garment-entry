import { describe, expect, it } from "vitest";
import { shopWhatsAppHealth } from "./shopWhatsAppHealth";

const base = {
  send_provider: "wappconnect",
  integration_on: true,
  builtin_status: null,
  last_ok_at: null,
  last_failed_at: null,
};

describe("shopWhatsAppHealth", () => {
  it("is off without a provider or with the integration off", () => {
    expect(shopWhatsAppHealth({ ...base, send_provider: null })).toBe("off");
    expect(shopWhatsAppHealth({ ...base, integration_on: false })).toBe("off");
  });
  it("marks an Ezzy ERP WhatsApp number that is not connected", () => {
    expect(shopWhatsAppHealth({ ...base, send_provider: "builtin", builtin_status: "logged_out" })).toBe("unlinked");
    expect(
      shopWhatsAppHealth({ ...base, send_provider: "builtin", builtin_status: "connected", last_ok_at: "2026-11-03T10:00:00Z" }),
    ).toBe("ok");
  });
  it("is failing when the latest send failed (WappConnect logout)", () => {
    expect(
      shopWhatsAppHealth({ ...base, last_ok_at: "2026-11-03T10:00:00Z", last_failed_at: "2026-11-03T11:00:00Z" }),
    ).toBe("failing");
    expect(shopWhatsAppHealth({ ...base, last_failed_at: "2026-11-03T11:00:00Z" })).toBe("failing");
  });
  it("is working when a send went out after the last failure, idle with no sends", () => {
    expect(
      shopWhatsAppHealth({ ...base, last_ok_at: "2026-11-03T12:00:00Z", last_failed_at: "2026-11-03T11:00:00Z" }),
    ).toBe("ok");
    expect(shopWhatsAppHealth(base)).toBe("idle");
  });
});
