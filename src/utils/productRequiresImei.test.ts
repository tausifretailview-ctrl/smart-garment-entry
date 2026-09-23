import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRequiresImeiFormDefault,
  hasRequiresImeiStoredPreference,
  rememberRequiresImeiFormChoice,
} from "./productRequiresImei";

function stubLocalStorage() {
  let store: Record<string, string> = {};
  const stub = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
  vi.stubGlobal("localStorage", stub);
  return stub;
}

describe("requires_imei form preference helpers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubLocalStorage();
  });

  it("defaults to true with no stored preference", () => {
    expect(getRequiresImeiFormDefault("ACCESSORIES")).toBe(true);
    expect(hasRequiresImeiStoredPreference("ACCESSORIES")).toBe(false);
    expect(hasRequiresImeiStoredPreference("")).toBe(false);
  });

  it("remembers a per-category choice and reports it as stored", () => {
    rememberRequiresImeiFormChoice(false, "ACCESSORIES");
    expect(getRequiresImeiFormDefault("ACCESSORIES")).toBe(false);
    expect(getRequiresImeiFormDefault("accessories ")).toBe(false);
    expect(hasRequiresImeiStoredPreference("ACCESSORIES")).toBe(true);
    // Other categories fall back to the last-used global value.
    expect(getRequiresImeiFormDefault("MOBILE")).toBe(false);
    expect(hasRequiresImeiStoredPreference("MOBILE")).toBe(true);
  });

  it("keeps explicit-true distinct from never-chosen (stored preference is true)", () => {
    rememberRequiresImeiFormChoice(true, "MOBILE");
    expect(hasRequiresImeiStoredPreference("MOBILE")).toBe(true);
    expect(hasRequiresImeiStoredPreference("TABLET")).toBe(true);
  });
});
