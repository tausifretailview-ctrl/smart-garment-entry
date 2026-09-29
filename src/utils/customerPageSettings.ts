export type CustomerPageFlags = {
  enabled: boolean;
  push_enabled: boolean;
  add_link_to_whatsapp: boolean;
  print_qr_on_bill: boolean;
};

/** No row yet = everything off (same as push-send, which skips when the row is missing). */
export const CUSTOMER_PAGE_DEFAULTS: CustomerPageFlags = {
  enabled: false,
  push_enabled: false,
  add_link_to_whatsapp: false,
  print_qr_on_bill: false,
};

/** Turning the customer page off also turns off everything that depends on it. */
export function applyCustomerPageToggle(
  current: CustomerPageFlags,
  key: keyof CustomerPageFlags,
  value: boolean,
): CustomerPageFlags {
  if (key === "enabled" && !value) return { ...CUSTOMER_PAGE_DEFAULTS };
  return { ...current, [key]: value };
}
