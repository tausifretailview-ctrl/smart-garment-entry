import { supabase } from "@/integrations/supabase/client";

export async function fetchMobileStockFilterOptions(orgId: string) {
  const { data, error } = await supabase.rpc("get_stock_report_filter_options", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const payload = data as {
    rawProducts?: Array<{ brand?: string | null; category?: string | null }>;
  } | null;
  const brands = new Set<string>();
  const categories = new Set<string>();
  for (const p of payload?.rawProducts ?? []) {
    if (p.brand?.trim()) brands.add(p.brand.trim());
    if (p.category?.trim()) categories.add(p.category.trim());
  }
  return {
    brands: [...brands].sort(),
    categories: [...categories].sort(),
  };
}
