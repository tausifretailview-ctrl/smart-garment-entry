/**
 * A purchase screen can stay open while a product is deleted from the Product screen.
 * Saving then books stock into variants of a deleted product: the bill looks fine but the
 * dashboard and stock reports (which skip deleted products) come up short. This finds such
 * lines before anything is written.
 */

export interface PurchaseLineRef {
  product_id?: string | null;
  sku_id?: string | null;
  product_name?: string | null;
  size?: string | null;
}

interface RowsResult {
  data: Array<{ id: string }> | null;
  error: unknown;
}

/** The slice of the Supabase client this needs (kept narrow so it is easy to stub). */
export interface DeletedRefsClient {
  from: (table: "products" | "product_variants") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => {
          not: (column: string, operator: string, value: null) => PromiseLike<RowsResult>;
        };
      };
    };
  };
}

const CHUNK = 200;

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
}

async function fetchDeletedIds(
  client: DeletedRefsClient,
  table: "products" | "product_variants",
  organizationId: string,
  ids: string[],
): Promise<Set<string>> {
  const deleted = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  // Chunks are independent reads: run them together (a 600-line bill was 3 trips in a row).
  const results = await Promise.all(
    chunks.map((chunk) =>
      client
        .from(table)
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", chunk)
        .not("deleted_at", "is", null),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data ?? []) deleted.add(row.id);
  }
  return deleted;
}

/** Lines whose product or variant is currently deleted. Fails open: a lookup error blocks nothing. */
export async function findDeletedPurchaseLines<T extends PurchaseLineRef>(
  client: DeletedRefsClient,
  organizationId: string,
  lines: T[],
): Promise<T[]> {
  try {
    const productIds = uniqueIds(lines.map((l) => l.product_id));
    const variantIds = uniqueIds(lines.map((l) => l.sku_id));
    if (!organizationId || (productIds.length === 0 && variantIds.length === 0)) return [];
    const [deletedProducts, deletedVariants] = await Promise.all([
      productIds.length ? fetchDeletedIds(client, "products", organizationId, productIds) : new Set<string>(),
      variantIds.length ? fetchDeletedIds(client, "product_variants", organizationId, variantIds) : new Set<string>(),
    ]);
    return lines.filter(
      (l) =>
        (l.product_id ? deletedProducts.has(l.product_id) : false) ||
        (l.sku_id ? deletedVariants.has(l.sku_id) : false),
    );
  } catch {
    return [];
  }
}

export interface PurchaseLineIdentity extends PurchaseLineRef {
  brand?: string | null;
  style?: string | null;
  category?: string | null;
  color?: string | null;
  barcode?: string | null;
}

export interface LivePurchaseProduct {
  id: string;
  product_name: string;
  brand?: string | null;
  style?: string | null;
  category?: string | null;
}

export interface LivePurchaseVariant {
  id: string;
  product_id: string;
  size?: string | null;
  color?: string | null;
  barcode?: string | null;
}

/** products: select → eq(org) → is(deleted_at) → ilike(name). variants: select → eq(org) → in(product_id) → is(deleted_at). */
export interface LiveNameCatalogClient {
  from: (table: "products" | "product_variants") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => {
          ilike: (
            column: string,
            pattern: string,
          ) => PromiseLike<{ data: LivePurchaseProduct[] | null; error: unknown }>;
        };
        in: (column: string, values: string[]) => {
          is: (
            column: string,
            value: null,
          ) => PromiseLike<{ data: LivePurchaseVariant[] | null; error: unknown }>;
        };
      };
    };
  };
}

const norm = (value?: string | null): string => (value ?? "").trim().toLowerCase();

function identityScore(line: PurchaseLineIdentity, product: LivePurchaseProduct): number {
  let score = 0;
  if (norm(line.brand) && norm(product.brand) === norm(line.brand)) score += 4;
  if (norm(line.style) && norm(product.style) === norm(line.style)) score += 2;
  if (norm(line.category) && norm(product.category) === norm(line.category)) score += 1;
  return score;
}

/** Live variant on one product: same barcode, else the only size/color match, else the only variant. */
export function pickLiveVariantForPurchaseLine(
  line: PurchaseLineIdentity,
  variants: LivePurchaseVariant[],
): LivePurchaseVariant | null {
  if (variants.length === 0) return null;
  const barcode = norm(line.barcode);
  if (barcode) {
    const byBarcode = variants.find((v) => norm(v.barcode) === barcode);
    if (byBarcode) return byBarcode;
  }
  const size = norm(line.size);
  const color = norm(line.color);
  if (size) {
    const sameSizeColor = variants.filter((v) => norm(v.size) === size && norm(v.color) === color);
    if (sameSizeColor.length === 1) return sameSizeColor[0];
    const sameSize = variants.filter((v) => norm(v.size) === size);
    if (sameSize.length === 1) return sameSize[0];
  }
  if (variants.length === 1) return variants[0];
  return null;
}

/**
 * A line whose product (or variant) is in the Recycle Bin, when the product dashboard
 * already has a live product of the same name. Returns null when nothing live matches.
 */
export function retargetPurchaseLineToLiveCatalog<T extends PurchaseLineIdentity>(
  line: T,
  liveProducts: LivePurchaseProduct[],
  liveVariants: LivePurchaseVariant[],
): T | null {
  const name = norm(line.product_name);
  if (!name) return null;
  const sameName = liveProducts.filter((p) => norm(p.product_name) === name);
  if (sameName.length === 0) return null;

  let best: { productId: string; skuId: string; score: number } | null = null;
  for (const product of sameName) {
    const variant = pickLiveVariantForPurchaseLine(
      line,
      liveVariants.filter((v) => v.product_id === product.id),
    );
    if (!variant) continue;
    const own = product.id === line.product_id ? 100 : 0;
    const score = own + identityScore(line, product);
    if (!best || score > best.score) {
      best = { productId: product.id, skuId: variant.id, score };
    }
  }
  if (!best) return null;
  if (best.productId === line.product_id && best.skuId === line.sku_id) return line;
  return { ...line, product_id: best.productId, sku_id: best.skuId };
}

export function retargetLinesOntoLiveCatalog<T extends PurchaseLineIdentity>(
  lines: T[],
  deletedLines: T[],
  liveProducts: LivePurchaseProduct[],
  liveVariants: LivePurchaseVariant[],
): { lines: T[]; stillDeleted: T[]; changed: boolean } {
  const deleted = new Set<PurchaseLineIdentity>(deletedLines);
  const stillDeleted: T[] = [];
  let changed = false;
  const next = lines.map((line) => {
    if (!deleted.has(line)) return line;
    const retargeted = retargetPurchaseLineToLiveCatalog(line, liveProducts, liveVariants);
    if (!retargeted || (retargeted.product_id === line.product_id && retargeted.sku_id === line.sku_id)) {
      stillDeleted.push(line);
      return line;
    }
    changed = true;
    return retargeted;
  });
  return { lines: next, stillDeleted, changed };
}

/**
 * Deleted line + a same-name product still on the dashboard → point the line at that
 * live product. A catalog error leaves the lines blocked (nothing is saved onto the
 * Recycle Bin copy).
 */
export async function retargetDeletedPurchaseLines<T extends PurchaseLineIdentity>(
  client: LiveNameCatalogClient,
  organizationId: string,
  lines: T[],
  deletedLines: T[],
): Promise<{ lines: T[]; stillDeleted: T[]; changed: boolean }> {
  if (deletedLines.length === 0) return { lines, stillDeleted: [], changed: false };
  const names = Array.from(
    new Set(
      deletedLines
        .map((l) => (l.product_name ?? "").trim().replace(/[%_]/g, ""))
        .filter(Boolean),
    ),
  );
  if (!organizationId || names.length === 0) {
    return { lines, stillDeleted: deletedLines, changed: false };
  }
  try {
    const productResults = await Promise.all(
      names.map((name) =>
        client
          .from("products")
          .select("id, product_name, brand, style, category")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .ilike("product_name", name),
      ),
    );
    const liveProducts: LivePurchaseProduct[] = [];
    for (const { data, error } of productResults) {
      if (error) throw error;
      for (const row of data ?? []) liveProducts.push(row);
    }
    const productIds = Array.from(new Set(liveProducts.map((p) => p.id)));
    let liveVariants: LivePurchaseVariant[] = [];
    if (productIds.length > 0) {
      const { data, error } = await client
        .from("product_variants")
        .select("id, product_id, size, color, barcode")
        .eq("organization_id", organizationId)
        .in("product_id", productIds)
        .is("deleted_at", null);
      if (error) throw error;
      liveVariants = data ?? [];
    }
    return retargetLinesOntoLiveCatalog(lines, deletedLines, liveProducts, liveVariants);
  } catch {
    return { lines, stillDeleted: deletedLines, changed: false };
  }
}

export function deletedPurchaseLinesMessage(lines: PurchaseLineRef[]): string {
  const names = Array.from(
    new Set(lines.map((l) => (l.product_name ?? "").trim() || "a product")),
  );
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${shown}${more} was deleted after it was added to this bill. Remove those lines, or restore the product from Recycle Bin, then save again. Nothing was saved.`;
}
