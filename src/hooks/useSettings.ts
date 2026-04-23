import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Centralized settings hook — fetches ALL settings columns once,
 * caches for 5 minutes, and serves every consumer from one cache entry.
 *
 * Usage:
 *   const { data: settings } = useSettings();          // full row
 *   const posSettings = usePOSSettings();               // sale_settings
 *   const invoiceSettings = useInvoiceSettings();       // sale_settings (alias)
 *   const gst = useGSTSettings();                       // { gstNumber, businessName }
 *   const biz = useBusinessInfo();                      // name / address / phone / email / gst
 *   const barcode = useBillBarcodeSettings();           // bill_barcode_settings
 */

export function useSettings() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['org-settings', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — settings rarely change
    refetchOnWindowFocus: false,
    enabled: !!orgId,
  });
}

// ── Typed selectors — read from the same cache, no extra DB call ──

export function usePOSSettings() {
  const { data } = useSettings();
  return ((data as any)?.sale_settings || {}) as Record<string, any>;
}

export function useInvoiceSettings() {
  const { data } = useSettings();
  return ((data as any)?.sale_settings || {}) as Record<string, any>;
}

export function useGSTSettings() {
  const { data } = useSettings();
  return {
    gstNumber: (data as any)?.gst_number as string | null,
    businessName: (data as any)?.business_name as string | null,
  };
}

export function useBillBarcodeSettings() {
  const { data } = useSettings();
  return ((data as any)?.bill_barcode_settings || {}) as Record<string, any>;
}

export function useBusinessInfo() {
  const { data } = useSettings();
  const d = data as any;
  return {
    businessName: (d?.business_name || '') as string,
    address: (d?.address || '') as string,
    mobileNumber: (d?.mobile_number || '') as string,
    emailId: (d?.email_id || '') as string,
    gstNumber: (d?.gst_number || '') as string,
  };
}

/**
 * Organization-wide custom labels for product master fields.
 * Configurable per-org under Settings → Product Settings → Field Labels.
 * Falls back to the default English label if the org hasn't customized it.
 *
 * Use this in every report / filter / dropdown that surfaces these fields
 * so the UI matches whatever the merchant calls them in Product Entry
 * (e.g. some shops rename "Style" to "Department" or vice-versa).
 */
export type ProductFieldKey = 'category' | 'brand' | 'style' | 'color' | 'hsn_code';

const DEFAULT_PRODUCT_FIELD_LABELS: Record<ProductFieldKey, string> = {
  category: 'Category',
  brand: 'Brand',
  style: 'Style',
  color: 'Color',
  hsn_code: 'HSN Code',
};

export function useProductFieldLabels(): Record<ProductFieldKey, string> {
  const { data } = useSettings();
  const fields = ((data as any)?.product_settings?.fields || {}) as Record<string, { label?: string; enabled?: boolean }>;
  const out: Record<ProductFieldKey, string> = { ...DEFAULT_PRODUCT_FIELD_LABELS };
  (Object.keys(DEFAULT_PRODUCT_FIELD_LABELS) as ProductFieldKey[]).forEach((k) => {
    const lbl = fields?.[k]?.label;
    if (lbl && typeof lbl === 'string' && lbl.trim()) out[k] = lbl.trim();
  });
  return out;
}
