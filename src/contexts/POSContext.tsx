import { createContext, useContext, useState, ReactNode } from "react";

interface POSContextType {
  onNewSale: (() => void) | null;
  onClearCart: (() => void) | null;
  onOpenCashierReport: (() => void) | null;
  onOpenStockReport: (() => void) | null;
  onOpenSaleReturn: (() => void) | null;
  onSaveChanges: (() => void) | null;
  hasItems: boolean;
  isEditing: boolean;
  isSavingChanges: boolean;
  setOnNewSale: (fn: (() => void) | null) => void;
  setOnClearCart: (fn: (() => void) | null) => void;
  setOnOpenCashierReport: (fn: (() => void) | null) => void;
  setOnOpenStockReport: (fn: (() => void) | null) => void;
  setOnOpenSaleReturn: (fn: (() => void) | null) => void;
  setOnSaveChanges: (fn: (() => void) | null) => void;
  setHasItems: (has: boolean) => void;
  setIsEditing: (editing: boolean) => void;
  setIsSavingChanges: (saving: boolean) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider = ({ children }: { children: ReactNode }) => {
  const [onNewSale, setOnNewSale] = useState<(() => void) | null>(null);
  const [onClearCart, setOnClearCart] = useState<(() => void) | null>(null);
  const [onOpenCashierReport, setOnOpenCashierReport] = useState<(() => void) | null>(null);
  const [onOpenStockReport, setOnOpenStockReport] = useState<(() => void) | null>(null);
  const [onOpenSaleReturn, setOnOpenSaleReturn] = useState<(() => void) | null>(null);
  const [onSaveChanges, setOnSaveChanges] = useState<(() => void) | null>(null);
  const [hasItems, setHasItems] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  return (
    <POSContext.Provider value={{ 
      onNewSale, 
      onClearCart, 
      onOpenCashierReport,
      onOpenStockReport,
      onOpenSaleReturn,
      onSaveChanges,
      hasItems, 
      isEditing,
      isSavingChanges,
      setOnNewSale, 
      setOnClearCart, 
      setOnOpenCashierReport,
      setOnOpenStockReport,
      setOnOpenSaleReturn,
      setOnSaveChanges,
      setHasItems,
      setIsEditing,
      setIsSavingChanges,
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
      onOpenSaleReturn: null,
      onSaveChanges: null,
      hasItems: false,
      isEditing: false,
      isSavingChanges: false,
      setOnNewSale: () => {},
      setOnClearCart: () => {},
      setOnOpenCashierReport: () => {},
      setOnOpenStockReport: () => {},
      setOnOpenSaleReturn: () => {},
      setOnSaveChanges: () => {},
      setHasItems: () => {},
      setIsEditing: () => {},
      setIsSavingChanges: () => {},
    };
  }
  return context;
};
