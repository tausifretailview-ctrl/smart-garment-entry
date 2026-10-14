import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  countPurchaseDraftQty,
  PURCHASE_DRAFT_DISCARDED_EVENT,
  PURCHASE_DRAFT_SAVED_EVENT,
  type PurchaseDraftEventDetail,
} from '@/lib/purchaseEntryPersistence';

export type DraftType = 'purchase' | 'quotation' | 'sale_order' | 'sale_invoice' | 'purchase_order' | 'salesman_sale_order' | 'purchase_return';

const PURCHASE_DRAFT_BROWSER_ONLY_KEY = '_purchaseDraftInBrowser';
/** Supabase JSONB upserts can fail for multi-MB Excel imports — store a stub in DB, full bill in browser. */
const MAX_PURCHASE_DB_DRAFT_BYTES = 1_500_000;

function prepareDraftPayload(data: any, draftType: DraftType): any {
  if (!data) return data;
  const serialized = JSON.stringify(data);
  if (draftType !== 'purchase' || serialized.length <= MAX_PURCHASE_DB_DRAFT_BYTES) {
    return data;
  }

  const lines = Array.isArray(data.lineItems) ? data.lineItems : [];
  return {
    [PURCHASE_DRAFT_BROWSER_ONLY_KEY]: true,
    lineItems: [],
    lineCount: lines.length,
    totalQty: countPurchaseDraftQty(lines),
    billData: data.billData,
    softwareBillNo: data.softwareBillNo,
    billDate: data.billDate,
    roundOff: data.roundOff,
    otherCharges: data.otherCharges,
    discountAmount: data.discountAmount,
    entryMode: data.entryMode,
    isDcPurchase: data.isDcPurchase,
    isEditMode: data.isEditMode,
    editingBillId: data.editingBillId,
    originalLineItems: [],
    savedAt: Date.now(),
  };
}

/**
 * Draft types that keep a browser copy and live-sync the dashboard card. Opt-in: other entry
 * pages reload their form whenever draftData changes, so they must not get extra updates.
 */
const LIVE_DRAFT_TYPES = new Set<DraftType>(['sale_invoice']);

/** Every hook instance (entry page + dashboard card) hears saves/deletes of the same draft. */
const DRAFT_CHANGED_EVENT = 'ezzy:draft-changed';

type DraftChangedDetail = {
  orgId: string;
  userId: string;
  draftType: DraftType;
  data: any | null;
  savedAt: number | null;
};

function dispatchDraftChanged(detail: DraftChangedDetail) {
  if (!LIVE_DRAFT_TYPES.has(detail.draftType)) return;
  try {
    window.dispatchEvent(new CustomEvent<DraftChangedDetail>(DRAFT_CHANGED_EVENT, { detail }));
  } catch {
    /* non-browser */
  }
}

/**
 * Browser copy of the draft, written synchronously. The database upsert in beforeunload or
 * a stalled network often never lands, so a reload would otherwise lose the bill.
 * Only LIVE_DRAFT_TYPES; purchase keeps its own browser copy (purchaseEntryPersistence).
 */
function localBackupKey(orgId: string, userId: string, draftType: DraftType) {
  return `ezzy-draft-backup:${orgId}:${userId}:${draftType}`;
}

function writeLocalBackup(orgId: string, userId: string, draftType: DraftType, data: any) {
  if (!LIVE_DRAFT_TYPES.has(draftType)) return;
  try {
    localStorage.setItem(
      localBackupKey(orgId, userId, draftType),
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    /* storage full or blocked */
  }
}

function readLocalBackup(orgId: string, userId: string, draftType: DraftType): any | null {
  if (!LIVE_DRAFT_TYPES.has(draftType)) return null;
  try {
    const raw = localStorage.getItem(localBackupKey(orgId, userId, draftType));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function clearLocalBackup(orgId: string, userId: string, draftType: DraftType) {
  if (!LIVE_DRAFT_TYPES.has(draftType)) return;
  try {
    localStorage.removeItem(localBackupKey(orgId, userId, draftType));
  } catch {
    /* blocked */
  }
}

interface UseDraftSaveOptions {
  autoSaveInterval?: number; // in milliseconds, default 30000 (30 seconds)
  onDraftLoaded?: (data: any) => void;
}

export const useDraftSave = (draftType: DraftType, options: UseDraftSaveOptions = {}) => {
  const { autoSaveInterval = 30000, onDraftLoaded } = options; // 30 seconds default — reduces network overhead for large bills
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDataRef = useRef<any>(null);
  const draftClearedRef = useRef(false); // Track when draft was intentionally cleared
  // Draft writes run one at a time, so an autosave still in flight can't re-create a draft
  // that a later delete (bill saved) already removed.
  const opChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const run = opChainRef.current.then(op, op);
    opChainRef.current = run.catch(() => undefined);
    return run;
  }, []);

  // Check if draft exists on mount
  const checkDraft = useCallback(async () => {
    if (!currentOrganization?.id || !user?.id) return;

    try {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('draft_type', draftType)
        .eq('created_by', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasDraft(true);
        setDraftData(data.draft_data);
        if (LIVE_DRAFT_TYPES.has(draftType) && data.updated_at) setLastSaved(new Date(data.updated_at));
        return;
      }

      // Database copy never landed (page closed / network dropped): put the browser copy back.
      const backup = readLocalBackup(currentOrganization.id, user.id, draftType);
      if (backup) {
        setHasDraft(true);
        setDraftData(backup);
        const orgId = currentOrganization.id;
        const userId = user.id;
        void enqueue(async () => {
          const { error: upsertError } = await supabase.from('drafts').upsert({
            organization_id: orgId,
            draft_type: draftType,
            created_by: userId,
            draft_data: backup,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,draft_type,created_by' });
          if (upsertError) console.error('Error restoring draft backup:', upsertError);
        });
      } else {
        setHasDraft(false);
        setDraftData(null);
      }
    } catch (error) {
      console.error('Error checking draft:', error);
    }
  }, [currentOrganization?.id, user?.id, draftType, enqueue]);

  useEffect(() => {
    checkDraft();
  }, [checkDraft]);

  // Pages stay mounted as tabs, so a mount-time check goes stale: re-check when the window
  // comes back, and mirror saves/deletes made by the other instance (entry page ↔ dashboard).
  useEffect(() => {
    if (!LIVE_DRAFT_TYPES.has(draftType)) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkDraft();
    };
    const onDraftChanged = (event: Event) => {
      const detail = (event as CustomEvent<DraftChangedDetail>).detail;
      if (
        !detail ||
        detail.draftType !== draftType ||
        detail.orgId !== currentOrganization?.id ||
        detail.userId !== user?.id
      ) return;
      setHasDraft(detail.data != null);
      setDraftData(detail.data);
      setLastSaved(detail.savedAt ? new Date(detail.savedAt) : null);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(DRAFT_CHANGED_EVENT, onDraftChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(DRAFT_CHANGED_EVENT, onDraftChanged);
    };
  }, [checkDraft, currentOrganization?.id, user?.id, draftType]);

  // Purchase Entry may save/delete draft in another tab — keep dashboard banner in sync.
  useEffect(() => {
    if (draftType !== 'purchase') return;

    const onPurchaseDraftCleared = (event: Event) => {
      const detail = (event as CustomEvent<PurchaseDraftEventDetail>).detail;
      if (!detail || detail.orgId !== currentOrganization?.id || detail.userId !== user?.id) return;
      setHasDraft(false);
      setDraftData(null);
      setLastSaved(null);
      currentDataRef.current = null;
      draftClearedRef.current = true;
    };

    window.addEventListener(PURCHASE_DRAFT_SAVED_EVENT, onPurchaseDraftCleared);
    window.addEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, onPurchaseDraftCleared);
    return () => {
      window.removeEventListener(PURCHASE_DRAFT_SAVED_EVENT, onPurchaseDraftCleared);
      window.removeEventListener(PURCHASE_DRAFT_DISCARDED_EVENT, onPurchaseDraftCleared);
    };
  }, [currentOrganization?.id, user?.id, draftType]);

  // Save draft
  const saveDraft = useCallback(async (data: any, showToast = false) => {
    if (!currentOrganization?.id || !user?.id) return false;
    
    // Don't save empty data
    if (!data || (Array.isArray(data.lineItems) && data.lineItems.length === 0)) {
      return false;
    }

    const orgId = currentOrganization.id;
    const userId = user.id;
    writeLocalBackup(orgId, userId, draftType, data);

    setIsSaving(true);
    try {
      const draftPayload = prepareDraftPayload(data, draftType);
      const { error } = await enqueue(async () => supabase
        .from('drafts')
        .upsert({
          organization_id: orgId,
          draft_type: draftType,
          created_by: userId,
          draft_data: draftPayload,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,draft_type,created_by'
        }));

      if (error) throw error;

      const savedAt = Date.now();
      setHasDraft(true);
      setDraftData(draftPayload);
      setLastSaved(new Date(savedAt));
      dispatchDraftChanged({ orgId, userId, draftType, data: draftPayload, savedAt });
      
      if (showToast) {
        toast({
          title: "Draft Saved",
          description: "Your work has been saved. You can resume later.",
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error saving draft:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentOrganization?.id, user?.id, draftType, enqueue]);

  // Load draft
  const loadDraft = useCallback(() => {
    if (draftData && onDraftLoaded) {
      onDraftLoaded(draftData);
    }
    return draftData;
  }, [draftData, onDraftLoaded]);

  // Delete draft
  const deleteDraft = useCallback(async (): Promise<boolean> => {
    if (!currentOrganization?.id || !user?.id) return false;
    const orgId = currentOrganization.id;
    const userId = user.id;

    // Mark cleared before the network call: if it is done after, a bill the user starts
    // meanwhile gets its pending data wiped and never autosaves.
    currentDataRef.current = null;
    draftClearedRef.current = true;
    clearLocalBackup(orgId, userId, draftType);

    try {
      const { error } = await enqueue(async () => supabase
        .from('drafts')
        .delete()
        .eq('organization_id', orgId)
        .eq('draft_type', draftType)
        .eq('created_by', userId));

      if (error) throw error;

      setHasDraft(false);
      setDraftData(null);
      setLastSaved(null);
      dispatchDraftChanged({ orgId, userId, draftType, data: null, savedAt: null });
      return true;
    } catch (error) {
      console.error('Error deleting draft:', error);
      return false;
    }
  }, [currentOrganization?.id, user?.id, draftType, enqueue]);

  // Update current data reference for auto-save
  const updateCurrentData = useCallback((data: any) => {
    currentDataRef.current = data;
    // Reset cleared flag when user starts adding new data (allows auto-save for new entries)
    if (data && draftClearedRef.current) {
      draftClearedRef.current = false;
    }
  }, []);

  // Start auto-save timer
  const startAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setInterval(() => {
      if (currentDataRef.current) {
        saveDraft(currentDataRef.current, false);
      }
    }, autoSaveInterval);
  }, [autoSaveInterval, saveDraft]);

  // Stop auto-save timer
  const stopAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount - SAVE draft before stopping auto-save (only if not intentionally cleared)
  useEffect(() => {
    return () => {
      // Don't save if draft was intentionally cleared (e.g., after successful save)
      if (currentDataRef.current && !draftClearedRef.current) {
        saveDraft(currentDataRef.current, false);
      }
      stopAutoSave();
    };
  }, [stopAutoSave, saveDraft]);

  // Handle beforeunload to save draft (only if not intentionally cleared)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Don't save if draft was intentionally cleared
      if (currentDataRef.current && !draftClearedRef.current) {
        // saveDraft writes the browser copy synchronously; its network upsert may not land.
        void saveDraft(currentDataRef.current, false);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [saveDraft]);

  return {
    hasDraft,
    draftData,
    isSaving,
    lastSaved,
    saveDraft,
    loadDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
    checkDraft,
  };
};
