import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isMissingRpcFunctionError } from "@/utils/fetchAllRows";

/**
 * Warning after a price change (user's choice, Nov 2026): a price changed in this shop is NOT
 * copied to a shop that already received the item by Stock Transfer. After saving prices, the
 * screen asks the database which of the saved items another shop still stocks at a different
 * price, and lists them so the user can change them there. Nothing is changed or blocked.
 */
export const TRANSFERRED_PRICE_GAPS_RPC = "get_transferred_price_gaps" as const;

/** The database answers for at most this many items per call. */
const IDS_PER_CALL = 1000;

export type TransferredPriceGap = {
  variant_id: string;
  barcode: string | null;
  product_name: string | null;
  size: string | null;
  sender_sale_price: number | string | null;
  to_shop: string | null;
  receiver_sale_price: number | string | null;
  receiver_stock: number | string | null;
  transfer_number: string | null;
  accepted_at: string | null;
};

/** Set once the database answers that the function is not applied yet. */
let gapsRpcMissing = false;

/** Test hook: forget a previous "function missing" answer. */
export function resetTransferredPriceGapsProbe(): void {
  gapsRpcMissing = false;
}

/** Items another shop still sells at a different price. Never throws (no warning on failure). */
export async function fetchTransferredPriceGaps(
  client: SupabaseClient,
  organizationId: string,
  variantIds: readonly (string | null | undefined)[],
): Promise<TransferredPriceGap[]> {
  const ids = [...new Set(variantIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (gapsRpcMissing || !organizationId || ids.length === 0) return [];
  const out: TransferredPriceGap[] = [];
  try {
    for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
      const { data, error } = await client.rpc(TRANSFERRED_PRICE_GAPS_RPC, {
        p_org_id: organizationId,
        p_variant_ids: ids.slice(i, i + IDS_PER_CALL),
      });
      if (error) {
        if (isMissingRpcFunctionError(error)) gapsRpcMissing = true;
        return [];
      }
      if (Array.isArray(data)) out.push(...(data as TransferredPriceGap[]));
    }
  } catch {
    return [];
  }
  return out;
}

const rupees = (v: unknown) => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;

/** Most items named in the warning; the rest are counted. */
export const TRANSFERRED_PRICE_WARNING_MAX_LINES = 5;

/** Warning text, or null when there is nothing to warn about. */
export function formatTransferredPriceWarning(
  gaps: readonly TransferredPriceGap[],
): { title: string; description: string } | null {
  if (gaps.length === 0) return null;
  const shops = [...new Set(gaps.map((g) => (g.to_shop || "the other shop").trim()))];
  const lines = gaps.slice(0, TRANSFERRED_PRICE_WARNING_MAX_LINES).map((g) => {
    const name = [g.product_name, g.size].filter(Boolean).join(" ");
    const code = g.barcode ? ` (${g.barcode})` : "";
    return `${name}${code}: ${g.to_shop || "other shop"} sells at ${rupees(g.receiver_sale_price)}, here ${rupees(g.sender_sale_price)}`;
  });
  const more = gaps.length - lines.length;
  if (more > 0) lines.push(`and ${more} more`);
  const where = shops.length === 1 ? shops[0] : `${shops.length} other shops`;
  return {
    title: `${gaps.length} item(s) were sent to ${where} at the old price`,
    description: `${lines.join("\n")}\nThe price there did not change. Update it in that shop if it should match.`,
  };
}

/**
 * Call after prices were saved (fire and forget). Shows a warning when another shop still sells
 * some of these items at a different price; does nothing otherwise or on any error.
 */
export async function warnTransferredPriceGaps(
  organizationId: string | null | undefined,
  variantIds: readonly (string | null | undefined)[],
  client: SupabaseClient = supabase as unknown as SupabaseClient,
): Promise<number> {
  if (!organizationId) return 0;
  const gaps = await fetchTransferredPriceGaps(client, organizationId, variantIds);
  const text = formatTransferredPriceWarning(gaps);
  if (text) {
    toast.warning(text.title, {
      description: text.description,
      duration: 20_000,
      descriptionClassName: "whitespace-pre-line",
    });
  }
  return gaps.length;
}
