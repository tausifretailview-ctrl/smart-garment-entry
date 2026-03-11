import { useState, useCallback, useEffect } from 'react';
import {
  isWebUsbSupported,
  connectUsbPrinter,
  disconnectUsbPrinter,
  printViaWebUsb,
  getConnectedUsbPrinter,
} from '@/utils/webUsbPrint';
import { toast } from 'sonner';

export const useWebUsbPrint = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);

  useEffect(() => {
    const device = getConnectedUsbPrinter();
    if (device) {
      setIsConnected(true);
      setPrinterName(device.productName || device.manufacturerName || 'USB Printer');
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    const result = await connectUsbPrinter();
    setIsConnecting(false);
    if (result.success) {
      setIsConnected(true);
      setPrinterName(result.name);
      toast.success(`Connected to ${result.name}`);
    } else {
      toast.error(result.error || 'Connection failed');
    }
    return result.success;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectUsbPrinter();
    setIsConnected(false);
    setPrinterName(null);
    toast.info('Printer disconnected');
  }, []);

  const print = useCallback(async (tsplCommands: string): Promise<boolean> => {
    if (!isConnected) {
      toast.error('No printer connected. Click "Connect USB Printer" first.');
      return false;
    }
    setIsPrinting(true);
    const result = await printViaWebUsb(tsplCommands);
    setIsPrinting(false);
    if (result.success) {
      toast.success('Labels sent to printer ✓');
      return true;
    } else {
      if (result.error?.includes('disconnected')) setIsConnected(false);
      toast.error(result.error || 'Print failed');
      return false;
    }
  }, [isConnected]);

  return {
    isSupported: isWebUsbSupported(),
    isConnected,
    isConnecting,
    isPrinting,
    printerName,
    connect,
    disconnect,
    print,
  };
};
