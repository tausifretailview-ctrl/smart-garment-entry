import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import {
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from "../../../supabase/functions/_shared/supportTokenMessage";

export { SUPPORT_CATEGORIES, type SupportCategory };

export type SupportTokenStatus = "open" | "in_progress" | "closed";
export type SupportWhatsAppStatus = "pending" | "sent" | "failed" | "not_configured";

export interface SupportToken {
  id: string;
  token_no: number;
  organization_id: string | null;
  organization_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  contact_phone: string;
  category: SupportCategory;
  message: string;
  page_path: string | null;
  status: SupportTokenStatus;
  whatsapp_status: SupportWhatsAppStatus;
  whatsapp_error: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export const SUPPORT_STATUS_LABELS: Record<SupportTokenStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
};

/** Not in the generated Supabase types yet (table added by migration 20270212120000). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supportTokensTable = () => (supabase as any).from("support_tokens");

export async function invokeSupportTokens<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("support-tokens", { body: { action, ...payload } });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data, "Support request failed"));
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return (data ?? {}) as T;
}

export interface CreateSupportTokenInput {
  organizationId: string;
  phone: string;
  category: SupportCategory;
  message: string;
  userName?: string;
  pagePath?: string;
}

export const createSupportToken = (input: CreateSupportTokenInput) =>
  invokeSupportTokens<{ success: boolean; tokenNo: number; id: string; whatsappSent: boolean }>("create", {
    ...input,
  });

const PHONE_KEY = "ezzyerp-support-phone";

export function rememberedSupportPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberSupportPhone(phone: string): void {
  try {
    localStorage.setItem(PHONE_KEY, phone);
  } catch {
    /* private mode */
  }
}
