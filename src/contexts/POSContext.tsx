import { createContext, useContext, useState, ReactNode } from "react";

interface POSContextType {
  onNewSale: (() => void) | null;
  onClearCart: (() => void) | null;
  onOpenCashierReport: (() => void) | null;
  onOpenStockReport: (() => void) | null;
  hasItems: boolean;
  setOnNewSale: (fn: (() => void) | null) => void;
  setOnClearCart: (fn: (() => void) | null) => void;
  setOnOpenCashierReport: (fn: (() => void) | null) => void;
  setOnOpenStockReport: (fn: (() => void) | null) => void;
  setHasItems: (has: boolean) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider = ({ children }: { children: ReactNode }) => {
  const [onNewSale, setOnNewSale] = useState<(() => void) | null>(null);
  const [onClearCart, setOnClearCart] = useState<(() => void) | null>(null);
  const [onOpenCashierReport, setOnOpenCashierReport] = useState<(() => void) | null>(null);
  const [onOpenStockReport, setOnOpenStockReport] = useState<(() => void) | null>(null);
  const [hasItems, setHasItems] = useState(false);

  return (
    <POSContext.Provider value={{ 
      onNewSale, 
      onClearCart, 
      onOpenCashierReport,
      onOpenStockReport,
      hasItems, 
      setOnNewSale, 
      setOnClearCart, 
      setOnOpenCashierReport,
      setOnOpenStockReport,
      setHasItems 
    }}>
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) {
    return {
      onNewSale: null,
      onClearCart: null,
      onOpenCashierReport: null,
      onOpenStockReport: null,
      hasItems: false,
      setOnNewSale: () => {},
      setOnClearCart: () => {},
      setOnOpenCashierReport: () => {},
      setOnOpenStockReport: () => {},
      setHasItems: () => {},
    };
  }
  return context;
};
