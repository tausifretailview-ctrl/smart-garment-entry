import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

declare global {
  interface Window {
    qz: any;
  }
}

interface QZTrayState {
  isConnected: boolean;
  isConnecting: boolean;
  printers: string[];
  selectedPrinter: string | null;
  error: string | null;
}

/**
 * Setup QZ Tray security callbacks for anonymous mode.
 * MUST be called before every connect() AND before printers.find().
 * QZ Tray 2.x requires these to be set each time — they do not persist.
 */
function setupQZSecurity(qz: any) {
  // Anonymous certificate — no paid cert needed
  qz.security.setCertificatePromise(function(resolve: Function, reject: Function) {
    resolve();
  });
  // Anonymous signature — no signing needed
  qz.security.setSignaturePromise(function(toSign: string, resolve: Function, reject: Function) {
    resolve();
  });
}

export const useQZTray = () => {
  const [state, setState] = useState<QZTrayState>({
    isConnected: false,
    isConnecting: false,
    printers: [],
    selectedPrinter: null,
    error: null,
  });

  // Ref to prevent duplicate getPrinters calls
  const fetchingPrinters = useRef(false);

  // Check if QZ Tray JS is loaded on the page
  const isQZAvailable = useCallback((): boolean => {
    return typeof window !== 'undefined' && window.qz !== undefined;
  }, []);

  // Get live websocket status — does NOT use stale React state
  const isQZConnected = useCallback((): boolean => {
    return isQZAvailable() && window.qz?.websocket?.isActive?.() === true;
  }, [isQZAvailable]);

  // Connect to QZ Tray
  const connect = useCallback(async (): Promise<boolean> => {
    if (!isQZAvailable()) {
      setState(prev => ({
        ...prev,
        error: 'QZ Tray is not installed. Please download from https://qz.io/download/'
      }));
      return false;
    }

    // Already connected — use live check
    if (isQZConnected()) {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
      return true;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const qz = window.qz;

      // ALWAYS set security BEFORE connect() — required by QZ Tray 2.x
      setupQZSecurity(qz);

      await qz.websocket.connect();

      setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      return true;
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to connect to QZ Tray';
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage
      }));
      return false;
    }
  }, [isQZAvailable, isQZConnected]);

  // Disconnect from QZ Tray
  const disconnect = useCallback(async (): Promise<void> => {
    if (!isQZAvailable()) return;
    try {
      if (window.qz?.websocket?.isActive()) {
        await window.qz.websocket.disconnect();
      }
      setState(prev => ({
        ...prev,
        isConnected: false,
        printers: [],
        selectedPrinter: null
      }));
    } catch (err) {
      console.error('Failed to disconnect from QZ Tray:', err);
    }
  }, [isQZAvailable]);

  // Get list of available printers
  // Uses LIVE websocket check — not stale state.isConnected
  const getPrinters = useCallback(async (): Promise<string[]> => {
    if (!isQZAvailable()) return [];

    // Live check — not stale React state
    if (!window.qz?.websocket?.isActive?.()) {
      // Try to connect first
      const connected = await connect();
      if (!connected) return [];
    }

    // Prevent duplicate concurrent calls
    if (fetchingPrinters.current) return [];
    fetchingPrinters.current = true;

    try {
      const qz = window.qz;

      // Re-apply security before printers.find() — required after any gap
      setupQZSecurity(qz);

      const result = await qz.printers.find();
      const printerList: string[] = Array.isArray(result) ? result : (result ? [result] : []);

      setState(prev => ({ ...prev, printers: printerList, error: null }));
      return printerList;
    } catch (err: any) {
      console.error('Failed to get printers:', err);
      setState(prev => ({ ...prev, error: 'Failed to get printer list' }));
      return [];
    } finally {
      fetchingPrinters.current = false;
    }
  }, [isQZAvailable, connect]);

  // Find thermal printers by name keywords
  const findThermalPrinters = useCallback(async (): Promise<string[]> => {
    const allPrinters = await getPrinters();
    const thermalKeywords = ['TSC', 'TTP', 'Zebra', 'DYMO', 'Brother', 'Thermal', 'Label'];
    return allPrinters.filter(printer =>
      thermalKeywords.some(keyword =>
        printer.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }, [getPrinters]);

  // Select a printer and persist to localStorage
  const selectPrinter = useCallback((printerName: string) => {
    setState(prev => ({ ...prev, selectedPrinter: printerName }));
    localStorage.setItem('qz_selected_printer', printerName);
  }, []);

  // Print raw TSPL/ZPL commands
  const printRaw = useCallback(async (
    data: string,
    printerName?: string
  ): Promise<boolean> => {
    const printer = printerName || state.selectedPrinter;

    if (!isQZAvailable()) {
      toast.error('QZ Tray is not installed');
      return false;
    }

    if (!window.qz?.websocket?.isActive?.()) {
      const connected = await connect();
      if (!connected) {
        toast.error('Failed to connect to QZ Tray');
        return false;
      }
    }

    if (!printer) {
      toast.error('No printer selected');
      return false;
    }

    try {
      const qz = window.qz;

      // Re-apply security before printing
      setupQZSecurity(qz);

      const config = qz.configs.create(printer, { encoding: 'UTF-8' });
      const printData = [{ type: 'raw', format: 'plain', data }];

      await qz.print(config, printData);
      toast.success('Labels sent to printer');
      return true;
    } catch (err: any) {
      console.error('Print error:', err);
      toast.error(err?.message || 'Failed to print');
      return false;
    }
  }, [isQZAvailable, state.selectedPrinter, connect]);

  // Restore saved printer on mount
  useEffect(() => {
    const savedPrinter = localStorage.getItem('qz_selected_printer');
    if (savedPrinter) {
      setState(prev => ({ ...prev, selectedPrinter: savedPrinter }));
    }
  }, []);

  // Auto-connect on mount (with delay to let QZ script load)
  useEffect(() => {
    if (!isQZAvailable()) return;
    if (isQZConnected()) {
      // Already connected — just sync state and fetch printers
      setState(prev => ({ ...prev, isConnected: true }));
      getPrinters();
      return;
    }
    const timer = setTimeout(() => {
      connect().then(connected => {
        if (connected) getPrinters();
      });
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // Sync isConnected state with live websocket status
  useEffect(() => {
    const syncInterval = setInterval(() => {
      const live = isQZConnected();
      setState(prev => {
        if (prev.isConnected !== live) {
          return { ...prev, isConnected: live };
        }
        return prev;
      });
    }, 3000);
    return () => clearInterval(syncInterval);
  }, [isQZConnected]);

  return {
    ...state,
    isQZAvailable: isQZAvailable(),
    connect,
    disconnect,
    getPrinters,
    findThermalPrinters,
    selectPrinter,
    printRaw,
  };
};
