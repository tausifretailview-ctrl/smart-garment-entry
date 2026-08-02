import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BarcodeStockScanSheet } from "@/components/mobile/BarcodeStockScanSheet";
import { CameraBarcodeScannerDialog } from "@/components/CameraBarcodeScannerDialog";

type BillingScanHandler = (barcode: string) => void | Promise<void>;

type MobileScanContextValue = {
  openScan: () => void;
  closeScan: () => void;
  scanOpen: boolean;
  /**
   * When set, bottom-nav Scan opens the camera and delivers barcodes here
   * (mobile POS billing). When null, Scan opens the stock-check sheet.
   */
  registerBillingScanHandler: (handler: BillingScanHandler | null) => void;
  hasBillingScanHandler: boolean;
};

const MobileScanContext = createContext<MobileScanContextValue | null>(null);

export function MobileScanProvider({ children }: { children: ReactNode }) {
  const [stockScanOpen, setStockScanOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const billingHandlerRef = useRef<BillingScanHandler | null>(null);
  const [hasBillingScanHandler, setHasBillingScanHandler] = useState(false);

  const registerBillingScanHandler = useCallback((handler: BillingScanHandler | null) => {
    billingHandlerRef.current = handler;
    setHasBillingScanHandler(!!handler);
  }, []);

  const openScan = useCallback(() => {
    if (billingHandlerRef.current) {
      setCameraOpen(true);
      return;
    }
    setStockScanOpen(true);
  }, []);

  const closeScan = useCallback(() => {
    setStockScanOpen(false);
    setCameraOpen(false);
  }, []);

  const onBarcodeScanned = useCallback(async (barcode: string) => {
    const handler = billingHandlerRef.current;
    setCameraOpen(false);
    if (handler) {
      await handler(barcode);
    }
  }, []);

  const value = useMemo(
    () => ({
      openScan,
      closeScan,
      scanOpen: stockScanOpen || cameraOpen,
      registerBillingScanHandler,
      hasBillingScanHandler,
    }),
    [openScan, closeScan, stockScanOpen, cameraOpen, registerBillingScanHandler, hasBillingScanHandler],
  );

  return (
    <MobileScanContext.Provider value={value}>
      {children}
      <BarcodeStockScanSheet open={stockScanOpen} onOpenChange={setStockScanOpen} />
      <CameraBarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onBarcodeScanned={onBarcodeScanned}
        showSuccessToast={false}
      />
    </MobileScanContext.Provider>
  );
}

export function useMobileScan() {
  const ctx = useContext(MobileScanContext);
  if (!ctx) {
    return {
      openScan: () => {},
      closeScan: () => {},
      scanOpen: false,
      registerBillingScanHandler: () => {},
      hasBillingScanHandler: false,
    };
  }
  return ctx;
}
