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
