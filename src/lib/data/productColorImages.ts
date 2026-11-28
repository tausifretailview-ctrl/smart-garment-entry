/**
 * Colour-wise product photos (Nov 2026, migration 20270614120000): Product Master → Photos.
 * One photo per product and colour (not per size or MRP); Field Sales shows it while booking.
 * Files go to the "product-images" bucket under <organization_id>/<product_id>/.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import { isUsableImageUrl } from "@/lib/productImages";
import { bestEffortWrite } from "@/lib/rollbackStep";

export type ColorCard = {
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  color: string;
  image_url: string | null;
  product_image_url: string | null;
  sizes: string | null;
  stock_qty: number;
};

export type ColorCardPage = { cards: ColorCard[]; total: number; all: number; withPhoto: number };

type DbError = { code?: string; message?: string } | null;

export function isMissingColorPhotoSql(err: DbError): boolean {
  if (!err) return false;
  if (["PGRST202", "42883", "42P01", "PGRST205"].includes(String(err.code))) return true;
  return /get_product_color_cards|product_color_images/i.test(String(err.message || "")) &&
    /does not exist|schema cache|not find/i.test(String(err.message || ""));
}

/** Same product and colour, whatever the case and spaces. */
export const colorKey = (productId: string, color: string | null | undefined) =>
  `${productId}|${String(color ?? "").trim().toLowerCase()}`;

export type PhotoFilter = "all" | "missing" | "with";

export type ColorCardFilters = {
  search?: string;
  /** Exact brand / category / colour (case ignored); empty = any. Needs SQL 78. */
  brand?: string;
  category?: string;
  color?: string;
  photo?: PhotoFilter;
  limit?: number;
  offset?: number;
};

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: DbError }>;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as unknown as Rpc)(fn, args);

/** Set once a call with the SQL 78 filters was refused: later calls use the SQL 77 form. */
let filtersMissing = false;
export const colorCardFiltersAvailable = () => !filtersMissing;

/** null before SQL 77 is run. Before SQL 78, brand / category / colour / "with photo" are ignored. */
export async function fetchColorCards(orgId: string, opts: ColorCardFilters = {}): Promise<ColorCardPage | null> {
  const base = {
    p_org_id: orgId,
    p_search: opts.search?.trim() || null,
    p_only_missing: opts.photo === "missing",
    p_limit: opts.limit ?? 60,
    p_offset: opts.offset ?? 0,
  };
  const wantsFilters = !!(opts.brand || opts.category || opts.color || opts.photo === "with");
  let { data, error } =
    wantsFilters && !filtersMissing
      ? await rpc("get_product_color_cards", {
          ...base,
          p_brand: opts.brand || null,
          p_category: opts.category || null,
          p_color: opts.color || null,
          p_photo: opts.photo ?? "all",
        })
      : await rpc("get_product_color_cards", base);
  if (error && wantsFilters && !filtersMissing && ["PGRST202", "42883"].includes(String(error.code))) {
    filtersMissing = true;
    ({ data, error } = await rpc("get_product_color_cards", base));
  }
  if (error) {
    if (isMissingColorPhotoSql(error)) return null;
    throw new Error(error.message || "Could not load products");
  }
  const rows = data ?? [];
  const first = rows[0];
  return {
    cards: rows.map((r) => ({
      product_id: String(r.product_id),
      product_name: String(r.product_name ?? ""),
      brand: (r.brand as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      style: (r.style as string | null) ?? null,
      color: String(r.color ?? ""),
      image_url: isUsableImageUrl(r.image_url) ? (r.image_url as string) : null,
      product_image_url: isUsableImageUrl(r.product_image_url) ? (r.product_image_url as string) : null,
      sizes: (r.sizes as string | null) ?? null,
      stock_qty: Number(r.stock_qty) || 0,
    })),
    total: Number(first?.total_count) || 0,
    all: Number(first?.all_count) || 0,
    withPhoto: Number(first?.with_photo_count) || 0,
  };
}

export type ColorFilterOptions = { brand: string[]; category: string[]; color: string[] };

/** Brands, categories and colours of the shop's cards (most cards first); null before SQL 78. */
export async function fetchColorFilterOptions(orgId: string): Promise<ColorFilterOptions | null> {
  const { data, error } = await rpc("get_product_color_filter_options", { p_org_id: orgId });
  if (error) {
    if (["PGRST202", "42883"].includes(String(error.code)) || /get_product_color_filter_options/i.test(String(error.message))) {
      filtersMissing = true;
      return null;
    }
    throw new Error(error.message || "Could not load filters");
  }
  const out: ColorFilterOptions = { brand: [], category: [], color: [] };
  const rows = [...(data ?? [])].sort((a, b) => (Number(b.cards) || 0) - (Number(a.cards) || 0) || String(a.value).localeCompare(String(b.value)));
  for (const r of rows) {
    const k = String(r.kind) as keyof ColorFilterOptions;
    if (k in out && r.value) out[k].push(String(r.value));
  }
  return out;
}

/** Tests only. */
export function resetColorCardFiltersForTests() {
  filtersMissing = false;
}

const MAX_SIDE = 1600;

/** Shrink a photo to at most 1600 px on its long side as JPEG (sharp on phones, quick to load). */
export async function prepareProductPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600_000 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

function storagePathFromUrl(url: string): string | null {
  const marker = "/product-images/";
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findRow(orgId: string, productId: string, color: string) {
  const { data, error } = await supabase
    .from("product_color_images" as never)
    .select("id, color, image_url")
    .eq("organization_id", orgId)
    .eq("product_id", productId)
    .ilike("color", escapeLike(color.trim()))
    .limit(1);
  if (error) {
    if (isMissingColorPhotoSql(error)) throw new Error("Run SQL 77 (colour photos) in the database first.");
    throw new Error(error.message || "Could not read the photo");
  }
  return ((data ?? []) as Array<{ id: string; color: string; image_url: string }>)[0] ?? null;
}

/** Add or replace the photo of one product colour. Returns the new photo URL. */
export async function saveColorPhoto(orgId: string, card: Pick<ColorCard, "product_id" | "color" | "product_image_url">, file: File): Promise<string> {
  const blob = await prepareProductPhoto(file);
  const slug = card.color.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo";
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${orgId}/${card.product_id}/colour-${slug}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("product-images")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000", upsert: false });
  if (upErr) throw new Error(upErr.message || "Photo not uploaded");
  const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;

  const existing = await findRow(orgId, card.product_id, card.color);
  const table = supabase.from("product_color_images" as never);
  const { error } = existing
    ? await table.update({ image_url: url, updated_at: new Date().toISOString() } as never).eq("id", existing.id)
    : await table.insert({ organization_id: orgId, product_id: card.product_id, color: card.color.trim(), image_url: url } as never);
  if (error) {
    void supabase.storage.from("product-images").remove([path]);
    if (isMissingColorPhotoSql(error)) throw new Error("Run SQL 77 (colour photos) in the database first.");
    throw new Error(error.message || "Photo not saved");
  }
  if (existing) {
    const old = storagePathFromUrl(existing.image_url);
    if (old) void supabase.storage.from("product-images").remove([old]);
  }
  // Screens that show one photo per product (catalogue, reports) get the first colour photo.
  // Best effort: the colour photo is already saved.
  if (!card.product_image_url) {
    await bestEffortWrite(
      "product-color-photo:main-photo",
      () =>
        supabase
          .from("products")
          .update({ image_url: url })
          .eq("id", card.product_id)
          .eq("organization_id", orgId)
          .is("image_url", null),
      { organizationId: orgId, recordId: card.product_id },
    );
  }
  return url;
}

export async function removeColorPhoto(orgId: string, card: Pick<ColorCard, "product_id" | "color">): Promise<void> {
  const existing = await findRow(orgId, card.product_id, card.color);
  if (!existing) return;
  const { error } = await supabase.from("product_color_images" as never).delete().eq("id", existing.id);
  if (error) throw new Error(error.message || "Photo not removed");
  const old = storagePathFromUrl(existing.image_url);
  if (old) void supabase.storage.from("product-images").remove([old]);
}

/** Colour photos of these products, keyed by colorKey(product, colour). Empty before SQL 77. */
export async function fetchColorImageMap(orgId: string, productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!orgId || productIds.length === 0) return out;
  try {
    const rows = await fetchInIdBatches<{ product_id: string; color: string; image_url: string }>(productIds, (batch) =>
      supabase
        .from("product_color_images" as never)
        .select("product_id, color, image_url")
        .eq("organization_id", orgId)
        .in("product_id", batch)
        .order("product_id") as never,
    );
    for (const r of rows) if (isUsableImageUrl(r.image_url)) out.set(colorKey(r.product_id, r.color), r.image_url);
  } catch {
    /* before SQL 77, or offline: products show their main photo */
  }
  return out;
}

// ── Bulk import: match photo file names to product colours ─────────────────────────────────

/** "rc_5001-Brown (1).JPG" → "RC 5001 BROWN 1". */
export function normalizeName(s: string): string {
  return s
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

const squash = (s: string) => normalizeName(s).replace(/ /g, "");

/**
 * Ways to read a file name as "<article> <colour>": the last 1, 2 or 3 words as the colour,
 * then the whole name with no colour. A trailing copy number ("(1)") is ignored.
 */
export function importNameGuesses(fileName: string): Array<{ article: string; color: string }> {
  const words = normalizeName(fileName).split(" ").filter(Boolean);
  while (words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1]) && words.length > 2) words.pop();
  const out: Array<{ article: string; color: string }> = [];
  for (let k = 1; k <= 3 && k < words.length; k += 1) {
    out.push({ article: words.slice(0, words.length - k).join(" "), color: words.slice(words.length - k).join(" ") });
  }
  if (words.length > 0) out.push({ article: words.join(" "), color: "" });
  return out;
}

/** The card a guess points at: same article (product name or style) and colour, spaces ignored. */
export function findCardForGuess<T extends Pick<ColorCard, "product_name" | "style" | "color">>(
  cards: readonly T[],
  guess: { article: string; color: string },
): T | null {
  const a = squash(guess.article);
  const c = squash(guess.color);
  const sameArticle = cards.filter((x) => squash(x.product_name) === a || (x.style && squash(x.style) === a));
  if (sameArticle.length === 0) return null;
  if (c) return sameArticle.find((x) => squash(x.color) === c) ?? null;
  // No colour in the name: only when the article has one colour.
  return sameArticle.length === 1 ? sameArticle[0] : null;
}
