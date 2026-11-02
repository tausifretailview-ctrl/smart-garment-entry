import { supabase } from "@/integrations/supabase/client";
import { amazonPushQty, cleanSellerSku, effectiveBuffer, parseSkuBarcodeLines } from "../../supabase/functions/_shared/amazonSpApi";

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
  variant_id: string | null;
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
      "id, seller_sku, variant_id, product_id, color, size, barcode, buffer_qty, active, needs_push, last_stock_qty, last_pushed_qty, last_pushed_at, last_error, products(product_name)",
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

/* ---------- Without the API: stock file, report upload ---------- */

type VariantRow = {
  id: string;
  product_id: string;
  color: string | null;
  size: string;
  stock_qty: number;
  barcode: string | null;
  active: boolean | null;
  pur_price: number | null;
};

const groupKey = (productId: string, color: string | null, size: string) => `${productId}|${color ?? "\u0000"}|${size}`;

async function fetchVariantsFor(orgId: string, productIds: string[]): Promise<VariantRow[]> {
  const out: VariantRow[] = [];
  const ids = [...new Set(productIds)];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, product_id, color, size, stock_qty, barcode, active, pur_price")
      .eq("organization_id", orgId)
      .in("product_id", ids.slice(i, i + 100))
      .is("deleted_at", null);
    if (error) throw error;
    out.push(...((data ?? []) as VariantRow[]));
  }
  return out;
}

/** Quantity to give Amazon for every active linked SKU (stock of the size minus buffer). */
export async function fetchAmazonStockRows(orgId: string, defaultBuffer: number): Promise<{ sku: string; quantity: number }[]> {
  const maps = (await fetchAmazonSkuMap(orgId)).filter((m) => m.active);
  const variants = await fetchVariantsFor(orgId, maps.map((m) => m.product_id));
  const stock = new Map<string, number>();
  for (const v of variants) {
    if (v.active === false) continue;
    const k = groupKey(v.product_id, v.color ?? null, v.size);
    stock.set(k, (stock.get(k) ?? 0) + (Number(v.stock_qty) || 0));
  }
  return maps.map((m) => ({
    sku: m.seller_sku,
    quantity: amazonPushQty(stock.get(groupKey(m.product_id, m.color, m.size)) ?? 0, effectiveBuffer(m.buffer_qty, defaultBuffer)),
  }));
}

export type AmazonImportedLine = {
  id: string;
  kind: "order" | "return";
  amazon_order_id: string;
  line_key: string;
  seller_sku: string;
  quantity: number;
  amount: number | null;
  order_date: string | null;
  sale_id: string | null;
  sale_number: string | null;
  status: "done" | "pending" | "received" | "damaged";
  reason: string | null;
  created_at: string;
};

export async function fetchImportedLineKeys(orgId: string, kind: "order" | "return", keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await table("amazon_imported_lines")
      .select("line_key")
      .eq("organization_id", orgId)
      .eq("kind", kind)
      .in("line_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as { line_key: string }[]) found.add(r.line_key);
  }
  return found;
}

export async function fetchAmazonReturns(orgId: string): Promise<AmazonImportedLine[]> {
  const { data, error } = await table("amazon_imported_lines")
    .select("id, kind, amazon_order_id, line_key, seller_sku, quantity, amount, order_date, sale_id, sale_number, status, reason, created_at")
    .eq("organization_id", orgId)
    .eq("kind", "return")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AmazonImportedLine[];
}

/** Ezzy bill numbers already made for these Amazon orders. */
export async function fetchBillsForOrders(orgId: string, orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(orderIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await table("amazon_imported_lines")
      .select("amazon_order_id, sale_number")
      .eq("organization_id", orgId)
      .eq("kind", "order")
      .in("amazon_order_id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as { amazon_order_id: string; sale_number: string | null }[]) {
      if (r.sale_number) out.set(r.amazon_order_id, r.sale_number);
    }
  }
  return out;
}

export async function saveImportedLines(rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await table("amazon_imported_lines").upsert(rows.slice(i, i + 200), {
      onConflict: "organization_id,kind,line_key",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
}

export async function setReturnStatus(id: string, status: "pending" | "received" | "damaged"): Promise<void> {
  const { error } = await table("amazon_imported_lines").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** The one customer every Amazon bill goes to (made on first use). */
export async function ensureAmazonCustomer(orgId: string): Promise<{ id: string; name: string }> {
  const name = "Amazon Customer";
  const { data: found, error } = await supabase
    .from("customers")
    .select("id, customer_name")
    .eq("organization_id", orgId)
    .ilike("customer_name", name)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  if (found && found.length > 0) return { id: found[0].id, name: found[0].customer_name };
  const { data: made, error: makeError } = await supabase
    .from("customers")
    .insert({ organization_id: orgId, customer_name: name })
    .select("id, customer_name")
    .single();
  if (makeError) throw makeError;
  return { id: made.id, name: made.customer_name };
}

export type BillLineInput = {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color?: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
};

/**
 * Bill lines for one Amazon order: each SKU's product + colour + size, sold from the barcode
 * of that size with the most stock. Lines whose SKU is not linked come back in `missing`.
 */
export async function buildAmazonBillLines(
  orgId: string,
  lines: { sku: string; quantity: number; amount: number }[],
  maps: AmazonSkuMapRow[],
): Promise<{ items: BillLineInput[]; missing: string[] }> {
  const bySku = new Map(maps.filter((m) => m.active).map((m) => [m.seller_sku.toUpperCase(), m]));
  const needed = lines.map((l) => bySku.get(l.sku.toUpperCase())).filter(Boolean) as AmazonSkuMapRow[];
  const productIds = [...new Set(needed.map((m) => m.product_id))];
  const variants = productIds.length ? await fetchVariantsFor(orgId, productIds) : [];
  const products = new Map<string, { product_name: string; gst: number; hsn: string | null; cost: number }>();
  for (let i = 0; i < productIds.length; i += 100) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, gst_per, sale_gst_percent, hsn_code, default_pur_price")
      .in("id", productIds.slice(i, i + 100));
    if (error) throw error;
    for (const p of data ?? []) {
      products.set(p.id, {
        product_name: p.product_name,
        gst: Number(p.sale_gst_percent ?? p.gst_per ?? 0) || 0,
        hsn: p.hsn_code ?? null,
        cost: Number(p.default_pur_price ?? 0) || 0,
      });
    }
  }
  const items: BillLineInput[] = [];
  const missing: string[] = [];
  for (const l of lines) {
    const m = bySku.get(l.sku.toUpperCase());
    if (!m) {
      missing.push(l.sku);
      continue;
    }
    const group = variants.filter(
      (v) => v.product_id === m.product_id && v.size === m.size && (v.color ?? null) === (m.color ?? null) && v.active !== false,
    );
    group.sort((a, b) => (Number(b.stock_qty) || 0) - (Number(a.stock_qty) || 0));
    const v = group[0] ?? variants.find((x) => x.id === m.variant_id);
    const p = products.get(m.product_id);
    if (!v || !p) {
      missing.push(l.sku);
      continue;
    }
    const net = Math.round((Number(l.amount) || 0) * 100) / 100;
    items.push({
      id: `amazon-${v.id}-${items.length}`,
      barcode: v.barcode ?? m.barcode ?? "",
      productName: p.product_name,
      size: v.size,
      color: v.color ?? undefined,
      quantity: l.quantity,
      mrp: Math.round((net / l.quantity) * 100) / 100,
      gstPer: p.gst,
      discountPercent: 0,
      discountAmount: 0,
      unitCost: Number(v.pur_price ?? 0) || p.cost,
      netAmount: net,
      productId: m.product_id,
      variantId: v.id,
      hsnCode: p.hsn ?? undefined,
    });
  }
  return { items, missing };
}
