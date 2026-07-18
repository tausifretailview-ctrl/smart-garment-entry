/** EzzyERP public support channels — update here when numbers change. */
export const EZZY_SUPPORT = {
  callDisplay: "91-9820330995",
  callTel: "+919820330995",
  whatsappDisplay: "91-7021432520",
  whatsappDigits: "917021432520",
  email: "support@ezzyerp.in",
  hours: "9:00 AM – 9:00 PM (IST)",
} as const;

export type SupportCallbackPayload = {
  businessName: string;
  contactName: string;
  contactNo: string;
  notes: string;
  submittedAt: string;
  organizationId?: string | null;
  organizationName?: string | null;
  userEmail?: string | null;
};

const CALLBACK_STORAGE_KEY = "ezzyerp-support-callbacks";

/** Temporary local queue until Settings/backend collection is wired. */
export function enqueueSupportCallback(payload: SupportCallbackPayload): void {
  try {
    const raw = localStorage.getItem(CALLBACK_STORAGE_KEY);
    const list: SupportCallbackPayload[] = raw ? JSON.parse(raw) : [];
    list.unshift(payload);
    localStorage.setItem(CALLBACK_STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* private mode */
  }
}

export function whatsappSupportUrl(prefill?: string): string {
  const text = encodeURIComponent(
    prefill || "Hi EzzyERP Support, I need help with my account.",
  );
  return `https://wa.me/${EZZY_SUPPORT.whatsappDigits}?text=${text}`;
}
