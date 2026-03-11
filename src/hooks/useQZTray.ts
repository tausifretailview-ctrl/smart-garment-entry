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

// Must be called before connect() AND before printers.find() AND before print()
function setupQZSecurity(qz: any) {
  qz.security.setCertificatePromise(function(resolve: Function, reject: Function) {
    resolve(); // anonymous mode — no certificate needed
  });
  qz.security.setSignaturePromise(function(toSign: string, resolve: Function, reject: Function) {
    resolve(); // anonymous mode — no signature needed
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

  const fetchingPrinters = useRef(false);

  const isQZAvailable = useCallback((): boolean => {
    return typeof window !== 'undefined' && window.qz !== undefined;
  }, []);

  const isQZLive = (): boolean => {
    return typeof window !== 'undefined' && window.qz?.websocket?.isActive?.() === true;
  };

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isQZAvailable()) {
      setState(prev => ({ ...prev, error: 'QZ Tray not installed. Download from https://qz.io/download/' }));
      return false;
    }

    if (isQZLive()) {
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
      return true;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const qz = window.qz;
      setupQZSecurity(qz); // MUST be before connect()
      await qz.websocket.connect();
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, isConnecting: false, error: err?.message || 'Failed to connect to QZ Tray' }));
      return false;
    }
  }, [isQZAvailable]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (!isQZAvailable()) return;
    try {
      if (isQZLive()) await window.qz.websocket.disconnect();
      setState(prev => ({ ...prev, isConnected: false, printers: [], selectedPrinter: null }));
    } catch (err) {
      console.error('Failed to disconnect from QZ Tray:', err);
    }
  }, [isQZAvailable]);

  const getPrinters = useCallback(async (): Promise<string[]> => {
    if (!isQZAvailable()) return [];
    if (fetchingPrinters.current) return state.printers;
    fetchingPrinters.current = true;

    try {
      // Connect if not already connected
      if (!isQZLive()) {
        const connected = await connect();
        if (!connected) { fetchingPrinters.current = false; return []; }
      }

      const qz = window.qz;
      setupQZSecurity(qz); // MUST be before printers.find()
      const result = await qz.printers.find();
      const list: string[] = Array.isArray(result) ? result : (result ? [String(result)] : []);

      setState(prev => ({ ...prev, printers: list, error: null, isConnected: true }));
      return list;
    } catch (err: any) {
      console.error('Failed to get printers:', err);
      setState(prev => ({ ...prev, error: 'Failed to get printer list' }));
      return [];
    } finally {
      fetchingPrinters.current = false;
    }
  }, [isQZAvailable, connect, state.printers]);

  const findThermalPrinters = useCallback(async (): Promise<string[]> => {
    const all = await getPrinters();
    const keywords = ['TSC', 'TTP', 'Zebra', 'DYMO', 'Brother', 'Thermal', 'Label'];
    return all.filter(p => keywords.some(k => p.toLowerCase().includes(k.toLowerCase())));
  }, [getPrinters]);

  const selectPrinter = useCallback((printerName: string) => {
    setState(prev => ({ ...prev, selectedPrinter: printerName }));
    localStorage.setItem('qz_selected_printer', printerName);
  }, []);

  const printRaw = useCallback(async (data: string, printerName?: string): Promise<boolean> => {
    const printer = printerName || state.selectedPrinter;

    if (!isQZAvailable()) { toast.error('QZ Tray is not installed'); return false; }
    if (!printer) { toast.error('No printer selected'); return false; }

    if (!isQZLive()) {
      const connected = await connect();
      if (!connected) { toast.error('Failed to connect to QZ Tray'); return false; }
    }

    try {
      const qz = window.qz;
      setupQZSecurity(qz); // MUST be before print()
      const config = qz.configs.create(printer, { encoding: 'UTF-8' });
      await qz.print(config, [{ type: 'raw', format: 'plain', data }]);
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
    const saved = localStorage.getItem('qz_selected_printer');
    if (saved) setState(prev => ({ ...prev, selectedPrinter: saved }));
  }, []);

  // Auto-connect + fetch printers on mount
  useEffect(() => {
    if (!isQZAvailable()) return;
    const timer = setTimeout(() => {
      if (isQZLive()) {
        setState(prev => ({ ...prev, isConnected: true }));
        getPrinters();
      } else {
        connect().then(ok => { if (ok) getPrinters(); });
      }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount only

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
