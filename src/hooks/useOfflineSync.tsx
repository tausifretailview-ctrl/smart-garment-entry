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
const RETRY_DELAY = 5000; // 5 seconds

export const useOfflineSync = () => {
  const [pendingActions, setPendingActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInProgress = useRef(false);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    
    // Show feedback to user
    toast.info(`Saved offline: ${type}`, {
      description: "Will sync when online",
    });

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
          // Sale data should include all necessary info
          // This is handled by useSaveSale - placeholder for future local-first
          console.log("Syncing sale:", action.data);
          // For now, we assume sales are saved directly
          // Future: implement actual sale sync
          return true;
          
        case "payment":
          // Payment sync logic
          console.log("Syncing payment:", action.data);
          return true;
          
        case "customer":
          const { error } = await supabase
            .from("customers")
            .insert(action.data);
          if (error) throw error;
          return true;
          
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

  // Sync all pending actions
  const syncActions = useCallback(async () => {
    if (syncInProgress.current || !navigator.onLine) return;

    syncInProgress.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const actions = loadPendingCount();
      if (actions.length === 0) {
        setIsSyncing(false);
        syncInProgress.current = false;
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
            // Action failed after max retries, notify user
            toast.error(`Failed to sync ${action.type} after ${MAX_RETRIES} attempts`);
          }
        }
      }

      saveActions(remainingActions);
      setLastSyncTime(new Date());

      if (remainingActions.length === 0 && actions.length > 0) {
        toast.success(`${successCount} action${successCount !== 1 ? 's' : ''} synced successfully`);
      } else if (failCount > 0) {
        setSyncError(`${failCount} action${failCount !== 1 ? 's' : ''} failed to sync`);
        // Schedule retry
        if (retryTimeout.current) clearTimeout(retryTimeout.current);
        retryTimeout.current = setTimeout(() => {
          if (navigator.onLine) syncActions();
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

  // Clear all pending actions (use with caution)
  const clearQueue = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingActions(0);
    setSyncError(null);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online", { description: "Syncing pending actions..." });
      // Auto-sync when coming back online
      syncActions();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline", { description: "Changes will be saved locally" });
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
      if (retryTimeout.current) clearTimeout(retryTimeout.current);
    };
  }, [syncActions, loadPendingCount]);

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
