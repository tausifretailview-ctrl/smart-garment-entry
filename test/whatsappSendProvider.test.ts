import { describe, expect, it } from "vitest";
import {
  isBuiltinSendProvider,
  isWappConnectSendProvider,
  normalizeSendProvider,
} from "@/constants/whatsappSendProvider";

describe("whatsapp send provider", () => {
  it("defaults unknown/empty values to existing (current orgs unchanged)", () => {
    expect(normalizeSendProvider(undefined)).toBe("existing");
    expect(normalizeSendProvider(null)).toBe("existing");
    expect(normalizeSendProvider("garbage")).toBe("existing");
    expect(normalizeSendProvider("existing")).toBe("existing");
  });

  it("recognises wappconnect and builtin", () => {
    expect(normalizeSendProvider("wappconnect")).toBe("wappconnect");
    expect(normalizeSendProvider("builtin")).toBe("builtin");
    expect(isBuiltinSendProvider("builtin")).toBe(true);
    expect(isBuiltinSendProvider("wappconnect")).toBe(false);
  });

  it("treats builtin like wappconnect for the text+PDF flow, never Meta", () => {
    expect(isWappConnectSendProvider("builtin")).toBe(true);
    expect(isWappConnectSendProvider("wappconnect")).toBe(true);
    expect(isWappConnectSendProvider("existing")).toBe(false);
  });
});
