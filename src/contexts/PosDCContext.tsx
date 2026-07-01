import React, { createContext, useContext, useState, useMemo } from "react";

type PosDCContextType = {
  onNewChallan: (() => void) | null;
  onClearCart: (() => void) | null;
  onOpenCashierReport: (() => void) | null;
  onOpenStockReport: (() => void) | null;
  onOpenSaleReturn: (() => void) | null;
  onReprintLast: (() => void) | null;
  hasItems: boolean;
  canReprint: boolean;
  isSaving: boolean;
  setOnNewChallan: (fn: (() => void) | null) => void;
  setOnClearCart: (fn: (() => void) | null) => void;
  setOnOpenCashierReport: (fn: (() => void) | null) => void;
  setOnOpenStockReport: (fn: (() => void) | null) => void;
  setOnOpenSaleReturn: (fn: (() => void) | null) => void;
  setOnReprintLast: (fn: (() => void) | null) => void;
  setHasItems: (value: boolean) => void;
  setCanReprint: (value: boolean) => void;
  setIsSaving: (value: boolean) => void;
};

const PosDCContext = createContext<PosDCContextType | undefined>(undefined);

export function PosDCProvider({ children }: { children: React.ReactNode }) {
  const [onNewChallan, setOnNewChallan] = useState<(() => void) | null>(null);
  const [onClearCart, setOnClearCart] = useState<(() => void) | null>(null);
  const [onOpenCashierReport, setOnOpenCashierReport] = useState<(() => void) | null>(null);
  const [onOpenStockReport, setOnOpenStockReport] = useState<(() => void) | null>(null);
  const [onOpenSaleReturn, setOnOpenSaleReturn] = useState<(() => void) | null>(null);
  const [onReprintLast, setOnReprintLast] = useState<(() => void) | null>(null);
  const [hasItems, setHasItems] = useState(false);
  const [canReprint, setCanReprint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const value = useMemo(
    () => ({
      onNewChallan,
      onClearCart,
      onOpenCashierReport,
      onOpenStockReport,
      onOpenSaleReturn,
      onReprintLast,
      hasItems,
      canReprint,
      isSaving,
      setOnNewChallan,
      setOnClearCart,
      setOnOpenCashierReport,
      setOnOpenStockReport,
      setOnOpenSaleReturn,
      setOnReprintLast,
      setHasItems,
      setCanReprint,
      setIsSaving,
    }),
    [onNewChallan, onClearCart, onOpenCashierReport, onOpenStockReport, onOpenSaleReturn, onReprintLast, hasItems, canReprint, isSaving],
  );

  return <PosDCContext.Provider value={value}>{children}</PosDCContext.Provider>;
}

export function usePosDC() {
  const ctx = useContext(PosDCContext);
  if (!ctx) {
    return {
      onNewChallan: null,
      onClearCart: null,
      onOpenCashierReport: null,
      onOpenStockReport: null,
      onOpenSaleReturn: null,
      onReprintLast: null,
      hasItems: false,
      canReprint: false,
      isSaving: false,
      setOnNewChallan: () => {},
      setOnClearCart: () => {},
      setOnOpenCashierReport: () => {},
      setOnOpenStockReport: () => {},
      setOnOpenSaleReturn: () => {},
      setOnReprintLast: () => {},
      setHasItems: () => {},
      setCanReprint: () => {},
      setIsSaving: () => {},
    } satisfies PosDCContextType;
  }
  return ctx;
}
