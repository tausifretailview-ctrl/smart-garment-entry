import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  loadActivityReadState,
  markAllCategoriesRead,
  markCategoryRead,
  saveActivityReadState,
  type ActivityCategory,
  type ActivityReadState,
} from "@/lib/activityCenterReadState";
import { useActivityNotifications } from "@/hooks/useActivityNotifications";

type ActivityCenterContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  panelMounted: boolean;
  requestPanelMount: () => void;
  readState: ActivityReadState;
  markAllRead: () => void;
  markCategoryRead: (category: ActivityCategory) => void;
  badgeCount: number;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

const ActivityCenterContext = createContext<ActivityCenterContextValue | null>(null);

export function ActivityCenterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const userId = user?.id ?? "anon";

  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [readState, setReadState] = useState<ActivityReadState>(() =>
    orgId ? loadActivityReadState(orgId, userId) : markAllCategoriesRead(""),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setReadState(loadActivityReadState(orgId, userId));
  }, [orgId, userId]);

  const persistReadState = useCallback(
    (next: ActivityReadState) => {
      setReadState(next);
      if (orgId) saveActivityReadState(orgId, userId, next);
    },
    [orgId, userId],
  );

  const requestPanelMount = useCallback(() => {
    setPanelMounted(true);
  }, []);

  const handleSetOpen = useCallback(
    (next: boolean) => {
      if (next) setPanelMounted(true);
      setOpen(next);
      if (!next && triggerRef.current) {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [],
  );

  const markAllRead = useCallback(() => {
    persistReadState(markAllCategoriesRead());
  }, [persistReadState]);

  const handleMarkCategoryRead = useCallback(
    (category: ActivityCategory) => {
      persistReadState(markCategoryRead(readState, category));
    },
    [persistReadState, readState],
  );

  const { badgeCount } = useActivityNotifications(readState, !!orgId);

  const value = useMemo(
    (): ActivityCenterContextValue => ({
      open,
      setOpen: handleSetOpen,
      panelMounted,
      requestPanelMount,
      readState,
      markAllRead,
      markCategoryRead: handleMarkCategoryRead,
      badgeCount,
      triggerRef,
    }),
    [
      open,
      handleSetOpen,
      panelMounted,
      requestPanelMount,
      readState,
      markAllRead,
      handleMarkCategoryRead,
      badgeCount,
    ],
  );

  return (
    <ActivityCenterContext.Provider value={value}>{children}</ActivityCenterContext.Provider>
  );
}

export function useActivityCenter() {
  const ctx = useContext(ActivityCenterContext);
  if (!ctx) {
    throw new Error("useActivityCenter must be used within ActivityCenterProvider");
  }
  return ctx;
}
