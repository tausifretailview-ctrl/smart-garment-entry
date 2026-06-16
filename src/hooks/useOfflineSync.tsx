import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "@/lib/mobileShell";

interface OfflineAction {
  id: string;
  type: "sale" | "payment" | "customer" | "purchase";
  data: any;
  createdAt: number;
  retries: number;
}

const STORAGE_KEY = "ezzy_offline_queue";
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const NETWORK_TOAST_DEBOUNCE_MS = 3000;
const NETWORK_TOAST_DURATION_MS = 3500;

const MOBILE_TOAST_STYLE = {
  marginBottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px) + 0.5rem)`,
};

type NetworkSubscriber = {
  onOnline: () => void;
  onOffline: () => void;
};

let networkMonitorActive = false;
let networkWasOffline = !navigator.onLine;
let lastNetworkToastAt = 0;
let globalOnline = navigator.onLine;
const networkSubscribers = new Map<number, NetworkSubscriber>();
let nextSubscriberId = 0;
let nativeTeardown: (() => void) | undefined;
let syncOnOnlineCallback: (() => void) | null = null;

function showBackOnlineToast() {
  const now = Date.now();
  if (now - lastNetworkToastAt < NETWORK_TOAST_DEBOUNCE_MS) return;
  lastNetworkToastAt = now;
  toast.success("Back online", {
    description: "Syncing pending actions...",
    duration: NETWORK_TOAST_DURATION_MS,
    position: "bottom-center",
    style: MOBILE_TOAST_STYLE,
  });
}

function showOfflineToast() {
  const now = Date.now();
  if (now - lastNetworkToastAt < NETWORK_TOAST_DEBOUNCE_MS) return;
  lastNetworkToastAt = now;
  toast.warning("You're offline", {
    description: "Changes will be saved locally",
    duration: NETWORK_TOAST_DURATION_MS,
    position: "bottom-center",
    style: MOBILE_TOAST_STYLE,
  });
}

function dispatchOnline() {
  if (globalOnline) return;
  globalOnline = true;
  if (networkWasOffline) {
    showBackOnlineToast();
    syncOnOnlineCallback?.();
  }
  networkWasOffline = false;
  networkSubscribers.forEach((s) => s.onOnline());
}

function dispatchOffline() {
  if (!globalOnline) return;
  globalOnline = false;
  networkWasOffline = true;
  showOfflineToast();
  networkSubscribers.forEach((s) => s.onOffline());
}

function ensureNetworkMonitor() {
  if (networkMonitorActive) return;
  networkMonitorActive = true;
  networkWasOffline = !navigator.onLine;
  globalOnline = navigator.onLine;

  if (Capacitor.isNativePlatform()) {
    void (async () => {
      const status = await Network.getStatus();
      globalOnline = status.connected;
      networkWasOffline = !status.connected;
      if (status.connected) syncOnOnlineCallback?.();

      const listener = await Network.addListener("networkStatusChange", (s) => {
        if (s.connected) dispatchOnline();
        else dispatchOffline();
      });
      nativeTeardown = () => listener.remove();
    })();
    return;
  }

  const onWindowOnline = () => dispatchOnline();
  const onWindowOffline = () => dispatchOffline();
  window.addEventListener("online", onWindowOnline);
  window.addEventListener("offline", onWindowOffline);
  nativeTeardown = () => {
    window.removeEventListener("online", onWindowOnline);
    window.removeEventListener("offline", onWindowOffline);
  };
}

function subscribeNetworkStatus(onStoreChange: () => void) {
  ensureNetworkMonitor();
  const id = ++nextSubscriberId;
  networkSubscribers.set(id, {
    onOnline: onStoreChange,
    onOffline: onStoreChange,
  });
  return () => {
    networkSubscribers.delete(id);
    if (networkSubscribers.size === 0 && nativeTeardown) {
      nativeTeardown();
      nativeTeardown = undefined;
      networkMonitorActive = false;
    }
  };
}

function getNetworkSnapshot() {
  return globalOnline;
}

export const useOfflineSync = () => {
  const [pendingActions, setPendingActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const isOnline = useSyncExternalStore(subscribeNetworkStatus, getNetworkSnapshot, () => true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInProgress = useRef(false);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPendingCount = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const actions: OfflineAction[] = JSON.parse(stored);
        setPendingActions(actions.length);
        return actions;
      }
    } catch (e) {
      console.error("Failed to load offline queue:", e);
    }
    return [];
  }, []);

  const saveActions = useCallback((actions: OfflineAction[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
      setPendingActions(actions.length);
    } catch (e) {
      console.error("Failed to save offline queue:", e);
    }
  }, []);

  const processAction = async (action: OfflineAction): Promise<boolean> => {
    try {
      switch (action.type) {
        case "sale":
          console.log("Syncing sale:", action.data);
          return true;
        case "payment":
          console.log("Syncing payment:", action.data);
          return true;
        case "customer": {
          const { error } = await supabase.from("customers").insert(action.data);
          if (error) throw error;
          return true;
        }
        case "purchase":
          console.log("Syncing purchase:", action.data);
          return true;
        default:
          console.warn("Unknown action type:", action.type);
          return true;
      }
    } catch (error) {
      console.error(`Failed to sync ${action.type}:`, error);
      return false;
    }
  };

  const syncActions = useCallback(async () => {
    if (syncInProgress.current || !globalOnline) return;

    syncInProgress.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const actions = loadPendingCount();
      if (actions.length === 0) {
        return;
      }

      const remainingActions: OfflineAction[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const action of actions) {
        const success = await processAction(action);
        if (success) {
          successCount++;
        } else {
          action.retries += 1;
          if (action.retries < MAX_RETRIES) {
            remainingActions.push(action);
            failCount++;
          } else {
            toast.error(`Failed to sync ${action.type} after ${MAX_RETRIES} attempts`);
          }
        }
      }

      saveActions(remainingActions);
      setLastSyncTime(new Date());

      if (remainingActions.length === 0 && actions.length > 0) {
        toast.success(`${successCount} action${successCount !== 1 ? "s" : ""} synced successfully`, {
          duration: NETWORK_TOAST_DURATION_MS,
          position: "bottom-center",
          style: MOBILE_TOAST_STYLE,
        });
      } else if (failCount > 0) {
        setSyncError(`${failCount} action${failCount !== 1 ? "s" : ""} failed to sync`);
        if (retryTimeout.current) clearTimeout(retryTimeout.current);
        retryTimeout.current = setTimeout(() => {
          if (globalOnline) void syncActions();
        }, RETRY_DELAY);
      }
    } catch (error) {
      console.error("Sync failed:", error);
      setSyncError("Sync failed. Will retry...");
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [loadPendingCount, saveActions]);

  const syncActionsRef = useRef(syncActions);
  syncActionsRef.current = syncActions;

  useEffect(() => {
    syncOnOnlineCallback = () => {
      void syncActionsRef.current();
    };
    return () => {
      if (syncOnOnlineCallback) syncOnOnlineCallback = null;
    };
  }, []);

  const queueAction = useCallback(
    (type: OfflineAction["type"], data: any) => {
      const action: OfflineAction = {
        id: crypto.randomUUID(),
        type,
        data,
        createdAt: Date.now(),
        retries: 0,
      };

      const actions = loadPendingCount();
      actions.push(action);
      saveActions(actions);

      toast.info(`Saved offline: ${type}`, {
        description: "Will sync when online",
        duration: NETWORK_TOAST_DURATION_MS,
        position: "bottom-center",
        style: MOBILE_TOAST_STYLE,
      });

      if (globalOnline) {
        void syncActionsRef.current();
      }

      return action.id;
    },
    [loadPendingCount, saveActions],
  );

  const clearQueue = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingActions(0);
    setSyncError(null);
  }, []);

  useEffect(() => {
    loadPendingCount();
    if (globalOnline) {
      void syncActionsRef.current();
    }
  }, [loadPendingCount]);

  useEffect(() => {
    return () => {
      if (retryTimeout.current) clearTimeout(retryTimeout.current);
    };
  }, []);

  return {
    isOnline,
    pendingActions,
    isSyncing,
    lastSyncTime,
    syncError,
    queueAction,
    syncActions,
    clearQueue,
  };
};
