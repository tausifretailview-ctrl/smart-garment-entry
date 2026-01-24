import { useCallback } from 'react';
import { useQZTray } from './useQZTray';
import { toast } from 'sonner';

/**
 * ESC/POS Cash Drawer Kick Commands
 * Most cash drawers (including RUGTEK) use standard ESC/POS commands.
 * The drawer is typically connected to the thermal printer via RJ11/RJ12 cable.
 * 
 * Command format: ESC p m t1 t2
 * - ESC p (0x1B 0x70) = Cash drawer command
 * - m = drawer pin (0x00 = pin 2, 0x01 = pin 5)
 * - t1, t2 = on/off timing pulses
 */

// Standard cash drawer kick command for pin 2 (most common)
const CASH_DRAWER_KICK_PIN2 = '\x1B\x70\x00\x19\xFA';
// Alternative command for pin 5
const CASH_DRAWER_KICK_PIN5 = '\x1B\x70\x01\x19\xFA';

export type DrawerPin = 'pin2' | 'pin5';

export interface CashDrawerOptions {
  pin?: DrawerPin;
  showToast?: boolean;
}

export const useCashDrawer = () => {
  const qzTray = useQZTray();

  /**
   * Open the cash drawer by sending a kick command through the thermal printer
   * @param printerName - Optional printer name (uses selected printer if not provided)
   * @param options - Configuration options
   */
  const openDrawer = useCallback(async (
    printerName?: string,
    options: CashDrawerOptions = {}
  ): Promise<boolean> => {
    const { pin = 'pin2', showToast = true } = options;
    
    if (!qzTray.isQZAvailable) {
      if (showToast) {
        toast.error('QZ Tray is not installed. Required for cash drawer.');
      }
      return false;
    }

    // Connect if not connected
    if (!qzTray.isConnected) {
      const connected = await qzTray.connect();
      if (!connected) {
        if (showToast) {
          toast.error('Failed to connect to QZ Tray');
        }
        return false;
      }
    }

    const printer = printerName || qzTray.selectedPrinter;
    if (!printer) {
      if (showToast) {
        toast.error('No printer selected for cash drawer');
      }
      return false;
    }

    try {
      const kickCommand = pin === 'pin5' ? CASH_DRAWER_KICK_PIN5 : CASH_DRAWER_KICK_PIN2;
      
      // Send the kick command through the printer
      const success = await qzTray.printRaw(kickCommand, printer);
      
      if (success && showToast) {
        toast.success('Cash drawer opened');
      }
      
      return success;
    } catch (error: any) {
      console.error('Failed to open cash drawer:', error);
      if (showToast) {
        toast.error(error?.message || 'Failed to open cash drawer');
      }
      return false;
    }
  }, [qzTray]);

  /**
   * Test the cash drawer connection
   */
  const testDrawer = useCallback(async (printerName?: string): Promise<boolean> => {
    return openDrawer(printerName, { showToast: true });
  }, [openDrawer]);

  return {
    openDrawer,
    testDrawer,
    isQZAvailable: qzTray.isQZAvailable,
    isConnected: qzTray.isConnected,
    selectedPrinter: qzTray.selectedPrinter,
    printers: qzTray.printers,
    connect: qzTray.connect,
    getPrinters: qzTray.getPrinters,
    selectPrinter: qzTray.selectPrinter,
  };
};
