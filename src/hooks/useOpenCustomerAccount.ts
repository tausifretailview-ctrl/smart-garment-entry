import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { customerAccountPagePath } from "@/utils/customerAccountNavigation";

/** Navigate to full-page customer account (replaces floating history modal). */
export function useOpenCustomerAccount() {
  const { orgNavigate } = useOrgNavigation();
  const location = useLocation();

  return useCallback(
    (customerId: string | null | undefined, customerName?: string) => {
      if (!customerId) return;
      orgNavigate(customerAccountPagePath(customerId), {
        state: {
          from: `${location.pathname}${location.search}`,
          ...(customerName ? { customerName } : {}),
        },
      });
    },
    [orgNavigate, location.pathname, location.search],
  );
}
