/** Outbound WhatsApp send routing per organization (whatsapp_api_settings.send_provider). */
export const WHATSAPP_SEND_PROVIDERS = ['existing', 'wappconnect'] as const;

export type WhatsAppSendProvider = (typeof WHATSAPP_SEND_PROVIDERS)[number];

export const WHATSAPP_SEND_PROVIDER_LABELS: Record<WhatsAppSendProvider, string> = {
  existing: 'Existing (Meta / Business API)',
  wappconnect: 'WappConnect',
};

export function isWappConnectSendProvider(
  value: string | null | undefined,
): value is 'wappconnect' {
  return value === 'wappconnect';
}
