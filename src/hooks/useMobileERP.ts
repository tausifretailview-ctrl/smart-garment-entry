import { useSettings } from './useSettings';
import { validateIMEI as validateIMEICore } from '@/utils/imeiValidation';

export { validateIMEICore as validateIMEI };

export interface MobileERPSettings {
  enabled: boolean;
  imei_scan_enforcement: boolean;
  locked_size_qty: boolean;
  financer_billing: boolean;
  imei_min_length: number;
  imei_max_length: number;
  /** Allow correcting IMEI on saved purchase bills / product edit panel */
  allow_imei_edit_after_save: boolean;
}

const DEFAULT_SETTINGS: MobileERPSettings = {
  enabled: false,
  imei_scan_enforcement: true,
  locked_size_qty: true,
  financer_billing: true,
  imei_min_length: 4,
  imei_max_length: 25,
  allow_imei_edit_after_save: true,
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
    imei_min_length: mobileErp.imei_min_length ?? 4,
    imei_max_length: mobileErp.imei_max_length ?? 25,
    allow_imei_edit_after_save: mobileErp.allow_imei_edit_after_save ?? true,
  };
}

/**
 * POS EMI / financer button. On for Mobile ERP shops with Financer Billing (unchanged), and for
 * any shop that turns on "POS EMI option" in Settings, without needing Mobile ERP mode.
 */
export function usePosEmiOption(): boolean {
  const { data } = useSettings();
  const mobileErp = useMobileERP();
  const posEmi = (data as any)?.product_settings?.pos_emi_option === true;
  return (mobileErp.enabled && mobileErp.financer_billing) || posEmi;
}
