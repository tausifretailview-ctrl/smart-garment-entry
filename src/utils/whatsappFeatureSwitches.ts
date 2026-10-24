/**
 * Settings > WhatsApp: extra features a shop turns on itself (off until enabled).
 * Stored in settings.sale_settings so no new column is needed.
 */
type SwitchSettings = { gift_vouchers_enabled?: boolean; bulk_whatsapp_enabled?: boolean } | null | undefined;

/** Gift voucher buttons (POS Voucher, Advance Booking Gift Voucher). */
export function isGiftVoucherEnabled(saleSettings: unknown): boolean {
  return (saleSettings as SwitchSettings)?.gift_vouchers_enabled === true;
}

/** Bulk WhatsApp page and its menu entries. */
export function isBulkWhatsAppEnabled(saleSettings: unknown): boolean {
  return (saleSettings as SwitchSettings)?.bulk_whatsapp_enabled === true;
}
