import { useSettings } from "./useSettings";
import { useIndustrialMode } from "./useIndustrialMode";
import { ewayBillEnabled } from "@/utils/ewayBill";

/**
 * E-way bills are on for this shop: the E-Way Bill switch in Settings > Sale, with or without
 * E-Invoice (Industrial mode shops with E-Invoice have it on unless they turned it off). Off for
 * every other shop, which then makes no e-way bill query.
 */
export function useEwayBillOn(): boolean {
  const { data } = useSettings();
  const industrial = useIndustrialMode();
  const einvoiceSettings = (data as { sale_settings?: { einvoice_settings?: unknown } } | null)?.sale_settings
    ?.einvoice_settings;
  return ewayBillEnabled(einvoiceSettings, industrial.enabled);
}
