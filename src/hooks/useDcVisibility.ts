import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  ALWAYS_SHOW_DC_RIGHT,
  canFlipDcVisibility,
  dcVisibilityStorageKey,
  effectiveDcVisibilityMode,
  isDcVisibilityFlipped,
  resolveDcVisibilityMode,
  setDcVisibilityFlipped,
  shouldHideDc,
  subscribeDcVisibility,
  type DcVisibilityMode,
} from "@/lib/dcVisibility";
import { isMissingDcHideSql } from "@/utils/dcBill";

export type DcVisibility = {
  mode: DcVisibilityMode;
  /** Leave DC purchases, DC stock and DC sale lines out of this screen. */
  hideDc: boolean;
  /** This tab differs from the shop's mode (Ctrl+Shift+H pressed). */
  flipped: boolean;
  canFlip: boolean;
  /** False while the DC database update is not run yet; screens then show everything. */
  dcReady: boolean;
  toggle: () => void;
  reset: () => void;
};

/** DC show / hide state for lists, dashboards and reports. See src/lib/dcVisibility.ts. */
export function useDcVisibility(): DcVisibility {
  const { data: settings } = useSettings();
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const { hasSpecialPermission } = useUserPermissions();
  const mode = effectiveDcVisibilityMode(
    resolveDcVisibilityMode(
      (settings as { purchase_settings?: { dc_visibility_mode?: string | null } | null } | null)
        ?.purchase_settings,
    ),
    hasSpecialPermission(ALWAYS_SHOW_DC_RIGHT),
  );
  const key =
    user?.id && currentOrganization?.id
      ? dcVisibilityStorageKey(user.id, currentOrganization.id)
      : null;
  const flipped = useSyncExternalStore(
    subscribeDcVisibility,
    () => isDcVisibilityFlipped(key),
    () => false,
  );
  const canFlip = canFlipDcVisibility(mode, organizationRole);
  const wantHide = shouldHideDc(mode, flipped && canFlip);

  // Hiding needs the DC SQL (new columns and RPC arguments). Until it is run, show everything
  // instead of failing every list. Checked once; a "not yet" answer is re-checked each minute.
  const { data: ready } = useQuery({
    queryKey: ["dc-hide-ready", currentOrganization?.id],
    queryFn: async () => {
      const { error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ error: unknown }>)(
        "dc_hide_mode_ready",
      );
      if (!error) return true;
      if (isMissingDcHideSql(error)) return false;
      throw error;
    },
    enabled: wantHide && !!currentOrganization?.id,
    staleTime: (query) => (query.state.data === true ? Infinity : 60_000),
    retry: 1,
  });
  const dcReady = ready !== false;

  const toggle = useCallback(() => {
    if (!key || !canFlip) return;
    setDcVisibilityFlipped(key, !isDcVisibilityFlipped(key));
  }, [key, canFlip]);

  const reset = useCallback(() => {
    if (key) setDcVisibilityFlipped(key, false);
  }, [key]);

  return {
    mode,
    hideDc: wantHide && dcReady,
    flipped: flipped && canFlip,
    canFlip,
    dcReady,
    toggle,
    reset,
  };
}
