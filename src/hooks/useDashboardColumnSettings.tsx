import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isStatementTimeout } from "@/utils/statementTimeout";

type DashboardType =
  | "pos_dashboard"
  | "sales_invoice_dashboard"
  | "purchase_bill_dashboard"
  | "payments_dashboard"
  | "product_dashboard"
  | "sale_return_dashboard";

type DashboardSettingsMap = Record<string, Record<string, boolean>>;

/**
 * Column visibility prefs for list dashboards.
 * UI flips immediately; server write is reconciled with revert + toast on failure
 * (fixes prior silent-drift when the write failed after a local flip).
 */
export function useDashboardColumnSettings(
  dashboardType: DashboardType,
  defaultSettings: Record<string, boolean>,
) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const defaultsRef = useRef(defaultSettings);
  const columnSettingsRef = useRef<Record<string, boolean>>(defaultSettings);
  const orgIdRef = useRef(currentOrganization?.id);

  const [columnSettings, setColumnSettings] = useState<Record<string, boolean>>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    orgIdRef.current = currentOrganization?.id;
  }, [currentOrganization?.id]);

  useEffect(() => {
    columnSettingsRef.current = columnSettings;
  }, [columnSettings]);

  const settingsQueryKey = ["dashboard-settings", currentOrganization?.id] as const;

  const { data: settings, isLoading } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("settings")
        .select("dashboard_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      return data?.dashboard_settings as DashboardSettingsMap | null;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isLoading && settings !== undefined) {
      const savedSettings = settings?.[dashboardType];
      if (savedSettings) {
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

  const saveMutation = useMutation({
    mutationFn: async (newSettings: Record<string, boolean>) => {
      const orgId = orgIdRef.current;
      if (!orgId) throw new Error("No organization selected");

      const { data: current, error: readError } = await supabase
        .from("settings")
        .select("dashboard_settings")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (readError) throw readError;

      const currentDashboardSettings =
        (current?.dashboard_settings as DashboardSettingsMap | null) || {};

      const updatedSettings: DashboardSettingsMap = {
        ...currentDashboardSettings,
        [dashboardType]: newSettings,
      };

      const { error: writeError } = await supabase
        .from("settings")
        .update({ dashboard_settings: updatedSettings })
        .eq("organization_id", orgId);
      if (writeError) throw writeError;

      return { orgId, newSettings, updatedSettings };
    },
    onMutate: async (newSettings) => {
      const orgId = orgIdRef.current;
      if (!orgId) return { previous: undefined as DashboardSettingsMap | null | undefined, newSettings };

      await queryClient.cancelQueries({ queryKey: ["dashboard-settings", orgId] });
      const previous = queryClient.getQueryData<DashboardSettingsMap | null>([
        "dashboard-settings",
        orgId,
      ]);

      queryClient.setQueryData<DashboardSettingsMap | null>(["dashboard-settings", orgId], (old) => ({
        ...(old || {}),
        [dashboardType]: newSettings,
      }));

      return { previous, newSettings };
    },
    onError: (error, failedSettings, context) => {
      const orgId = orgIdRef.current;
      // Only revert if the UI still shows this failed write (rapid toggles may have moved on).
      const stillShowingFailed =
        JSON.stringify(columnSettingsRef.current) === JSON.stringify(failedSettings);

      if (stillShowingFailed) {
        if (orgId && context && "previous" in context) {
          queryClient.setQueryData(["dashboard-settings", orgId], context.previous);
          const restored = context.previous?.[dashboardType]
            ? { ...defaultsRef.current, ...context.previous[dashboardType] }
            : { ...defaultsRef.current };
          setColumnSettings(restored);
          columnSettingsRef.current = restored;
        }
        if (!isStatementTimeout(error)) {
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          toast.error("Couldn't save — change undone", {
            description: offline
              ? "You're offline. Reconnect and try again."
              : error instanceof Error
                ? error.message
                : "Column layout was not saved",
          });
        }
      }
    },
    onSettled: () => {
      const orgId = orgIdRef.current;
      if (orgId) {
        void queryClient.invalidateQueries({ queryKey: ["dashboard-settings", orgId] });
      }
    },
  });

  const updateColumnSetting = useCallback(
    (key: string, value: boolean) => {
      const newSettings = { ...columnSettingsRef.current, [key]: value };
      columnSettingsRef.current = newSettings;
      setColumnSettings(newSettings);
      saveMutation.mutate(newSettings);
    },
    [saveMutation],
  );

  const updateColumnSettings = useCallback(
    (partial: Partial<Record<string, boolean>>) => {
      const updated = { ...columnSettingsRef.current, ...partial };
      columnSettingsRef.current = updated;
      setColumnSettings(updated);
      saveMutation.mutate(updated);
    },
    [saveMutation],
  );

  return {
    columnSettings,
    updateColumnSetting,
    updateColumnSettings,
    isLoading: isLoading || !isLoaded,
    isSaving: saveMutation.isPending,
  };
}
