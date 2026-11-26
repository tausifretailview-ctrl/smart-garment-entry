import type { SupabaseClient } from "@supabase/supabase-js";
import { istCalendarYmd } from "@/lib/localDayBounds";

/**
 * Spin & Win: a reward wheel the customer spins from the POS bill's WhatsApp link.
 * Sales → Spin & Win sets the campaign and the prizes; /spin/<bill id> is the customer's page;
 * POS takes the prize code. Database: supabase/migrations/20270530120000_spin_and_win.sql.
 */

export type SpinPrizeType = "gift_item" | "discount_percent" | "discount_amount" | "better_luck";

export const SPIN_PRIZE_TYPES: Array<{ value: SpinPrizeType; label: string; hint: string }> = [
  { value: "gift_item", label: "Gift item", hint: "A product free on the next bill" },
  { value: "discount_percent", label: "Discount %", hint: "% off the next bill, up to a maximum ₹" },
  { value: "discount_amount", label: "Discount ₹", hint: "A fixed amount off the next bill" },
  { value: "better_luck", label: "Better luck", hint: "No prize" },
];

/** Wheel colours, used in turn when a prize has none. */
export const SPIN_COLORS = ["#F97316", "#0EA5E9", "#22C55E", "#A855F7", "#EF4444", "#EAB308", "#14B8A6", "#EC4899"];

export type SpinCampaign = {
  id?: string;
  organization_id?: string;
  enabled: boolean;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  pos_only: boolean;
  min_bill_amount: number;
  link_valid_days: number;
  code_valid_days: number;
  min_redeem_amount: number;
  terms: string | null;
};

export type SpinPrize = {
  id?: string;
  label: string;
  prize_type: SpinPrizeType;
  value: number;
  max_discount: number | null;
  product_id: string | null;
  variant_id: string | null;
  /** Shown in the set-up page only (product · size · barcode). */
  product_label?: string | null;
  weight: number;
  stock_total: number | null;
  stock_per_day: number | null;
  won_count?: number;
  color: string | null;
  sort_order: number;
  active: boolean;
};

export type SpinResultRow = {
  id: string;
  created_at: string;
  sale_number: string | null;
  customer_name: string | null;
  prize_label: string;
  prize_type: string;
  code: string | null;
  status: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_sale_id: string | null;
};

export const DEFAULT_SPIN_CAMPAIGN: SpinCampaign = {
  enabled: false,
  title: "Spin & Win",
  starts_on: null,
  ends_on: null,
  pos_only: true,
  min_bill_amount: 0,
  link_valid_days: 3,
  code_valid_days: 30,
  min_redeem_amount: 0,
  terms: "One spin per bill. Show the code at the counter on your next bill. Not valid with other offers.",
};

/** A first wheel the owner edits: four slices. */
export function starterSpinPrizes(): SpinPrize[] {
  return [
    { label: "10% OFF", prize_type: "discount_percent", value: 10, max_discount: 200, product_id: null, variant_id: null, weight: 30, stock_total: null, stock_per_day: null, color: SPIN_COLORS[0], sort_order: 0, active: true },
    { label: "₹100 OFF", prize_type: "discount_amount", value: 100, max_discount: null, product_id: null, variant_id: null, weight: 20, stock_total: null, stock_per_day: null, color: SPIN_COLORS[1], sort_order: 1, active: true },
    { label: "Free Gift", prize_type: "gift_item", value: 0, max_discount: null, product_id: null, variant_id: null, weight: 10, stock_total: 20, stock_per_day: 5, color: SPIN_COLORS[2], sort_order: 2, active: true },
    { label: "Better luck", prize_type: "better_luck", value: 0, max_discount: null, product_id: null, variant_id: null, weight: 40, stock_total: null, stock_per_day: null, color: SPIN_COLORS[3], sort_order: 3, active: true },
  ];
}

/** Chance of each active prize, in %, from its weight (out-of-stock not counted). */
export function spinChances(prizes: Pick<SpinPrize, "weight" | "active">[]): number[] {
  const total = prizes.reduce((s, p) => s + (p.active ? Math.max(0, p.weight || 0) : 0), 0);
  return prizes.map((p) => (total > 0 && p.active ? Math.round((Math.max(0, p.weight || 0) * 1000) / total) / 10 : 0));
}

/** Problems that stop the owner saving, or turning the wheel on. */
export function validateSpinSetup(campaign: SpinCampaign, prizes: SpinPrize[]): string[] {
  const out: string[] = [];
  const active = prizes.filter((p) => p.active);
  if (!campaign.title.trim()) out.push("Give the wheel a title.");
  if (campaign.starts_on && campaign.ends_on && campaign.ends_on < campaign.starts_on) out.push("End date is before the start date.");
  if (campaign.enabled && active.length < 2) out.push("Add at least 2 active prizes before turning Spin & Win on.");
  if (active.length > 12) out.push("At most 12 active prizes fit on the wheel.");
  if (campaign.enabled && !active.some((p) => p.weight > 0)) out.push("Give at least one prize a chance above 0.");
  prizes.forEach((p, i) => {
    const n = `Prize ${i + 1}`;
    if (!p.label.trim()) out.push(`${n}: name it.`);
    if (p.label.length > 40) out.push(`${n}: name is too long (40 letters at most).`);
    if (p.prize_type === "discount_percent" && !(p.value > 0 && p.value <= 100)) out.push(`${n}: discount % must be 1 to 100.`);
    if (p.prize_type === "discount_amount" && !(p.value > 0)) out.push(`${n}: enter the discount ₹.`);
    if (p.prize_type === "gift_item" && p.active && !p.variant_id) out.push(`${n}: pick the gift product.`);
    if (p.weight < 0 || p.weight > 1000) out.push(`${n}: chance must be 0 to 1000.`);
  });
  return out;
}

/** Text for one prize, as the customer and the cashier read it. */
export function spinPrizeDescription(p: { prize_type: string; value: number; max_discount?: number | null; label: string }): string {
  switch (p.prize_type) {
    case "discount_percent":
      return `${p.value}% off${p.max_discount ? ` (up to ₹${p.max_discount})` : ""}`;
    case "discount_amount":
      return `₹${p.value} off`;
    case "gift_item":
      return p.label;
    default:
      return p.label;
  }
}

// ── Wheel geometry ────────────────────────────────────────────────────────────

/** Rotation (deg, clockwise) that brings slice `index` of `count` under the top pointer. */
export function spinTargetRotation(index: number, count: number, fullTurns = 6): number {
  const slice = 360 / Math.max(1, count);
  return fullTurns * 360 + (360 - (index * slice + slice / 2));
}

// ── Data ──────────────────────────────────────────────────────────────────────

type DbError = { code?: string; message?: string } | null;

/** The SQL (file 57) has not been run yet. */
export function isSpinSchemaMissing(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202") return true;
  return /spin_(campaigns|prizes|results)|get_public_spin|spin_for_sale|check_spin_code/i.test(String(err.message || "")) &&
    /does not exist|schema cache|could not find/i.test(String(err.message || ""));
}

export async function loadSpinSetup(client: SupabaseClient, orgId: string): Promise<{ campaign: SpinCampaign | null; prizes: SpinPrize[] }> {
  const { data: campaign, error } = await client.from("spin_campaigns").select("*").eq("organization_id", orgId).maybeSingle();
  if (error) throw error;
  if (!campaign) return { campaign: null, prizes: [] };
  const { data: prizes, error: pErr } = await client
    .from("spin_prizes")
    .select("*, product_variants(size, color, barcode, products(product_name))")
    .eq("campaign_id", (campaign as { id: string }).id)
    .order("sort_order")
    .order("created_at");
  if (pErr) throw pErr;
  type Row = SpinPrize & {
    product_variants?: { size?: string | null; color?: string | null; barcode?: string | null; products?: { product_name?: string | null } | null } | null;
  };
  return {
    campaign: campaign as SpinCampaign,
    prizes: ((prizes ?? []) as Row[]).map(({ product_variants: v, ...p }) => ({
      ...p,
      value: Number(p.value) || 0,
      max_discount: p.max_discount == null ? null : Number(p.max_discount),
      product_label: v ? [v.products?.product_name, v.size, v.color, v.barcode].filter(Boolean).join(" · ") : null,
    })),
  };
}

/** Save the campaign and its prizes: new rows added, changed rows updated, removed rows deleted. */
export async function saveSpinSetup(
  client: SupabaseClient,
  orgId: string,
  campaign: SpinCampaign,
  prizes: SpinPrize[],
  removedPrizeIds: string[],
): Promise<string> {
  const row = {
    organization_id: orgId,
    enabled: campaign.enabled,
    title: campaign.title.trim(),
    starts_on: campaign.starts_on || null,
    ends_on: campaign.ends_on || null,
    pos_only: campaign.pos_only,
    min_bill_amount: Number(campaign.min_bill_amount) || 0,
    link_valid_days: Number(campaign.link_valid_days) || 3,
    code_valid_days: Number(campaign.code_valid_days) || 30,
    min_redeem_amount: Number(campaign.min_redeem_amount) || 0,
    terms: campaign.terms?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await client
    .from("spin_campaigns")
    .upsert(row as never, { onConflict: "organization_id" })
    .select("id")
    .single();
  if (error) throw error;
  const campaignId = (saved as { id: string }).id;

  for (const id of removedPrizeIds) {
    const { error: dErr } = await client.from("spin_prizes").delete().eq("campaign_id", campaignId).eq("id", id);
    if (dErr) throw dErr;
  }
  for (const [i, p] of prizes.entries()) {
    const prizeRow = {
      organization_id: orgId,
      campaign_id: campaignId,
      label: p.label.trim(),
      prize_type: p.prize_type,
      value: p.prize_type === "gift_item" || p.prize_type === "better_luck" ? 0 : Number(p.value) || 0,
      max_discount: p.prize_type === "discount_percent" && p.max_discount ? Number(p.max_discount) : null,
      product_id: p.prize_type === "gift_item" ? p.product_id : null,
      variant_id: p.prize_type === "gift_item" ? p.variant_id : null,
      weight: Math.max(0, Math.round(Number(p.weight) || 0)),
      stock_total: p.stock_total == null || (p.stock_total as unknown) === "" ? null : Math.max(0, Math.round(Number(p.stock_total))),
      stock_per_day: p.stock_per_day == null || (p.stock_per_day as unknown) === "" ? null : Math.max(0, Math.round(Number(p.stock_per_day))),
      color: p.color || SPIN_COLORS[i % SPIN_COLORS.length],
      sort_order: i,
      active: p.active,
    };
    const { error: pErr } = p.id
      ? await client.from("spin_prizes").update(prizeRow as never).eq("id", p.id)
      : await client.from("spin_prizes").insert(prizeRow as never);
    if (pErr) throw pErr;
  }
  return campaignId;
}

export async function loadRecentSpins(client: SupabaseClient, orgId: string, limit = 50): Promise<SpinResultRow[]> {
  const { data, error } = await client
    .from("spin_results")
    .select("id, created_at, sale_number, customer_name, prize_label, prize_type, code, status, expires_at, redeemed_at, redeemed_sale_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SpinResultRow[];
}

/** Public link for a bill's spin (same unguessable bill id as the online invoice). */
export function spinLinkForSale(saleId: string, origin = "https://app.inventoryshop.in"): string {
  return `${origin.replace(/\/$/, "")}/spin/${saleId}`;
}

// ── Public spin page (/spin/<bill id>) ────────────────────────────────────────

export type PublicSpinResult = {
  prize_id: string | null;
  label: string;
  type: string;
  value: number;
  max_discount: number | null;
  code: string | null;
  expires_at: string | null;
  status: string;
};

export type PublicSpinView = {
  shopName: string;
  logoUrl: string | null;
  title: string;
  terms: string | null;
  saleNumber: string;
  prizes: Array<{ id: string; label: string; color: string | null }>;
  result: PublicSpinResult | null;
  blocked: string | null;
};

function toResult(r: Record<string, unknown> | null | undefined): PublicSpinResult | null {
  if (!r || typeof r !== "object" || !r.label) return null;
  return {
    prize_id: (r.prize_id as string) ?? null,
    label: String(r.label),
    type: String(r.type ?? ""),
    value: Number(r.value) || 0,
    max_discount: r.max_discount == null ? null : Number(r.max_discount),
    code: (r.code as string) ?? null,
    expires_at: (r.expires_at as string) ?? null,
    status: String(r.status ?? ""),
  };
}

export function parsePublicSpin(data: unknown): PublicSpinView | { error: string } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) return { error: String(d.error || "This link is not valid.") };
  const prizes = Array.isArray(d.prizes) ? (d.prizes as Array<Record<string, unknown>>) : [];
  return {
    shopName: String(d.shop_name || ""),
    logoUrl: typeof d.logo_url === "string" && /^https?:\/\//i.test(d.logo_url) ? d.logo_url : null,
    title: String(d.title || "Spin & Win"),
    terms: (d.terms as string) || null,
    saleNumber: String(d.sale_number || ""),
    prizes: prizes.map((p) => ({ id: String(p.id), label: String(p.label || ""), color: (p.color as string) || null })),
    result: toResult(d.result as Record<string, unknown>),
    blocked: (d.blocked as string) || null,
  };
}

export function parseSpinOutcome(data: unknown): PublicSpinResult | { error: string } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) return { error: String(d.error || "Could not spin. Please try again.") };
  return toResult(d) ?? { error: "Could not spin. Please try again." };
}

// ── WhatsApp bill message ─────────────────────────────────────────────────────

type CampaignForLink = Pick<SpinCampaign, "enabled" | "starts_on" | "ends_on" | "pos_only" | "min_bill_amount">;

/** Public origin for links in WhatsApp (the web app, also from the desktop / Android app). */
export function publicAppOrigin(): string {
  if (typeof window !== "undefined" && /^https:\/\//.test(window.location.origin) && !/localhost|127\.0\.0\.1/.test(window.location.origin)) {
    return window.location.origin;
  }
  return "https://app.inventoryshop.in";
}

/**
 * The spin link for a just-saved bill, or "" when the bill does not get a spin (campaign off,
 * outside its dates, not a POS bill when POS-only, below the minimum amount). The database
 * checks the same again when the customer spins.
 */
export function spinLinkForBill(
  campaign: CampaignForLink | null | undefined,
  sale: { sale_id?: unknown; net_amount?: unknown; sale_number?: unknown; bill_context?: unknown; sale_type?: unknown },
  today: string = istCalendarYmd(),
  origin: string = publicAppOrigin(),
): string {
  const saleId = String(sale.sale_id || "");
  if (!campaign?.enabled || !saleId) return "";
  if (campaign.starts_on && today < campaign.starts_on) return "";
  if (campaign.ends_on && today > campaign.ends_on) return "";
  const isPos =
    String(sale.bill_context || "") === "pos" ||
    String(sale.sale_type || "").toLowerCase() === "pos" ||
    /^POS\//i.test(String(sale.sale_number || ""));
  if (campaign.pos_only && !isPos) return "";
  if ((Number(sale.net_amount) || 0) < (Number(campaign.min_bill_amount) || 0)) return "";
  return spinLinkForSale(saleId, origin);
}

/** Adds the Spin & Win line under the bill message (unless the shop's template places {spin_link}). */
export function appendSpinLinkLine(message: string, link: string): string {
  if (!link || message.includes(link)) return message;
  return `${message.trimEnd()}\n\n🎡 *Spin & Win!* Spin the wheel for your gift:\n${link}`;
}

/** The shop's campaign rules for the WhatsApp link; null when none (or before SQL 57). */
export async function fetchSpinCampaignForLink(client: SupabaseClient, orgId: string): Promise<CampaignForLink | null> {
  try {
    const { data, error } = await client
      .from("spin_campaigns")
      .select("enabled, starts_on, ends_on, pos_only, min_bill_amount")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) return null;
    return (data as CampaignForLink | null) ?? null;
  } catch {
    return null;
  }
}

// ── Prize codes (POS / Spin & Win page) ───────────────────────────────────────

export type SpinCodeCheck =
  | {
      ok: true;
      code: string;
      label: string;
      type: SpinPrizeType;
      value: number;
      max_discount: number | null;
      product_id: string | null;
      variant_id: string | null;
      min_redeem_amount: number;
      expires_at: string | null;
      won_on_sale: string | null;
      customer_name: string | null;
    }
  | { ok: false; error: string };

export function normalizeSpinCode(raw: string): string {
  const t = String(raw || "").toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  return t.startsWith("SW-") ? t : `SW-${t.replace(/^SW/, "")}`;
}

export async function checkSpinCode(client: SupabaseClient, orgId: string, raw: string): Promise<SpinCodeCheck> {
  const code = normalizeSpinCode(raw);
  if (!code) return { ok: false, error: "Type the prize code." };
  const { data, error } = await client.rpc("check_spin_code", { p_org: orgId, p_code: code });
  if (error) return { ok: false, error: isSpinSchemaMissing(error) ? "Spin & Win is not set up yet." : error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) return { ok: false, error: String(d.error || "Code not valid.") };
  return {
    ok: true,
    code: String(d.code),
    label: String(d.label || ""),
    type: String(d.type) as SpinPrizeType,
    value: Number(d.value) || 0,
    max_discount: d.max_discount == null ? null : Number(d.max_discount),
    product_id: (d.product_id as string) ?? null,
    variant_id: (d.variant_id as string) ?? null,
    min_redeem_amount: Number(d.min_redeem_amount) || 0,
    expires_at: (d.expires_at as string) ?? null,
    won_on_sale: (d.won_on_sale as string) ?? null,
    customer_name: (d.customer_name as string) ?? null,
  };
}

/** Discount ₹ a prize gives on a bill of `billAmount` (gift items: 0, added as a free line). */
export function spinDiscountForBill(prize: { type: string; value: number; max_discount: number | null }, billAmount: number): number {
  const amt = Math.max(0, Number(billAmount) || 0);
  if (prize.type === "discount_amount") return Math.min(amt, prize.value);
  if (prize.type === "discount_percent") {
    const d = Math.round(((amt * prize.value) / 100) * 100) / 100;
    return prize.max_discount ? Math.min(d, prize.max_discount) : d;
  }
  return 0;
}

export async function redeemSpinCode(client: SupabaseClient, orgId: string, code: string, saleId: string): Promise<boolean> {
  const { data, error } = await client.rpc("redeem_spin_code", { p_org: orgId, p_code: normalizeSpinCode(code), p_sale_id: saleId });
  if (error) throw error;
  return data === true;
}

/** A prize code typed or scanned into the POS search box (SW-7K3QX / sw7k3qx). */
export function looksLikeSpinCode(raw: string): boolean {
  const t = String(raw || "").trim();
  // With the hyphen always; without it only when the code has a digit, so a product search
  // such as "SWEATER" is never taken for a code.
  if (/^SW-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/i.test(t)) return true;
  return /^SW[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/i.test(t) && /\d/.test(t);
}
