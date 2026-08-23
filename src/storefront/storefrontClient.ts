import { createClient } from "@supabase/supabase-js";
import type { PublicStorefrontPayload } from "@/lib/websiteTypes";

const storefrontClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

export async function loadPublicStorefront(slug: string): Promise<PublicStorefrontPayload> {
  const { data, error } = await storefrontClient.rpc(
    "get_public_storefront" as never,
    { p_slug: slug } as never,
  );
  if (error) throw error;
  if (!data || typeof data !== "object") return { published: false };
  return data as PublicStorefrontPayload;
}

export async function submitStorefrontEnquiry(payload: {
  slug: string;
  customerName: string;
  customerPhone: string;
  message?: string | null;
  productId?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { data, error } = await storefrontClient.functions.invoke("submit-storefront-enquiry", {
    body: payload,
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return { ok: false, error: error.message || "Could not submit enquiry", status };
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    return { ok: false, error: String(data.error) };
  }
  return { ok: true };
}
