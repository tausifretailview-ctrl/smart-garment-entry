import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export type DraftType = 'purchase' | 'quotation' | 'sale_order' | 'sale_invoice' | 'purchase_order' | 'salesman_sale_order' | 'purchase_return';

interface UseDraftSaveOptions {
  autoSaveInterval?: number; // in milliseconds, default 30000 (30 seconds)
  onDraftLoaded?: (data: any) => void;
}

export const useDraftSave = (draftType: DraftType, options: UseDraftSaveOptions = {}) => {
  const { autoSaveInterval = 15000, onDraftLoaded } = options; // 15 seconds for more frequent saves
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentDataRef = useRef<any>(null);
  const draftClearedRef = useRef(false); // Track when draft was intentionally cleared

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
      } else {
        setHasDraft(false);
        setDraftData(null);
      }
    } catch (error) {
      console.error('Error checking draft:', error);
    }
  }, [currentOrganization?.id, user?.id, draftType]);

  useEffect(() => {
    checkDraft();
  }, [checkDraft]);

  // Save draft
  const saveDraft = useCallback(async (data: any, showToast = false) => {
    if (!currentOrganization?.id || !user?.id) return false;
    
    // Don't save empty data
    if (!data || (Array.isArray(data.lineItems) && data.lineItems.length === 0)) {
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('drafts')
        .upsert({
          organization_id: currentOrganization.id,
          draft_type: draftType,
          created_by: user.id,
          draft_data: data,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,draft_type,created_by'
        });

      if (error) throw error;

      setHasDraft(true);
      setLastSaved(new Date());
      
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
  }, [currentOrganization?.id, user?.id, draftType]);

  // Load draft
  const loadDraft = useCallback(() => {
    if (draftData && onDraftLoaded) {
      onDraftLoaded(draftData);
    }
    return draftData;
  }, [draftData, onDraftLoaded]);

  // Delete draft
  const deleteDraft = useCallback(async () => {
    if (!currentOrganization?.id || !user?.id) return;

    try {
      const { error } = await supabase
        .from('drafts')
        .delete()
        .eq('organization_id', currentOrganization.id)
        .eq('draft_type', draftType)
        .eq('created_by', user.id);

      if (error) throw error;

      setHasDraft(false);
      setDraftData(null);
      setLastSaved(null);
      currentDataRef.current = null; // Clear current data
      draftClearedRef.current = true; // Mark as intentionally cleared
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }, [currentOrganization?.id, user?.id, draftType]);

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
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Don't save if draft was intentionally cleared
      if (currentDataRef.current && !draftClearedRef.current) {
        saveDraft(currentDataRef.current, false);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
