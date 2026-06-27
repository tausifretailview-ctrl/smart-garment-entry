import { useOrganization } from "@/contexts/OrganizationContext";
import { useIsLgUp, useIsNarrowViewport } from "@/hooks/use-mobile";
import { useForceDesktopView } from "@/hooks/useDesktopViewPreference";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import { STALE_REFERENCE } from "@/lib/queryStaleTimes";
import { BackgroundSyncBadge } from "@/components/BackgroundSyncBadge";

const getCurrentPageName = (path: string): string => {
  const PAGE_NAMES: Record<string, string> = {
    'sales-invoice': 'Sale Invoice Entry',
    'sales-invoice-dashboard': 'Invoice Dashboard',
    'pos-sales': 'POS Billing',
    'pos-dashboard': 'POS Dashboard',
    'purchase-entry': 'Purchase Entry',
    'purchase-bills': 'Purchase Dashboard',
    'stock-report': 'Stock Report',
    'stock-analysis': 'Stock Analysis',
    'accounts': 'Accounts',
    'fee-collection': 'Fee Collection',
    'customer-master': 'Customer Master',
    'supplier-master': 'Supplier Master',
    'product-dashboard': 'Product Dashboard',
    'product-entry': 'Product Entry',
    'barcode-printing': 'Barcode Printing',
    'daily-tally': 'Daily Tally',
    'sale-return-entry': 'Sale Return',
    'purchase-return-entry': 'Purchase Return',
    'quotation-entry': 'Quotation Entry',
    'sale-order-entry': 'Sale Order Entry',
    'delivery-challan-entry': 'Delivery Challan',
    'settings': 'Settings',
    'gst-reports': 'GST Reports',
    'item-wise-sales': 'Item Wise Sales',
  };
  const segment = path.split('/').filter(Boolean).pop() || '';
  return PAGE_NAMES[segment] || '';
};

function StatusSep() {
  return <div className="erp-status-bar__sep" aria-hidden />;
}

export const StatusBar = () => {
  const isLgUp = useIsLgUp();
  const isNarrow = useIsNarrowViewport();
  const forceDesktop = useForceDesktopView();
  const { currentOrganization } = useOrganization();
  const location = useLocation();

  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`;

  const { data: summary } = useQuery({
    queryKey: ["statusbar-summary", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const [stockRes, recvRes] = await Promise.all([
        supabase
          .from("v_dashboard_stock_summary")
          .select("total_stock_qty")
          .eq("organization_id", currentOrganization.id)
          .maybeSingle(),
        supabase
          .from("v_dashboard_receivables")
          .select("total_receivables")
          .eq("organization_id", currentOrganization.id)
          .maybeSingle(),
      ]);
      return {
        stockQty: stockRes.data?.total_stock_qty ?? 0,
        dueAmount: recvRes.data?.total_receivables ?? 0,
      };
    },
    enabled: !!currentOrganization?.id,
    // F2: StatusBar refetched ~every 10s on every page → biggest cloud read source.
    // Reference-tier cache (2 min) + no polling. Save paths invalidate via
    // ["statusbar-summary"] to keep stock/due fresh after mutations.
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const stockQty = summary?.stockQty ?? 0;
  const dueAmount = summary?.dueAmount ?? 0;
  const pageName = getCurrentPageName(location.pathname);

  const showOnPhoneForcedDesktop = forceDesktop && isNarrow;
  if (!isLgUp && !showOnPhoneForcedDesktop) return null;

  return (
    <div
      className={cn(
        "erp-status-bar",
        showOnPhoneForcedDesktop ? "erp-status-bar--fixed safe-area-pb" : "erp-status-bar--inset hidden lg:flex",
      )}
      style={
        showOnPhoneForcedDesktop
          ? { bottom: "env(safe-area-inset-bottom, 0px)" }
          : undefined
      }
    >
      <div className="erp-status-bar__left">
        <div className="status-item shrink-0">
          <span className="status-dot" />
          <span>Connected</span>
        </div>
        <StatusSep />
        <div className="status-item truncate">
          <span className="truncate">{currentOrganization?.name || "—"}</span>
        </div>
        <StatusSep />
        <div className="status-item shrink-0">
          <span>{fy}</span>
        </div>
        <StatusSep />
        <div className="status-item shrink-0 tabular-nums">
          <span>Stock: {Number(stockQty).toLocaleString("en-IN")}</span>
        </div>
        <StatusSep />
        <div className="status-item shrink-0 tabular-nums" style={{ color: "hsl(38 92% 70%)" }}>
          <span>Due: ₹{Number(dueAmount).toLocaleString("en-IN")}</span>
        </div>
        {pageName && (
          <>
            <StatusSep />
            <div className="status-item shrink-0">
              <span>{pageName}</span>
            </div>
          </>
        )}
      </div>
      <div className="erp-status-bar__right">
        <BackgroundSyncBadge />
        <StatusSep />
        <div className="status-item opacity-50 text-[10px] shrink-0">
          EzzyERP v2.0
        </div>
      </div>
    </div>
  );
};
