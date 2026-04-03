import { useSettings } from './useSettings';

export interface MobileERPSettings {
  enabled: boolean;
  imei_scan_enforcement: boolean;
  locked_size_qty: boolean;
  financer_billing: boolean;
  imei_min_length: number;
  imei_max_length: number;
}

const DEFAULT_SETTINGS: MobileERPSettings = {
  enabled: false,
  imei_scan_enforcement: true,
  locked_size_qty: true,
  financer_billing: true,
  imei_min_length: 15,
  imei_max_length: 19,
};

export function useMobileERP(): MobileERPSettings {
  const { data } = useSettings();
  const productSettings = (data as any)?.product_settings;
  const mobileErp = productSettings?.mobile_erp;
  
  if (!mobileErp?.enabled) {
    return { ...DEFAULT_SETTINGS, enabled: false };
  }
  
  return {
    enabled: true,
    imei_scan_enforcement: mobileErp.imei_scan_enforcement ?? true,
    locked_size_qty: mobileErp.locked_size_qty ?? true,
    financer_billing: mobileErp.financer_billing ?? true,
    imei_min_length: mobileErp.imei_min_length ?? 15,
    imei_max_length: mobileErp.imei_max_length ?? 19,
  };
}

export function validateIMEI(imei: string, minLength: number = 15, maxLength: number = 19): boolean {
  if (!imei) return false;
  const cleaned = imei.replace(/\s/g, '');
  return /^[a-zA-Z0-9]+$/.test(cleaned) && cleaned.length >= minLength && cleaned.length <= maxLength;
}
