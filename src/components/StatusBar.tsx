import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";

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

export const StatusBar = () => {
  const { currentOrganization } = useOrganization();
  const location = useLocation();

  // Current financial year (Indian FY: Apr-Mar)
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`;

  const { data: stockData } = useQuery({
    queryKey: ["statusbar-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data } = await supabase
        .from("v_dashboard_stock_summary")
        .select("total_stock_qty")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: dueData } = useQuery({
    queryKey: ["statusbar-due", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .eq("payment_status", "due")
        .is("deleted_at", null);
      const total = (data || []).reduce(
        (s: number, r: any) => s + Math.max(0, (Number(r.net_amount) || 0) - (Number(r.paid_amount) || 0)),
        0,
      );
      return { total };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stockQty = stockData?.total_stock_qty ?? 0;
  const dueAmount = dueData?.total ?? 0;
  const pageName = getCurrentPageName(location.pathname);

  return (
    <div className="erp-status-bar hidden lg:flex">
      <div className="status-item">
        <span className="status-dot" />
        <span>Connected</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item">
        <span>{currentOrganization?.name || "—"}</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item">
        <span>{fy}</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item">
        <span>Stock: {Number(stockQty).toLocaleString("en-IN")}</span>
      </div>
      <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
      <div className="status-item" style={{ color: "hsl(38 92% 70%)" }}>
        <span>Due: ₹{Number(dueAmount).toLocaleString("en-IN")}</span>
      </div>
      {pageName && (
        <>
          <div className="w-px h-3 bg-primary-foreground/20 mx-1" />
          <div className="status-item">
            <span>{pageName}</span>
          </div>
        </>
      )}
      <div className="flex-1" />
      <div className="status-item opacity-50 text-[10px]">
        EzzyERP v2.0
      </div>
    </div>
  );
};
