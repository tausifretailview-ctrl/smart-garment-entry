import { useEffect, useRef } from "react";
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
 * Persists create-dialog open state + form fields in sessionStorage so master
 * screens and Platform Admin survive ERP window tab / browser tab switches.
 */
export function useCreateFormDraftPersistence<T extends Record<string, unknown>>(
  storageId: string,
  orgId: string | undefined,
  isDialogOpen: boolean,
  formData: T,
  setIsDialogOpen: (open: boolean) => void,
  setFormData: (data: T) => void,
  options?: { enabled?: boolean },
): void {
  const { enabled = true } = options ?? {};
  const restoredRef = useRef(false);
  const skipPersistRef = useRef(true);

  useEffect(() => {
    if (!enabled || !storageId || restoredRef.current) return;
    if (orgId === undefined && storageId !== "platform-admin:create-user") return;
    restoredRef.current = true;

    const scopeId = orgId ?? "platform";
    const saved = readDashboardFilters(scopeId, storageId) as DraftSnapshot<T> | null;
    if (!saved) return;

    markDashboardFilterRestoring();
    if (typeof saved[DRAFT_OPEN_KEY] === "boolean") {
      setIsDialogOpen(saved[DRAFT_OPEN_KEY]!);
    }
    if (saved[DRAFT_FORM_KEY] && typeof saved[DRAFT_FORM_KEY] === "object") {
      setFormData(saved[DRAFT_FORM_KEY] as T);
    }
  }, [enabled, orgId, storageId, setIsDialogOpen, setFormData]);

  useEffect(() => {
    if (!enabled || !storageId) return;
    if (orgId === undefined && storageId !== "platform-admin:create-user") return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const scopeId = orgId ?? "platform";
    const timer = window.setTimeout(() => {
      if (!isDialogOpen) {
        writeDashboardFilters(scopeId, storageId, {});
        return;
      }
      writeDashboardFilters(scopeId, storageId, {
        [DRAFT_OPEN_KEY]: isDialogOpen,
        [DRAFT_FORM_KEY]: formData,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [enabled, orgId, storageId, isDialogOpen, formData]);
}
