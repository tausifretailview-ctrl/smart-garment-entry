import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const INSIGHTS_STALE_TIME = 5 * 60 * 1000;

export type ProductPerformanceRow = {
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  units_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  return_qty: number;
  return_amount: number;
  net_revenue: number;
  current_stock: number;
  stock_value: number;
  last_sold_date: string | null;
  days_since_sold: number | null;
};

export type BrandPerformanceRow = {
  brand: string;
  product_count: number;
  units_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  return_qty: number;
  return_rate_pct: number;
  current_stock_value: number;
};

export type SupplierPerformanceRow = {
  supplier_id: string;
  supplier_name: string;
  total_purchased: number;
  bill_count: number;
  units_purchased: number;
  units_sold: number;
  sell_through_rate_pct: number;
  return_to_supplier: number;
  current_stock_value: number;
};

export type SlowMovingStockRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  current_stock: number;
  stock_value: number;
  last_sold_date: string | null;
  days_since_sold: number | null;
  total_sold_ever: number;
};

export type LowStockAlertRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  current_stock: number;
  avg_daily_sales: number;
  days_of_stock_left: number | null;
  last_purchase_date: string | null;
  primary_supplier: string | null;
};

export type CategoryPerformanceRow = {
  category: string;
  product_count: number;
  units_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  stock_value: number;
  sell_through_rate: number;
};

type DateRangeParams = {
  startDate: string | null;
  endDate: string | null;
  enabled?: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useProductPerformance(
  orgId: string | undefined,
  { startDate, endDate, enabled = true }: DateRangeParams,
) {
  return useQuery({
    queryKey: ["insights-product-performance", orgId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_performance", {
        p_org_id: orgId!,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? []) as ProductPerformanceRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

export function useBrandPerformance(
  orgId: string | undefined,
  { startDate, endDate, enabled = true }: DateRangeParams,
) {
  return useQuery({
    queryKey: ["insights-brand-performance", orgId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_brand_performance", {
        p_org_id: orgId!,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? []) as BrandPerformanceRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

export function useSupplierPerformance(
  orgId: string | undefined,
  { startDate, endDate, enabled = true }: DateRangeParams,
) {
  return useQuery({
    queryKey: ["insights-supplier-performance", orgId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_supplier_performance", {
        p_org_id: orgId!,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? []) as SupplierPerformanceRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

export function useSlowMovingStock(
  orgId: string | undefined,
  daysThreshold: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["insights-slow-moving-stock", orgId, daysThreshold],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_slow_moving_stock", {
        p_org_id: orgId!,
        p_days_threshold: daysThreshold,
      });
      if (error) throw error;
      return (data ?? []) as SlowMovingStockRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

export function useLowStockAlerts(
  orgId: string | undefined,
  threshold: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["insights-low-stock-alerts", orgId, threshold],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_low_stock_alerts", {
        p_org_id: orgId!,
        p_threshold: threshold,
      });
      if (error) throw error;
      return (data ?? []) as LowStockAlertRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

export function useCategoryPerformance(
  orgId: string | undefined,
  { startDate, endDate, enabled = true }: DateRangeParams,
) {
  return useQuery({
    queryKey: ["insights-category-performance", orgId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_category_performance", {
        p_org_id: orgId!,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data ?? []) as CategoryPerformanceRow[];
    },
    staleTime: INSIGHTS_STALE_TIME,
    enabled: !!orgId && enabled,
  });
}

/** Indian rupee display for insights tables and charts. */
export function formatInsightsINR(value: number, decimals = 0): string {
  return `₹${num(value).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
