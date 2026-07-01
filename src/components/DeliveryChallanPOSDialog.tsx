import { useEffect } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

interface DeliveryChallanPOSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Legacy modal entry — redirects to full-page POS Delivery Challan. */
export function DeliveryChallanPOSDialog({ open, onOpenChange }: DeliveryChallanPOSDialogProps) {
  const { orgNavigate } = useOrgNavigation();

  useEffect(() => {
    if (!open) return;
    onOpenChange(false);
    orgNavigate("/pos-delivery-challan");
  }, [open, onOpenChange, orgNavigate]);

  return null;
}
