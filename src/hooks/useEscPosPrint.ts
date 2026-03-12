import { useState, useCallback, useEffect } from 'react';
import {
  isWebUsbSupported,
  connectUsbPrinter,
  disconnectUsbPrinter,
  printViaWebUsb,
  getConnectedUsbPrinter,
} from '@/utils/webUsbPrint';
import { generateEscPosReceipt, EscPosReceiptData } from '@/utils/escPosPrint';
import { toast } from 'sonner';

const USB_THERMAL_ENABLED_KEY = 'ezzy_usb_thermal_receipt_enabled';

export const useEscPosPrint = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);

  useEffect(() => {
    const device = getConnectedUsbPrinter();
    if (device) {
      setIsConnected(true);
      setPrinterName(device.productName || device.manufacturerName || 'USB Receipt Printer');
    }
  }, []);

  const isUsbEnabled = (): boolean => {
    try {
      return localStorage.getItem(USB_THERMAL_ENABLED_KEY) === 'true';
    } catch { return false; }
  };

  const setUsbEnabled = (val: boolean) => {
    try { localStorage.setItem(USB_THERMAL_ENABLED_KEY, val ? 'true' : 'false'); } catch { }
  };

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isWebUsbSupported()) {
      toast.error('USB Direct printing requires Chrome or Edge browser.');
      return false;
    }
    setIsConnecting(true);
    const result = await connectUsbPrinter();
    setIsConnecting(false);
    if (result.success) {
      setIsConnected(true);
      setPrinterName(result.name);
      setUsbEnabled(true);
      toast.success(`Receipt printer connected: ${result.name}`);
    } else {
      toast.error(result.error || 'Connection failed');
    }
    return result.success;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectUsbPrinter();
    setIsConnected(false);
    setPrinterName(null);
    setUsbEnabled(false);
    toast.info('Receipt printer disconnected');
  }, []);

  const printReceipt = useCallback(async (data: EscPosReceiptData): Promise<boolean> => {
    if (!isConnected) {
      toast.error('USB receipt printer not connected.');
      return false;
    }
    setIsPrinting(true);
    try {
      const commands = generateEscPosReceipt(data);
      const result = await printViaWebUsb(commands);
      if (result.success) {
        toast.success('Receipt printed ✓');
        return true;
      } else {
        if (result.error?.includes('disconnected')) {
          setIsConnected(false);
          setPrinterName(null);
        }
        toast.error(result.error || 'Print failed');
        return false;
      }
    } catch (err: any) {
      toast.error(err?.message || 'Print error');
      return false;
    } finally {
      setIsPrinting(false);
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
    printReceipt,
    isUsbEnabled,
  };
};
