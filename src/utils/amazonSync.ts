import { supabase } from "@/integrations/supabase/client";
import { cleanSellerSku, parseSkuBarcodeLines } from "../../supabase/functions/_shared/amazonSpApi";

/** Platform Admin feature that shows the Amazon Sync page for a shop. */
export const AMAZON_SYNC_FEATURE = "amazon_sync";

export type AmazonChannelSettings = {
  organization_id: string;
  enabled: boolean;
  seller_id: string | null;
  marketplace_id: string;
  default_buffer: number;
  has_keys: boolean;
  last_sync_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_message: string | null;
};

export type AmazonSkuMapRow = {
  id: string;
  seller_sku: string;
  product_id: string;
  color: string | null;
  size: string;
  barcode: string | null;
  buffer_qty: number | null;
  active: boolean;
  needs_push: boolean;
  last_stock_qty: number | null;
  last_pushed_qty: number | null;
  last_pushed_at: string | null;
  last_error: string | null;
  product_name: string;
};

export function isMissingAmazonSql(message: string | undefined | null): boolean {
  return /amazon_(channel_settings|sku_map|channel_secrets)|does not exist|schema cache/i.test(message || "");
}

// New tables: not in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name as any) as any;

export async function fetchAmazonSettings(orgId: string): Promise<AmazonChannelSettings | null> {
  const { data, error } = await table("amazon_channel_settings")
    .select("organization_id, enabled, seller_id, marketplace_id, default_buffer, has_keys, last_sync_at, last_sync_ok, last_sync_message")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as AmazonChannelSettings | null) ?? null;
}

export async function saveAmazonSettings(
  orgId: string,
  patch: Partial<Pick<AmazonChannelSettings, "enabled" | "seller_id" | "default_buffer">>,
): Promise<void> {
  const { error } = await table("amazon_channel_settings").upsert({
    organization_id: orgId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchAmazonSkuMap(orgId: string): Promise<AmazonSkuMapRow[]> {
  const { data, error } = await table("amazon_sku_map")
    .select(
      "id, seller_sku, product_id, color, size, barcode, buffer_qty, active, needs_push, last_stock_qty, last_pushed_qty, last_pushed_at, last_error, products(product_name)",
    )
    .eq("organization_id", orgId)
    .order("seller_sku", { ascending: true })
    .limit(2000);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ ...r, product_name: r.products?.product_name ?? "" })) as AmazonSkuMapRow[];
}

export type AddMappingsResult = { added: number; notFound: string[]; duplicate: string[]; error?: string };

/**
 * Adds Amazon SKU -> barcode links. The barcode only picks the product + colour + size;
 * stock is summed over every barcode of that size (per-piece barcodes included).
 */
export async function addAmazonMappings(
  orgId: string,
  pairs: { sku: string; barcode: string; buffer?: number | null }[],
  userId: string | null,
): Promise<AddMappingsResult> {
  const clean = pairs
    .map((p) => ({ sku: cleanSellerSku(p.sku || p.barcode), barcode: String(p.barcode ?? "").trim(), buffer: p.buffer ?? null }))
    .filter((p) => p.sku && p.barcode);
  const result: AddMappingsResult = { added: 0, notFound: [], duplicate: [] };
  if (clean.length === 0) return result;

  const barcodes = [...new Set(clean.map((p) => p.barcode))];
  const found = new Map<string, { id: string; product_id: string; color: string | null; size: string }>();
  for (let i = 0; i < barcodes.length; i += 200) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, product_id, color, size, barcode")
      .eq("organization_id", orgId)
      .in("barcode", barcodes.slice(i, i + 200))
      .is("deleted_at", null);
    if (error) return { ...result, error: error.message };
    for (const v of data ?? []) if (v.barcode && !found.has(v.barcode)) found.set(v.barcode, v);
  }

  const { data: existing, error: existingError } = await table("amazon_sku_map").select("seller_sku").eq("organization_id", orgId).limit(5000);
  if (existingError) return { ...result, error: existingError.message };
  const taken = new Set(((existing ?? []) as { seller_sku: string }[]).map((r) => r.seller_sku.toUpperCase()));

  const rows: Record<string, unknown>[] = [];
  for (const p of clean) {
    const v = found.get(p.barcode);
    if (!v) {
      result.notFound.push(p.barcode);
      continue;
    }
    if (taken.has(p.sku.toUpperCase())) {
      result.duplicate.push(p.sku);
      continue;
    }
    taken.add(p.sku.toUpperCase());
    rows.push({
      organization_id: orgId,
      seller_sku: p.sku,
      variant_id: v.id,
      product_id: v.product_id,
      color: v.color ?? null,
      size: v.size,
      barcode: p.barcode,
      buffer_qty: p.buffer === null || p.buffer === undefined || Number.isNaN(Number(p.buffer)) ? null : Math.max(0, Math.floor(Number(p.buffer))),
      created_by: userId,
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await table("amazon_sku_map").insert(rows.slice(i, i + 200));
    if (error) return { ...result, error: error.message };
    result.added += Math.min(200, rows.length - i);
  }
  return result;
}

export { parseSkuBarcodeLines };

export async function updateAmazonMapping(id: string, patch: { buffer_qty?: number | null; active?: boolean }): Promise<void> {
  const { error } = await table("amazon_sku_map")
    .update({ ...patch, needs_push: true, stock_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAmazonMapping(id: string): Promise<void> {
  const { error } = await table("amazon_sku_map").delete().eq("id", id);
  if (error) throw error;
}

export type AmazonSyncReply = { success: boolean; message?: string; error?: string; code?: string };

export async function callAmazonSync(body: Record<string, unknown>): Promise<AmazonSyncReply> {
  const { data, error } = await supabase.functions.invoke("amazon-sync", { body });
  if (error) {
    // Non-2xx replies still carry our JSON body.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed && typeof parsed === "object") return parsed as AmazonSyncReply;
      } catch {
        /* fall through */
      }
    }
    return { success: false, error: error.message || "Could not reach the Amazon sync service. Was the amazon-sync function deployed?" };
  }
  return (data ?? { success: false, error: "No reply" }) as AmazonSyncReply;
}

/** Status word for one SKU row. */
export function amazonRowStatus(r: Pick<AmazonSkuMapRow, "active" | "needs_push" | "last_error" | "last_pushed_at">): "off" | "error" | "waiting" | "sent" {
  if (!r.active) return "off";
  if (r.last_error) return "error";
  if (r.needs_push || !r.last_pushed_at) return "waiting";
  return "sent";
}
