/** Public webhook endpoint for Meta + WappConnect delivery/read callbacks. */
export const WHATSAPP_WEBHOOK_URL =
  `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "https://lkbbrqcsbhqjvsxiorvp.supabase.co"}/functions/v1/whatsapp-webhook`;

export const WHATSAPP_WEBHOOK_VERIFY_TOKEN = "lovable_whatsapp_webhook";
