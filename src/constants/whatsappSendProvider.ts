/** Outbound WhatsApp send routing per organization (whatsapp_api_settings.send_provider). */
export const WHATSAPP_SEND_PROVIDERS = ['existing', 'wappconnect', 'builtin'] as const;

export type WhatsAppSendProvider = (typeof WHATSAPP_SEND_PROVIDERS)[number];

export const WHATSAPP_SEND_PROVIDER_LABELS: Record<WhatsAppSendProvider, string> = {
  existing: 'Existing (Meta / Business API)',
  wappconnect: 'WappConnect',
  builtin: 'Our WhatsApp (scan QR, no third party)',
};

export function normalizeSendProvider(value: string | null | undefined): WhatsAppSendProvider {
  return (WHATSAPP_SEND_PROVIDERS as readonly string[]).includes(value ?? '')
    ? (value as WhatsAppSendProvider)
    : 'existing';
}

export function isBuiltinSendProvider(value: string | null | undefined): value is 'builtin' {
  return value === 'builtin';
}

/**
 * True for providers that send plain text + PDF link/file (WappConnect and the built-in
 * gateway) instead of Meta templates. Name kept for existing call sites.
 */
export function isWappConnectSendProvider(
  value: string | null | undefined,
): value is 'wappconnect' | 'builtin' {
  return value === 'wappconnect' || value === 'builtin';
}

/** Non-secret rollout flag; "Our WhatsApp" stays hidden until the gateway + migration are live. */
export const BUILTIN_WHATSAPP_ENABLED =
  import.meta.env.VITE_ENABLE_BUILTIN_WHATSAPP === 'true';

export function selectableSendProviders(current?: string | null): WhatsAppSendProvider[] {
  return WHATSAPP_SEND_PROVIDERS.filter(
    (p) => p !== 'builtin' || BUILTIN_WHATSAPP_ENABLED || current === 'builtin',
  );
}
