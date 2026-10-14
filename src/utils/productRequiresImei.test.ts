import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRequiresImeiFormDefault,
  hasRequiresImeiStoredPreference,
  purchaseLineNeedsImeiPerUnit,
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

describe("purchaseLineNeedsImeiPerUnit", () => {
  const on = { enabled: true, imei_scan_enforcement: true };

  it("accessory line on a universal barcode (EAN) does not need per-unit IMEI", () => {
    expect(purchaseLineNeedsImeiPerUnit({ requires_imei: true, barcode: "8906086576427" }, on)).toBe(false);
    expect(purchaseLineNeedsImeiPerUnit({ requires_imei: true, barcode: "012345678905" }, on)).toBe(false);
  });

  it("phone line on a real IMEI or with no barcode yet still needs per-unit IMEI", () => {
    expect(purchaseLineNeedsImeiPerUnit({ requires_imei: true, barcode: "356938035643809" }, on)).toBe(true);
    expect(purchaseLineNeedsImeiPerUnit({ requires_imei: true, barcode: "" }, on)).toBe(true);
  });

  it("non-serialized product or enforcement off never needs per-unit IMEI", () => {
    expect(purchaseLineNeedsImeiPerUnit({ requires_imei: false, barcode: "356938035643809" }, on)).toBe(false);
    expect(
      purchaseLineNeedsImeiPerUnit({ requires_imei: true, barcode: "356938035643809" }, { enabled: true, imei_scan_enforcement: false }),
    ).toBe(false);
  });
});
