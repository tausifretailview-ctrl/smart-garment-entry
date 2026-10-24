import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import {
  canFlipDcVisibility,
  dcVisibilityStorageKey,
  isDcVisibilityFlipped,
  resolveDcVisibilityMode,
  setDcVisibilityFlipped,
  shouldHideDc,
  subscribeDcVisibility,
  type DcVisibilityMode,
} from "@/lib/dcVisibility";

export type DcVisibility = {
  mode: DcVisibilityMode;
  /** Leave DC purchases, DC stock and DC sale lines out of this screen. */
  hideDc: boolean;
  /** This tab differs from the shop's mode (Ctrl+Shift+H pressed). */
  flipped: boolean;
  canFlip: boolean;
  toggle: () => void;
  reset: () => void;
};

/** DC show / hide state for lists, dashboards and reports. See src/lib/dcVisibility.ts. */
export function useDcVisibility(): DcVisibility {
  const { data: settings } = useSettings();
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const mode = resolveDcVisibilityMode(
    (settings as { purchase_settings?: { dc_visibility_mode?: string | null } | null } | null)
      ?.purchase_settings,
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

  const toggle = useCallback(() => {
    if (!key || !canFlip) return;
    setDcVisibilityFlipped(key, !isDcVisibilityFlipped(key));
  }, [key, canFlip]);

  const reset = useCallback(() => {
    if (key) setDcVisibilityFlipped(key, false);
  }, [key]);

  return {
    mode,
    hideDc: shouldHideDc(mode, flipped && canFlip),
    flipped: flipped && canFlip,
    canFlip,
    toggle,
    reset,
  };
}
