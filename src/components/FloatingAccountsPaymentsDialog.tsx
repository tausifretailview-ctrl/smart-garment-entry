import { useEffect } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

interface FloatingAccountsPaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional tab when opening full-page workspace */
  initialTab?: string;
}

/**
 * Legacy dialog entry — redirects to the full-page Payments workspace
 * (Customer Balance style layout).
 */
export function FloatingAccountsPaymentsDialog({
  open,
  onOpenChange,
  initialTab,
}: FloatingAccountsPaymentsDialogProps) {
  const { orgNavigate } = useOrgNavigation();

  useEffect(() => {
    if (!open) return;
    onOpenChange(false);
    const query = initialTab ? `?tab=${encodeURIComponent(initialTab)}` : "";
    orgNavigate(`/accounts-payments${query}`);
  }, [open, onOpenChange, orgNavigate, initialTab]);

  return null;
}
