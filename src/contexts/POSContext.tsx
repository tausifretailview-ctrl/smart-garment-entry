import { createContext, useContext, useState, ReactNode } from "react";

interface POSContextType {
  onNewSale: (() => void) | null;
  onClearCart: (() => void) | null;
  hasItems: boolean;
  setOnNewSale: (fn: (() => void) | null) => void;
  setOnClearCart: (fn: (() => void) | null) => void;
  setHasItems: (has: boolean) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider = ({ children }: { children: ReactNode }) => {
  const [onNewSale, setOnNewSale] = useState<(() => void) | null>(null);
  const [onClearCart, setOnClearCart] = useState<(() => void) | null>(null);
  const [hasItems, setHasItems] = useState(false);

  return (
    <POSContext.Provider value={{ 
      onNewSale, 
      onClearCart, 
      hasItems, 
      setOnNewSale, 
      setOnClearCart, 
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
      hasItems: false,
      setOnNewSale: () => {},
      setOnClearCart: () => {},
      setHasItems: () => {},
    };
  }
  return context;
};
