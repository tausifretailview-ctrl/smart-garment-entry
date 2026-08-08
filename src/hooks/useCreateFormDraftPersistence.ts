import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  readDashboardFilters,
  writeDashboardFilters,
  markDashboardFilterRestoring,
} from "@/lib/dashboardFilterPersistence";

const DRAFT_OPEN_KEY = "createFormOpen";
const DRAFT_FORM_KEY = "createFormData";

type DraftSnapshot<T> = {
  [DRAFT_OPEN_KEY]?: boolean;
  [DRAFT_FORM_KEY]?: T;
};

/**
 * Persists create-dialog open state + form fields in localStorage (per org + user)
 * so master screens and Platform Admin survive ERP window tab / browser tab switches.
 */
export function useCreateFormDraftPersistence<T extends Record<string, unknown>>(
  storageId: string,
  orgId: string | undefined,
  isDialogOpen: boolean,
  formData: T,
  setIsDialogOpen: Dispatch<SetStateAction<boolean>> | ((open: boolean) => void),
  setFormData: Dispatch<SetStateAction<T>> | ((data: T) => void),
  options?: { enabled?: boolean },
): void {
  const { enabled = true } = options ?? {};
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const restoredRef = useRef(false);
  const skipPersistRef = useRef(true);

  useEffect(() => {
    if (!enabled || !storageId || restoredRef.current) return;
    if (orgId === undefined && storageId !== "platform-admin:create-user") return;
    if (!userId) return;
    restoredRef.current = true;

    const scopeId = orgId ?? "platform";
    const saved = readDashboardFilters(scopeId, storageId, userId) as DraftSnapshot<T> | null;
    if (!saved) return;

    markDashboardFilterRestoring();
    if (typeof saved[DRAFT_OPEN_KEY] === "boolean") {
      (setIsDialogOpen as (open: boolean) => void)(saved[DRAFT_OPEN_KEY]!);
    }
    if (saved[DRAFT_FORM_KEY] && typeof saved[DRAFT_FORM_KEY] === "object") {
      (setFormData as (data: T) => void)(saved[DRAFT_FORM_KEY] as T);
    }
  }, [enabled, orgId, userId, storageId, setIsDialogOpen, setFormData]);

  useEffect(() => {
    if (!enabled || !storageId || !userId) return;
    if (orgId === undefined && storageId !== "platform-admin:create-user") return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const scopeId = orgId ?? "platform";
    const timer = window.setTimeout(() => {
      if (!isDialogOpen) {
        writeDashboardFilters(scopeId, storageId, {}, userId);
        return;
      }
      writeDashboardFilters(
        scopeId,
        storageId,
        {
          [DRAFT_OPEN_KEY]: isDialogOpen,
          [DRAFT_FORM_KEY]: formData,
        },
        userId,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [enabled, orgId, userId, storageId, isDialogOpen, formData]);
}
