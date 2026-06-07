import { useCallback } from 'react';

/**
 * QZ Tray bridge is disabled. This hook is a permanent no-op stub kept
 * only so existing callers (DirectPrintDialog, Settings, useCashDrawer)
 * continue to compile. It never opens a WebSocket and never loads qz-tray.js.
 * Actual printing now goes through browser print / jsPDF / Electron silent print.
 */
export const useQZTray = () => {
  const noopAsyncFalse = useCallback(async (): Promise<boolean> => false, []);
  const noopAsyncEmpty = useCallback(async (): Promise<string[]> => [], []);
  const noopSelect = useCallback((_printerName: string) => {}, []);
  const noopDisconnect = useCallback(async (): Promise<void> => {}, []);

  return {
    isConnected: false,
    isConnecting: false,
    printers: [] as string[],
    selectedPrinter: null as string | null,
    error: null as string | null,
    isQZAvailable: false,
    connect: noopAsyncFalse,
    disconnect: noopDisconnect,
    getPrinters: noopAsyncEmpty,
    findThermalPrinters: noopAsyncEmpty,
    selectPrinter: noopSelect,
    printRaw: noopAsyncFalse as (data: string, printerName?: string) => Promise<boolean>,
  };
};
