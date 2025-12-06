import { useState, useEffect, useCallback } from "react";
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
  const [columnSettings, setColumnSettings] = useState<Record<string, boolean>>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

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
  });

  // Load settings when data is fetched
  useEffect(() => {
    if (!isLoading && settings !== undefined) {
      const savedSettings = settings?.[dashboardType];
      if (savedSettings) {
        // Merge with defaults to handle new columns
        setColumnSettings({ ...defaultSettings, ...savedSettings });
      } else {
        setColumnSettings(defaultSettings);
      }
      setIsLoaded(true);
    }
  }, [settings, isLoading, dashboardType, defaultSettings]);

  // Mutation to save settings
  const saveMutation = useMutation({
    mutationFn: async (newSettings: Record<string, boolean>) => {
      if (!currentOrganization?.id) throw new Error("No organization");

      // Get current dashboard_settings
      const { data: current } = await supabase
        .from("settings")
        .select("dashboard_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      const currentDashboardSettings = (current?.dashboard_settings as Record<string, Record<string, boolean>>) || {};
      
      // Update with new settings for this dashboard
      const updatedSettings = {
        ...currentDashboardSettings,
        [dashboardType]: newSettings,
      };

      const { error } = await supabase
        .from("settings")
        .update({ dashboard_settings: updatedSettings })
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;
      return updatedSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-settings"] });
    },
  });

  // Update single column setting
  const updateColumnSetting = useCallback(
    (key: string, value: boolean) => {
      const newSettings = { ...columnSettings, [key]: value };
      setColumnSettings(newSettings);
      saveMutation.mutate(newSettings);
    },
    [columnSettings, saveMutation]
  );

  // Update multiple settings at once
  const updateColumnSettings = useCallback(
    (newSettings: Partial<Record<string, boolean>>) => {
      const updated = { ...columnSettings, ...newSettings };
      setColumnSettings(updated);
      saveMutation.mutate(updated);
    },
    [columnSettings, saveMutation]
  );

  return {
    columnSettings,
    updateColumnSetting,
    updateColumnSettings,
    isLoading: isLoading || !isLoaded,
    isSaving: saveMutation.isPending,
  };
}
