import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DashboardToolbarContextValue = {
  toolbar: ReactNode | null;
  setToolbar: (node: ReactNode | null) => void;
};

const DashboardToolbarContext = createContext<DashboardToolbarContextValue | null>(null);

export function DashboardToolbarProvider({ children }: { children: ReactNode }) {
  const [toolbar, setToolbarState] = useState<ReactNode | null>(null);
  const setToolbar = useCallback((node: ReactNode | null) => {
    setToolbarState(node);
  }, []);

  const value = useMemo(
    () => ({ toolbar, setToolbar }),
    [toolbar, setToolbar]
  );

  return (
    <DashboardToolbarContext.Provider value={value}>
      {children}
    </DashboardToolbarContext.Provider>
  );
}

export function useDashboardToolbar() {
  const ctx = useContext(DashboardToolbarContext);
  if (!ctx) {
    throw new Error("useDashboardToolbar must be used within DashboardToolbarProvider");
  }
  return ctx;
}

/** For optional injection (e.g. window tabs) when provider may be absent. */
export function useDashboardToolbarOptional() {
  return useContext(DashboardToolbarContext);
}
