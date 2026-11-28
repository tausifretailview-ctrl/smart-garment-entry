// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { canKickCashDrawer, drawerKickBase64, kickCashDrawer } from "./useCashDrawer";
import { PRINT_PREF_KEYS } from "@/utils/appPrint";

/** Cash drawer (Nov 2026): it went through QZ Tray, which is no longer loaded, so it never opened. */
afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  localStorage.clear();
});

describe("cash drawer kick", () => {
  it("pin 2 and pin 5 ESC/POS pulses", () => {
    expect([...atob(drawerKickBase64("pin2"))].map((c) => c.charCodeAt(0))).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    expect([...atob(drawerKickBase64("pin5"))].map((c) => c.charCodeAt(0))).toEqual([0x1b, 0x70, 0x01, 0x19, 0xfa]);
  });

  it("desktop app: sends the pulse to the receipt printer chosen on this computer", async () => {
    const printRaw = vi.fn(async () => ({ success: true }));
    (window as unknown as { electronAPI: unknown }).electronAPI = { isElectron: true, printRaw };
    localStorage.setItem(PRINT_PREF_KEYS.thermalPrinter, "TVS RP3160");
    expect(canKickCashDrawer()).toBe(true);
    await expect(kickCashDrawer(undefined, { pin: "pin5", showToast: false })).resolves.toBe(true);
    expect(printRaw).toHaveBeenCalledWith({ printerName: "TVS RP3160", base64: drawerKickBase64("pin5") });
  });

  it("no receipt printer chosen: nothing is sent", async () => {
    const printRaw = vi.fn(async () => ({ success: true }));
    (window as unknown as { electronAPI: unknown }).electronAPI = { isElectron: true, printRaw };
    await expect(kickCashDrawer(undefined, { showToast: false })).resolves.toBe(false);
    expect(printRaw).not.toHaveBeenCalled();
  });

  it("browser (or an older desktop app): reports it cannot open the drawer", async () => {
    expect(canKickCashDrawer()).toBe(false);
    await expect(kickCashDrawer("TVS", { showToast: false })).resolves.toBe(false);
  });

  it("a printer error is a failure, not a crash", async () => {
    (window as unknown as { electronAPI: unknown }).electronAPI = { printRaw: vi.fn(async () => { throw new Error("spooler down"); }) };
    await expect(kickCashDrawer("TVS", { showToast: false })).resolves.toBe(false);
  });
});
