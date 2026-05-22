import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";

/** Routes that use their own full-screen chrome (no app tab bar / install banner offset). */
export function useHideMobileBottomNav(): boolean {
  const location = useLocation();
  const { getOrgPath } = useOrgNavigation();
  const posSalesPath = getOrgPath("/pos-sales");
  const onPos =
    location.pathname === posSalesPath || location.pathname.startsWith(`${posSalesPath}/`);
  const onSalesInvoice = /\/sales-invoice(\/|$)/.test(location.pathname);
  return onPos || onSalesInvoice;
}

export function useHideMobileAppHeader(): boolean {
  const location = useLocation();
  return /\/sales-invoice(\/|$)/.test(location.pathname);
}
