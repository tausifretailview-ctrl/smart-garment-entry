import { useSettings } from './useSettings';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  MANUFACTURER_ERP_FEATURE,
  resolveManufacturerERP,
  type ManufacturerERPConfig,
  type ManufacturerERPSettings,
} from '@/utils/manufacturing';

/** True when Platform Admin turned on Manufacturer ERP for this shop (shows the Settings switch). */
export function useManufacturerERPAvailable(): boolean {
  const { hasFeature } = useOrganization();
  return hasFeature(MANUFACTURER_ERP_FEATURE);
}

export function useManufacturerERP(): ManufacturerERPSettings {
  const { data } = useSettings();
  const available = useManufacturerERPAvailable();
  const config = (data as { product_settings?: { manufacturer_erp?: ManufacturerERPConfig } } | null)
    ?.product_settings?.manufacturer_erp;
  return resolveManufacturerERP(available, config);
}
