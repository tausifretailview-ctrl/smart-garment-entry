import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const StatusBar = () => {
  const { currentOrganization } = useOrganization();

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
    staleTime: 15 * 60 * 1000,    // 15 minutes — stock qty doesn't change every minute
    refetchOnWindowFocus: false,
  });

  const { data: dueData } = useQuery({
    queryKey: ["statusbar-due", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data } = await supabase
        .from("sales")
        .select("balance_due")
        .eq("organization_id", currentOrganization.id)
        .eq("payment_status", "due")
        .is("deleted_at", null);
      const total = (data || []).reduce((s: number, r: any) => s + (r.balance_due || 0), 0);
      return { total };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 15 * 60 * 1000,    // 15 minutes
    refetchOnWindowFocus: false,
  });

  const stockQty = stockData?.total_stock_qty ?? 0;
  const dueAmount = dueData?.total ?? 0;

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
      <div className="flex-1" />
      <div className="status-item opacity-50 text-[10px]">
        EzzyERP v2.0
      </div>
    </div>
  );
};
