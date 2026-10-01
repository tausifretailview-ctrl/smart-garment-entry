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

export function deletedPurchaseLinesMessage(lines: PurchaseLineRef[]): string {
  const names = Array.from(
    new Set(lines.map((l) => (l.product_name ?? "").trim() || "a product")),
  );
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${shown}${more} was deleted after it was added to this bill. Remove those lines, or restore the product from Recycle Bin, then save again. Nothing was saved.`;
}
