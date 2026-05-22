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

const OWN_HEADER_PATHS = [
  /\/sales-invoice(\/|$)/,
  /\/pos-dashboard$/,
  /\/daily-cashier-report$/,
  /\/sales-invoice-dashboard$/,
  /\/purchase-bills$/,
  /\/payments-dashboard$/,
  /\/sale-return-dashboard$/,
  /\/mobile-sales$/,
  /\/mobile-more$/,
  /\/mobile-accounts$/,
  /\/owner-reports$/,
  /\/mobile-reports$/,
];

export function useHideMobileAppHeader(): boolean {
  const location = useLocation();
  return OWN_HEADER_PATHS.some((re) => re.test(location.pathname));
}
