import { useCallback } from 'react';
import { toast } from 'sonner';
import { PRINT_PREF_KEYS } from '@/utils/appPrint';

/**
 * Cash drawer kick through the thermal receipt printer (ESC/POS).
 *
 * The drawer is cabled to the printer (RJ11/RJ12); the printer opens it when it receives
 * ESC p m t1 t2 — ESC p (0x1B 0x70), m = drawer pin (0 = pin 2, 1 = pin 5), t1/t2 = pulse.
 *
 * Nov 2026: the drawer used to go through QZ Tray, which the app no longer loads, so it never
 * opened. The desktop app (Electron) now sends the bytes straight to the receipt printer
 * (`electronAPI.printRaw`, electron/rawPrint.cjs). A browser cannot send raw bytes to a
 * printer: there, the printer driver's own "open cash drawer after printing" option does it.
 */

// Standard cash drawer kick command for pin 2 (most common)
export const CASH_DRAWER_KICK_PIN2 = [0x1b, 0x70, 0x00, 0x19, 0xfa];
// Alternative command for pin 5
export const CASH_DRAWER_KICK_PIN5 = [0x1b, 0x70, 0x01, 0x19, 0xfa];

export type DrawerPin = 'pin2' | 'pin5';

export interface CashDrawerOptions {
  pin?: DrawerPin;
  showToast?: boolean;
}

type RawPrintApi = {
  printRaw?: (options: { printerName: string; base64: string }) => Promise<{ success: boolean; error?: string | null }>;
};

function rawPrintApi(): RawPrintApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: RawPrintApi }).electronAPI;
  return api && typeof api.printRaw === 'function' ? api : null;
}

export function drawerKickBase64(pin: DrawerPin = 'pin2'): string {
  const bytes = pin === 'pin5' ? CASH_DRAWER_KICK_PIN5 : CASH_DRAWER_KICK_PIN2;
  return btoa(String.fromCharCode(...bytes));
}

/** The receipt printer chosen on this computer (Settings → Desktop Print Settings). */
export function receiptPrinterForDrawer(explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim();
  try {
    return (localStorage.getItem(PRINT_PREF_KEYS.thermalPrinter) || '').trim();
  } catch {
    return '';
  }
}

/** Can this computer open the drawer from the app (desktop app with raw printing)? */
export function canKickCashDrawer(): boolean {
  return rawPrintApi() !== null;
}

/**
 * Open the drawer. `printerName`: the receipt printer; by default the one chosen for receipts
 * on this computer. Never throws; false when the drawer could not be opened from here.
 */
export async function kickCashDrawer(printerName?: string | null, options: CashDrawerOptions = {}): Promise<boolean> {
  const { pin = 'pin2', showToast = true } = options;
  const api = rawPrintApi();
  if (!api?.printRaw) {
    if (showToast) {
      toast.error('Opening the drawer needs the EzzyERP desktop app', {
        description: 'In a browser, turn on "Open cash drawer" in the receipt printer\'s own Windows printer settings instead.',
      });
    }
    return false;
  }
  const printer = receiptPrinterForDrawer(printerName);
  if (!printer) {
    if (showToast) {
      toast.error('No receipt printer chosen', {
        description: 'Pick the thermal printer in Settings → Desktop Print Settings.',
      });
    }
    return false;
  }
  try {
    const result = await api.printRaw({ printerName: printer, base64: drawerKickBase64(pin) });
    if (showToast) {
      if (result?.success) toast.success('Cash drawer opened');
      else toast.error('Cash drawer did not open', { description: result?.error || undefined });
    }
    return !!result?.success;
  } catch (error: unknown) {
    if (showToast) toast.error(error instanceof Error ? error.message : 'Failed to open cash drawer');
    return false;
  }
}

export const useCashDrawer = () => {
  const openDrawer = useCallback(
    (printerName?: string, options: CashDrawerOptions = {}) => kickCashDrawer(printerName, options),
    [],
  );
  const testDrawer = useCallback(
    (printerName?: string, pin: DrawerPin = 'pin2') => kickCashDrawer(printerName, { pin, showToast: true }),
    [],
  );
  return { openDrawer, testDrawer, canOpenDrawer: canKickCashDrawer() };
};
