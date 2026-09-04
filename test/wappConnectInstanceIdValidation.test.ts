import { describe, expect, it } from "vitest";
import { getWhatsAppErrorHint } from "../src/utils/whatsappErrorHints.ts";
import { validateWappConnectInstanceId } from "../src/utils/wappConnectInstanceIdValidation.ts";

describe("validateWappConnectInstanceId", () => {
  it("rejects email-like login values", () => {
    expect(validateWappConnectInstanceId("ammarkk@123")).toMatch(/login email/i);
    expect(validateWappConnectInstanceId("shop@example.com")).toMatch(/instance id/i);
  });

  it("rejects values with spaces", () => {
    expect(validateWappConnectInstanceId("abc def")).toMatch(/spaces/i);
  });

  it("accepts typical instance id strings", () => {
    expect(validateWappConnectInstanceId("myshop-instance-42")).toBeNull();
    expect(validateWappConnectInstanceId("a1b2c3d4e5f6")).toBeNull();
  });
});

describe("getWhatsAppErrorHint — WappConnect instance not found", () => {
  it("surfaces actionable guidance for instance not found", () => {
    const hint = getWhatsAppErrorHint("Instance not found", { endpoint: "/api/sendText" }, "wappconnect");
    expect(hint?.title).toMatch(/instance not found/i);
    expect(hint?.action).toMatch(/Clear saved id/i);
  });
});
