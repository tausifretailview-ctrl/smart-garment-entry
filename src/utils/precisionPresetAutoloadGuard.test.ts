import { afterEach, describe, expect, it } from "vitest";
import {
  decidePrecisionAutoload,
  markPrecisionAutoload,
  nextBarcodeLoadAllMountSeq,
  normalizePrecisionPresetName,
  precisionAutoloadSessionKey,
  precisionAutoloadSettingsAlreadyInPlace,
  readPrecisionAutoloadRecord,
  resetPrecisionAutoloadGuardForTests,
  shouldSkipPrecisionAutoloadApply,
  shouldSkipPrecisionAutoloadToast,
} from "./precisionPresetAutoloadGuard";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

afterEach(() => {
  resetPrecisionAutoloadGuardForTests();
});

describe("normalizePrecisionPresetName", () => {
  it("strips preset: and empty names", () => {
    expect(normalizePrecisionPresetName("preset:PAYAL 102*53")).toBe("PAYAL 102*53");
    expect(normalizePrecisionPresetName("PAYAL 102*53")).toBe("PAYAL 102*53");
    expect(normalizePrecisionPresetName(null)).toBe(null);
    expect(normalizePrecisionPresetName("preset:")).toBe(null);
  });
});

describe("stale-closure / already showing — Fix 1", () => {
  it("does not toast when the UI already shows the incoming preset", () => {
    const storage = memoryStorage();
    expect(
      shouldSkipPrecisionAutoloadToast({
        orgId: "org-1",
        presetName: "PAYAL 102*53",
        alreadyShowingPreset: true,
        storage,
      }),
    ).toBe(true);
    expect(
      decidePrecisionAutoload({
        orgId: "org-1",
        currentPresetName: "PAYAL 102*53",
        incomingPresetName: "PAYAL 102*53",
        settingsAlreadyInPlace: true,
        storage,
      }),
    ).toEqual({ apply: false, toast: false, setActiveName: false });
  });

  it("toasts once on a genuine first autoload (no current name, no session)", () => {
    const storage = memoryStorage();
    expect(
      decidePrecisionAutoload({
        orgId: "org-1",
        currentPresetName: null,
        incomingPresetName: "PAYAL 102*53",
        settingsAlreadyInPlace: false,
        storage,
      }),
    ).toEqual({ apply: true, toast: true, setActiveName: true });
  });
});

describe("session guard — Fix 2", () => {
  it("skips toast on remount when the same org+preset was already auto-loaded", () => {
    const storage = memoryStorage();
    markPrecisionAutoload({
      orgId: "org-1",
      presetName: "PAYAL 102*53",
      now: 1_000,
      storage,
    });
    expect(readPrecisionAutoloadRecord("org-1", storage)?.name).toBe("PAYAL 102*53");
    expect(
      decidePrecisionAutoload({
        orgId: "org-1",
        currentPresetName: null,
        incomingPresetName: "PAYAL 102*53",
        settingsAlreadyInPlace: false,
        now: 2_000,
        storage,
      }),
    ).toEqual({ apply: true, toast: false, setActiveName: true });
  });

  it("skips apply when settings are already the incoming preset", () => {
    expect(
      shouldSkipPrecisionAutoloadApply({ settingsAlreadyInPlace: true }),
    ).toBe(true);
    expect(
      shouldSkipPrecisionAutoloadApply({ settingsAlreadyInPlace: false }),
    ).toBe(false);
  });

  it("still applies geometry on a remount whose designer is back at defaults", () => {
    const storage = memoryStorage();
    markPrecisionAutoload({
      orgId: "org-1",
      presetName: "PAYAL 102*53",
      now: 1_000,
      storage,
    });
    const decision = decidePrecisionAutoload({
      orgId: "org-1",
      currentPresetName: "PAYAL 102*53",
      incomingPresetName: "PAYAL 102*53",
      settingsAlreadyInPlace: false,
      now: 1_500,
      storage,
    });
    expect(decision.apply).toBe(true);
    expect(decision.toast).toBe(false);
    expect(decision.setActiveName).toBe(false);
  });

  it("allows toast + apply when the preset actually changes", () => {
    const storage = memoryStorage();
    markPrecisionAutoload({
      orgId: "org-1",
      presetName: "PAYAL 102*53",
      now: 1_000,
      storage,
    });
    expect(
      decidePrecisionAutoload({
        orgId: "org-1",
        currentPresetName: null,
        incomingPresetName: "Kids Zone",
        settingsAlreadyInPlace: false,
        now: 2_000,
        storage,
      }),
    ).toEqual({ apply: true, toast: true, setActiveName: true });
  });

  it("uses a per-org session key", () => {
    expect(precisionAutoloadSessionKey("abc")).toBe("ezzy_precision_autoload_abc");
  });
});

describe("precisionAutoloadSettingsAlreadyInPlace", () => {
  const payal = {
    name: "PAYAL 102*53",
    width: 102,
    height: 53,
    xOffset: 1,
    yOffset: 2,
  };

  it("is true only when name and geometry match", () => {
    expect(precisionAutoloadSettingsAlreadyInPlace(payal, payal)).toBe(true);
    expect(
      precisionAutoloadSettingsAlreadyInPlace({ ...payal, width: 50 }, payal),
    ).toBe(false);
    expect(
      precisionAutoloadSettingsAlreadyInPlace({ ...payal, name: null }, payal),
    ).toBe(false);
  });
});

describe("loadAll mount counter — Fix 3", () => {
  it("increments so remounts are greppable", () => {
    expect(nextBarcodeLoadAllMountSeq()).toBe(1);
    expect(nextBarcodeLoadAllMountSeq()).toBe(2);
  });
});
