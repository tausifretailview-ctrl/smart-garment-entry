import { useLayoutEffect } from "react";
import { applyFieldSalesPwaManifest } from "@/lib/orgPwaManifest";
import { resetDeferredInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * While a Field Sales screen is open, the page's install manifest is the shop's Field Sales app
 * (orange icon, opens /{org}/salesman). An install event Chrome raised earlier for the owner app
 * is dropped, so "Install" can only add Field Sales; Chrome raises a fresh one for this manifest.
 */
export function useFieldSalesManifest(orgSlug: string | null | undefined, orgName?: string | null): void {
  useLayoutEffect(() => {
    if (!orgSlug) return;
    resetDeferredInstallPrompt();
    const restore = applyFieldSalesPwaManifest(orgSlug, orgName);
    return () => {
      restore();
      resetDeferredInstallPrompt();
    };
  }, [orgSlug, orgName]);
}
