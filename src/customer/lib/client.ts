import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Self-contained anon client for the customer app. Same no-session pattern as
// the ERP storefront client, but defined here so the customer bundle never
// imports ERP app code.
let client: SupabaseClient | null = null;

export function getCustomerClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return client;
}

// First hostname label, e.g. "ella-noor" on ella-noor.example.com.
// Localhost override via VITE_CUSTOMER_SUBDOMAIN.
export function resolveSubdomain(): string {
  const override = (import.meta.env.VITE_CUSTOMER_SUBDOMAIN as string | undefined)?.trim();
  if (override) return override.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
  return host.split(".")[0] ?? "";
}

export interface CustomerPageGet {
  ok: boolean;
  org?: {
    name: string;
    subdomain: string | null;
    business_name: string | null;
    address: string | null;
    mobile_number: string | null;
    gst_number: string | null;
    logo_url: string | null;
  };
  social?: {
    instagram_url: string | null;
    facebook_url: string | null;
    whatsapp_number: string | null;
    google_review: string | null;
  };
  sale?: {
    sale_number: string;
    sale_date: string;
    customer_name: string;
    items: Array<{
      name: string;
      size: string;
      colour: string | null;
      qty: number;
      rate: number;
      mrp: number;
      discount_percent: number;
      gst_percent: number;
      amount: number;
      taxable: number;
      tax: number;
    }>;
    taxable_value: number;
    tax_total: number;
    discount_amount: number;
    round_off: number;
    net_amount: number;
    paid_amount: number | null;
    payment_method: string;
    payment_status: string;
    salesman: string | null;
  } | null;
  feedback?: { rating: number; tags: string[]; source: string } | null;
  engage_allowed?: boolean;
  phone_hint?: string;
  settings?: { enabled: boolean; push_enabled: boolean } | null;
  invoice_expires_at?: string;
  engage_expires_at?: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getCustomerClient().rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export function pageGet(subdomain: string, token: string): Promise<CustomerPageGet> {
  return rpc<CustomerPageGet>("customer_page_get", { p_subdomain: subdomain, p_token: token });
}

export function registerPush(
  subdomain: string,
  token: string,
  fcmToken: string,
  platform: string,
): Promise<{ ok: boolean; receives_invoices?: boolean; error?: string }> {
  return rpc("customer_page_register_push", {
    p_subdomain: subdomain,
    p_token: token,
    p_fcm_token: fcmToken,
    p_platform: platform,
  });
}

export function submitFeedback(
  token: string,
  rating: number,
  tags: string[],
  comment: string,
): Promise<{ ok: boolean; error?: string }> {
  return rpc("customer_page_submit_feedback", {
    p_token: token,
    p_rating: rating,
    p_tags: tags,
    p_comment: comment || null,
  });
}

export function logEvent(token: string, event: string): Promise<{ ok: boolean }> {
  return rpc<{ ok: boolean }>("customer_page_log_event", { p_token: token, p_event: event }).catch(() => ({
    ok: false,
  }));
}

export function trackMessage(messageId: string, event: string): Promise<{ ok: boolean }> {
  return rpc<{ ok: boolean }>("push_track", { p_message_id: messageId, p_event: event }).catch(() => ({
    ok: false,
  }));
}
