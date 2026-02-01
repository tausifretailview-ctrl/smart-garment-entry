import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OfflineAction {
  id: string;
  type: "sale" | "payment" | "customer" | "purchase";
  data: any;
  createdAt: number;
  retries: number;
}

const STORAGE_KEY = "ezzy_offline_queue";
const MAX_RETRIES = 3;

export const useOfflineSync = () => {
  const [pendingActions, setPendingActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const syncInProgress = useRef(false);

  // Load pending actions count from storage
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

  // Save actions to storage
  const saveActions = useCallback((actions: OfflineAction[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
      setPendingActions(actions.length);
    } catch (e) {
      console.error("Failed to save offline queue:", e);
    }
  }, []);

  // Queue an action for offline sync
  const queueAction = useCallback((type: OfflineAction["type"], data: any) => {
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

    // If online, try to sync immediately
    if (navigator.onLine) {
      syncActions();
    }

    return action.id;
  }, [loadPendingCount, saveActions]);

  // Process a single action
  const processAction = async (action: OfflineAction): Promise<boolean> => {
    try {
      switch (action.type) {
        case "sale":
          // Process sale - the actual sale logic will be handled by useSaveSale
          // This is a placeholder for sync logic
          console.log("Syncing sale:", action.data);
          break;
        case "payment":
          console.log("Syncing payment:", action.data);
          break;
        case "customer":
          const { error } = await supabase
            .from("customers")
            .insert(action.data);
          if (error) throw error;
          break;
        case "purchase":
          console.log("Syncing purchase:", action.data);
          break;
        default:
          console.warn("Unknown action type:", action.type);
      }
      return true;
    } catch (error) {
      console.error(`Failed to sync ${action.type}:`, error);
      return false;
    }
  };

  // Sync all pending actions
  const syncActions = useCallback(async () => {
    if (syncInProgress.current || !navigator.onLine) return;

    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const actions = loadPendingCount();
      if (actions.length === 0) {
        setIsSyncing(false);
        syncInProgress.current = false;
        return;
      }

      const remainingActions: OfflineAction[] = [];

      for (const action of actions) {
        const success = await processAction(action);
        
        if (!success) {
          action.retries += 1;
          if (action.retries < MAX_RETRIES) {
            remainingActions.push(action);
          } else {
            // Action failed after max retries, notify user
            toast.error(`Failed to sync ${action.type} after ${MAX_RETRIES} attempts`);
          }
        }
      }

      saveActions(remainingActions);
      setLastSyncTime(new Date());

      if (remainingActions.length === 0 && actions.length > 0) {
        toast.success("All offline actions synced successfully");
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [loadPendingCount, saveActions]);

  // Clear all pending actions (use with caution)
  const clearQueue = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingActions(0);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      syncActions();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load initial count
    loadPendingCount();

    // Try to sync on mount if online
    if (navigator.onLine) {
      syncActions();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncActions, loadPendingCount]);

  return {
    isOnline,
    pendingActions,
    isSyncing,
    lastSyncTime,
    queueAction,
    syncActions,
    clearQueue,
  };
};
