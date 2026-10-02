import { useEffect, useRef } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { isOwnerPushSupported, listenForOwnerAlertTaps, refreshOwnerAlertsToken } from "@/lib/ownerPush";

/**
 * Android app only: keep this phone's owner-alert token fresh and open the right
 * screen when an alert is tapped. Renders nothing; does nothing on web / Electron.
 */
export function OwnerPushBridge() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { orgNavigate } = useOrgNavigation();
  const navigateRef = useRef(orgNavigate);
  navigateRef.current = orgNavigate;
  const orgId = currentOrganization?.id;
  const userId = user?.id;

  useEffect(() => {
    if (!isOwnerPushSupported() || !orgId || !userId) return;
    void refreshOwnerAlertsToken(orgId, userId);
  }, [orgId, userId]);

  useEffect(() => {
    if (!isOwnerPushSupported()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void listenForOwnerAlertTaps((path) => navigateRef.current(path)).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
