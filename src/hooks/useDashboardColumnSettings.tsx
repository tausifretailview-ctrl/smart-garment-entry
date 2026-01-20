import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

type DashboardType = 
  | "pos_dashboard"
  | "sales_invoice_dashboard"
  | "purchase_bill_dashboard"
  | "payments_dashboard"
  | "product_dashboard";

export function useDashboardColumnSettings(
  dashboardType: DashboardType,
  defaultSettings: Record<string, boolean>
) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  
  // Use refs to prevent unnecessary re-renders and stable callbacks
  const defaultsRef = useRef(defaultSettings);
  const columnSettingsRef = useRef<Record<string, boolean>>(defaultSettings);
  const orgIdRef = useRef(currentOrganization?.id);
  
  const [columnSettings, setColumnSettings] = useState<Record<string, boolean>>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Keep orgId ref updated
  useEffect(() => {
    orgIdRef.current = currentOrganization?.id;
  }, [currentOrganization?.id]);

  // Keep settings ref in sync
  useEffect(() => {
    columnSettingsRef.current = columnSettings;
  }, [columnSettings]);

  // Fetch settings from database
  const { data: settings, isLoading } = useQuery({
    queryKey: ["dashboard-settings", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("settings")
        .select("dashboard_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      return data?.dashboard_settings as Record<string, Record<string, boolean>> | null;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000, // Keep data fresh for 30 seconds to prevent unnecessary refetches
  });

  // Load settings when data is fetched - use ref to avoid dependency on defaultSettings
  useEffect(() => {
    if (!isLoading && settings !== undefined) {
      const savedSettings = settings?.[dashboardType];
      if (savedSettings) {
        // Merge with defaults to handle new columns
        const merged = { ...defaultsRef.current, ...savedSettings };
        setColumnSettings(merged);
        columnSettingsRef.current = merged;
      } else {
        setColumnSettings(defaultsRef.current);
        columnSettingsRef.current = defaultsRef.current;
      }
      setIsLoaded(true);
    }
  }, [settings, isLoading, dashboardType]);

  // Stable save function using ref - doesn't invalidate immediately to prevent flicker
  const saveSettings = useCallback(async (newSettings: Record<string, boolean>) => {
    const orgId = orgIdRef.current;
    if (!orgId) return;

    try {
      // Get current dashboard_settings
      const { data: current } = await supabase
        .from("settings")
        .select("dashboard_settings")
        .eq("organization_id", orgId)
        .maybeSingle();

      const currentDashboardSettings = (current?.dashboard_settings as Record<string, Record<string, boolean>>) || {};
      
      // Update with new settings for this dashboard
      const updatedSettings = {
        ...currentDashboardSettings,
        [dashboardType]: newSettings,
      };

      await supabase
        .from("settings")
        .update({ dashboard_settings: updatedSettings })
        .eq("organization_id", orgId);

      // Don't invalidate immediately - the local state is already updated
      // Only invalidate after a delay to allow UI to stabilize
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-settings", orgId] });
      }, 1000);
    } catch (error) {
      console.error("Failed to save dashboard settings:", error);
    }
  }, [dashboardType, queryClient]);

  // Stable update function that doesn't change reference
  const updateColumnSetting = useCallback(
    (key: string, value: boolean) => {
      const newSettings = { ...columnSettingsRef.current, [key]: value };
      columnSettingsRef.current = newSettings;
      setColumnSettings(newSettings);
      saveSettings(newSettings);
    },
    [saveSettings]
  );

  // Update multiple settings at once
  const updateColumnSettings = useCallback(
    (newSettings: Partial<Record<string, boolean>>) => {
      const updated = { ...columnSettingsRef.current, ...newSettings };
      columnSettingsRef.current = updated;
      setColumnSettings(updated);
      saveSettings(updated);
    },
    [saveSettings]
  );

  return {
    columnSettings,
    updateColumnSetting,
    updateColumnSettings,
    isLoading: isLoading || !isLoaded,
    isSaving: false, // Removed mutation tracking since we use direct save
  };
}
