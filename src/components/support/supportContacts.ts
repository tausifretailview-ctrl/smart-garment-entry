/** EzzyERP public support channels — update here when numbers change. */
export const EZZY_SUPPORT = {
  callDisplay: "91-9820330995",
  callTel: "+919820330995",
  whatsappDisplay: "91-7021432520",
  whatsappDigits: "917021432520",
  email: "support@ezzyerp.in",
  hours: "9:00 AM – 9:00 PM (IST)",
} as const;

/** EzzyERP public social profiles — icon-only links in the sidebar footer. */
export const EZZY_SOCIAL = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/ezzyerp",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/ezzyerp",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/ezzyerp",
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@ezzyerp",
  },
] as const;

export function whatsappSupportUrl(prefill?: string): string {
  const text = encodeURIComponent(
    prefill || "Hi EzzyERP Support, I need help with my account.",
  );
  return `https://wa.me/${EZZY_SUPPORT.whatsappDigits}?text=${text}`;
}
