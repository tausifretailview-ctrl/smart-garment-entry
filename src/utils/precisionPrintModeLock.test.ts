import { describe, expect, it } from "vitest";
import {
  applyPrintModeDecision,
  printModeWriteAllowed,
  resolveLockedPrintMode,
  type UserPrintModeLock,
} from "./precisionPrintModeLock";

const locked3up: UserPrintModeLock = {
  mode: "thermal3up",
  cols: 3,
  source: "click",
};

describe("printModeWriteAllowed", () => {
  it("lets the user click or print even when locked", () => {
    expect(printModeWriteAllowed(locked3up, "user-click")).toBe(true);
    expect(printModeWriteAllowed(locked3up, "user-print")).toBe(true);
  });

  it("lets a new purchase nav or org change reset the lock", () => {
    expect(printModeWriteAllowed(locked3up, "new-purchase-nav")).toBe(true);
    expect(printModeWriteAllowed(locked3up, "org-change")).toBe(true);
  });

  it("rejects background writers while the user lock is set", () => {
    expect(printModeWriteAllowed(locked3up, "settings-fetch")).toBe(false);
    expect(printModeWriteAllowed(locked3up, "preset-autoload")).toBe(false);
    expect(printModeWriteAllowed(locked3up, "preset-load")).toBe(false);
    expect(printModeWriteAllowed(locked3up, "autosave")).toBe(false);
    expect(printModeWriteAllowed(locked3up, "sheet-type")).toBe(false);
  });

  it("allows background writers when there is no lock", () => {
    expect(printModeWriteAllowed(null, "settings-fetch")).toBe(true);
    expect(printModeWriteAllowed(null, "preset-autoload")).toBe(true);
  });
});

describe("applyPrintModeDecision — user 3-up must stay", () => {
  it("user clicks 3-up then settings refetch stays 3-up", () => {
    const afterClick = applyPrintModeDecision({
      lock: null,
      reason: "user-click",
      requestedMode: "thermal3up",
    });
    expect(afterClick.accepted).toBe(true);
    expect(afterClick.lock?.mode).toBe("thermal3up");

    const afterSettings = applyPrintModeDecision({
      lock: afterClick.lock,
      reason: "settings-fetch",
      requestedMode: "thermal",
    });
    expect(afterSettings.accepted).toBe(false);
    expect(afterSettings.mode).toBe("thermal3up");
    expect(afterSettings.lock?.mode).toBe("thermal3up");
  });

  it("user clicks 3-up then 1-up-tagged preset auto-load stays 3-up", () => {
    const lock = applyPrintModeDecision({
      lock: null,
      reason: "user-click",
      requestedMode: "thermal3up",
    }).lock;
    const afterPreset = applyPrintModeDecision({
      lock,
      reason: "preset-autoload",
      requestedMode: "thermal",
    });
    expect(afterPreset.accepted).toBe(false);
    expect(afterPreset.mode).toBe("thermal3up");
  });

  it("user clicks 3-up then autosave / preset refresh cannot flip mode", () => {
    const lock = applyPrintModeDecision({
      lock: null,
      reason: "user-click",
      requestedMode: "thermal3up",
    }).lock;
    const afterAutosave = applyPrintModeDecision({
      lock,
      reason: "autosave",
      requestedMode: "thermal",
    });
    expect(afterAutosave.accepted).toBe(false);
    expect(afterAutosave.mode).toBe("thermal3up");
  });

  it("user clicks 3-up then sheet-type sync cannot steal mode", () => {
    const lock = applyPrintModeDecision({
      lock: null,
      reason: "user-click",
      requestedMode: "thermal3up",
    }).lock;
    const afterSheet = applyPrintModeDecision({
      lock,
      reason: "sheet-type",
      requestedMode: "thermal",
    });
    expect(afterSheet.accepted).toBe(false);
    expect(printModeWriteAllowed(lock, "sheet-type")).toBe(false);
    expect(afterSheet.mode).toBe("thermal3up");
  });

  it("Print locks the current mode so a late 1-up write cannot change the strip", () => {
    const afterPrint = applyPrintModeDecision({
      lock: null,
      reason: "user-print",
      requestedMode: "thermal3up",
    });
    expect(afterPrint.lock?.source).toBe("print");
    const strip = resolveLockedPrintMode(afterPrint.lock, "thermal", 1);
    expect(strip.mode).toBe("thermal3up");
    expect(strip.cols).toBe(3);
  });

  it("new purchase nav clears the lock so Settings landing may apply once", () => {
    const locked = applyPrintModeDecision({
      lock: null,
      reason: "user-click",
      requestedMode: "thermal3up",
    }).lock;
    const afterNav = applyPrintModeDecision({
      lock: locked,
      reason: "new-purchase-nav",
      requestedMode: "thermal",
    });
    expect(afterNav.accepted).toBe(true);
    expect(afterNav.lock).toBeNull();
    expect(afterNav.mode).toBe("thermal");
  });
});
