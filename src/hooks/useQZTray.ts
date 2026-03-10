import { useState, useCallback, useEffect } from 'react';
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

export const useQZTray = () => {
  const [state, setState] = useState<QZTrayState>({
    isConnected: false,
    isConnecting: false,
    printers: [],
    selectedPrinter: null,
    error: null,
  });

  // Check if QZ Tray is available
  const isQZAvailable = useCallback((): boolean => {
    return typeof window !== 'undefined' && window.qz !== undefined;
  }, []);

  // Connect to QZ Tray (delegates to shared ensureQZConnection for security setup)
  const connect = useCallback(async (): Promise<boolean> => {
    if (state.isConnected) return true;

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Use the shared ensureQZConnection which handles security setup
      const { ensureQZConnection } = await import('@/utils/directInvoicePrint');
      const connected = await ensureQZConnection();
      if (connected) {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
        return true;
      }
      throw new Error('QZ Tray connection failed');
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to connect to QZ Tray';
      setState(prev => ({ 
        ...prev, 
        isConnecting: false, 
        error: errorMessage 
      }));
      return false;
    }
  }, [state.isConnected]);

  // Disconnect from QZ Tray
  const disconnect = useCallback(async (): Promise<void> => {
    if (!isQZAvailable() || !state.isConnected) return;

    try {
      await window.qz.websocket.disconnect();
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        printers: [], 
        selectedPrinter: null 
      }));
    } catch (err) {
      console.error('Failed to disconnect from QZ Tray:', err);
    }
  }, [isQZAvailable, state.isConnected]);

  // Get list of available printers
  const getPrinters = useCallback(async (): Promise<string[]> => {
    // Check live websocket status instead of React state to avoid stale closures
    const isActive = typeof window !== 'undefined' && window.qz?.websocket?.isActive?.() === true;
    if (!isActive && !state.isConnected) return [];

    try {
      const printers = await window.qz.printers.find();
      setState(prev => ({ ...prev, printers }));
      return printers;
    } catch (err: any) {
      console.error('Failed to get printers:', err);
      setState(prev => ({ ...prev, error: 'Failed to get printer list' }));
      return [];
    }
  }, [state.isConnected]);

  // Find thermal printers (common TSC printer names)
  const findThermalPrinters = useCallback(async (): Promise<string[]> => {
    const allPrinters = await getPrinters();
    const thermalKeywords = ['TSC', 'TTP', 'Zebra', 'DYMO', 'Brother', 'Thermal', 'Label'];
    
    return allPrinters.filter(printer => 
      thermalKeywords.some(keyword => 
        printer.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }, [getPrinters]);

  // Select a printer
  const selectPrinter = useCallback((printerName: string) => {
    setState(prev => ({ ...prev, selectedPrinter: printerName }));
    localStorage.setItem('qz_selected_printer', printerName);
  }, []);

  // Print raw TSPL commands
  const printRaw = useCallback(async (
    data: string, 
    printerName?: string
  ): Promise<boolean> => {
    const printer = printerName || state.selectedPrinter;
    
    if (!state.isConnected) {
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
      
      const config = qz.configs.create(printer, {
        encoding: 'UTF-8'
      });

      const printData = [{
        type: 'raw',
        format: 'plain',
        data: data
      }];

      await qz.print(config, printData);
      toast.success('Labels sent to printer');
      return true;
    } catch (err: any) {
      console.error('Print error:', err);
      toast.error(err?.message || 'Failed to print');
      return false;
    }
  }, [state.isConnected, state.selectedPrinter, connect]);

  // Initialize - try to restore saved printer
  useEffect(() => {
    const savedPrinter = localStorage.getItem('qz_selected_printer');
    if (savedPrinter) {
      setState(prev => ({ ...prev, selectedPrinter: savedPrinter }));
    }
  }, []);

  // Auto-connect when QZ becomes available (using waitForQZ)
  useEffect(() => {
    if (state.isConnected || state.isConnecting) return;
    let cancelled = false;
    const tryConnect = async () => {
      const { waitForQZ } = await import('@/utils/directInvoicePrint');
      const loaded = await waitForQZ();
      if (!loaded || cancelled) return;
      const connected = await connect();
      if (connected && !cancelled) {
        getPrinters();
      }
    };
    tryConnect();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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
