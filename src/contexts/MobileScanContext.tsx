import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { BarcodeStockScanSheet } from "@/components/mobile/BarcodeStockScanSheet";

type MobileScanContextValue = {
  openScan: () => void;
  closeScan: () => void;
  scanOpen: boolean;
};

const MobileScanContext = createContext<MobileScanContextValue | null>(null);

export function MobileScanProvider({ children }: { children: ReactNode }) {
  const [scanOpen, setScanOpen] = useState(false);

  const openScan = useCallback(() => setScanOpen(true), []);
  const closeScan = useCallback(() => setScanOpen(false), []);

  return (
    <MobileScanContext.Provider value={{ openScan, closeScan, scanOpen }}>
      {children}
      <BarcodeStockScanSheet open={scanOpen} onOpenChange={setScanOpen} />
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
    };
  }
  return ctx;
}
