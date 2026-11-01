import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "./useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  EMPTY_CUSTOMER_CREDIT_TERMS,
  INDUSTRIAL_MODE_FEATURE,
  resolveIndustrialMode,
  type CustomerCreditTerms,
  type IndustrialModeConfig,
  type IndustrialModeSettings,
} from "@/utils/industrialMode";

/** True when Platform Admin turned on Industrial mode for this shop (shows the Settings switch). */
export function useIndustrialModeAvailable(): boolean {
  const { hasFeature } = useOrganization();
  return hasFeature(INDUSTRIAL_MODE_FEATURE);
}

export function useIndustrialMode(): IndustrialModeSettings {
  const { data } = useSettings();
  const available = useIndustrialModeAvailable();
  const config = (data as { sale_settings?: { industrial_mode?: IndustrialModeConfig } } | null)
    ?.sale_settings?.industrial_mode;
  return resolveIndustrialMode(available, config);
}

export const customerCreditTermsKey = (orgId: string | null | undefined, customerId: string | null | undefined) =>
  ["customer-credit-terms", orgId || "", customerId || ""] as const;

/**
 * Credit limit / days for one party. Read separately from the main customer
 * select so shops that have not run the industrial SQL keep working.
 * Only runs when Industrial mode is on.
 */
export async function fetchCustomerCreditTerms(
  organizationId: string,
  customerId: string,
): Promise<CustomerCreditTerms> {
  // Columns are new (industrial SQL); not in generated types yet.
  const { data, error } = await supabase
    .from("customers" as any)
    .select("credit_limit, credit_days, contact_person, pan_number")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as unknown as Partial<Record<keyof CustomerCreditTerms, unknown>>;
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    credit_limit: num(row.credit_limit),
    credit_days: num(row.credit_days),
    contact_person: (row.contact_person as string | null) ?? null,
    pan_number: (row.pan_number as string | null) ?? null,
  };
}

export function useCustomerCreditTerms(customerId: string | null | undefined, enabled: boolean) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: customerCreditTermsKey(orgId, customerId),
    queryFn: () => fetchCustomerCreditTerms(orgId as string, customerId as string),
    enabled: enabled && !!orgId && !!customerId,
    staleTime: 60_000,
    placeholderData: EMPTY_CUSTOMER_CREDIT_TERMS,
  });
}
