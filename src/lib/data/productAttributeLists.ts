/**
 * Product Master field lists (product_attribute_values, migration 20270608120000).
 *
 * Product names, brands, categories, styles, colours and HSN codes as lists of their own:
 * a shop can set them up first (Master → Product Master), and Add Product / Purchase pick
 * from them. Values typed anywhere else join the lists automatically (database trigger).
 *
 * Until the SQL is run the table does not exist: reads answer "no lists" so the screens fall
 * back to the values on existing items, as before.
 */
import { fetchAllRows, type RangeQuery } from "@/lib/data/fetchInIdBatches";

export type ProductAttributeKind = "product_name" | "brand" | "category" | "style" | "color" | "hsn";

export const PRODUCT_ATTRIBUTE_KINDS: ReadonlyArray<{ kind: ProductAttributeKind; label: string; plural: string }> = [
  { kind: "product_name", label: "Product name", plural: "Product names" },
  { kind: "brand", label: "Brand", plural: "Brands" },
  { kind: "category", label: "Category", plural: "Categories" },
  { kind: "style", label: "Style", plural: "Styles" },
  { kind: "color", label: "Colour", plural: "Colours" },
  { kind: "hsn", label: "HSN code", plural: "HSN codes" },
];

/** Query key of the Product Master list rows. */
export const productAttributeRowsKey = (orgId?: string) => ["product-attribute-values", orgId] as const;

export type AttributeRow = { id: string; kind: ProductAttributeKind; value: string };

export type ProductAttributeLists = Record<ProductAttributeKind, string[]>;

type DbError = { code?: string; message?: string } | null;

export type AttributeListsDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => { order: (c: string) => RangeQuery<AttributeRow> };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => PromiseLike<{ data: AttributeRow | null; error: DbError }> };
    };
    delete: () => { eq: (k: string, v: string) => { eq: (k: string, v: string) => PromiseLike<{ error: DbError }> } };
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export function isMissingAttributeListsTable(err: DbError | unknown): boolean {
  const e = (err ?? null) as DbError;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883") return true;
  const msg = String(e.message || "");
  return /product_attribute_values|rename_product_attribute_value/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
}

export function emptyAttributeLists(): ProductAttributeLists {
  return { product_name: [], brand: [], category: [], style: [], color: [], hsn: [] };
}

/** Every list of the shop, sorted; null while the SQL has not been run. */
export async function fetchProductAttributeLists(
  db: AttributeListsDb,
  organizationId: string,
): Promise<ProductAttributeLists | null> {
  try {
    const rows = await fetchAllRows<AttributeRow>(() =>
      db.from("product_attribute_values").select("id, kind, value").eq("organization_id", organizationId).order("id"),
    );
    const lists = emptyAttributeLists();
    for (const r of rows) if (lists[r.kind]) lists[r.kind].push(r.value);
    for (const k of Object.keys(lists) as ProductAttributeKind[]) lists[k].sort((a, b) => a.localeCompare(b));
    return lists;
  } catch (e) {
    if (isMissingAttributeListsTable(e)) return null;
    throw e;
  }
}

/** Rows of one list (for the master page), sorted. */
export async function fetchAttributeRows(
  db: AttributeListsDb,
  organizationId: string,
): Promise<AttributeRow[] | null> {
  try {
    const rows = await fetchAllRows<AttributeRow>(() =>
      db.from("product_attribute_values").select("id, kind, value").eq("organization_id", organizationId).order("id"),
    );
    return rows.sort((a, b) => a.value.localeCompare(b.value));
  } catch (e) {
    if (isMissingAttributeListsTable(e)) return null;
    throw e;
  }
}

/** "  tata " and "TATA" are the same value. */
export function attributeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function cleanAttributeValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export async function addAttributeValue(
  db: AttributeListsDb,
  organizationId: string,
  kind: ProductAttributeKind,
  raw: string,
): Promise<AttributeRow> {
  const value = cleanAttributeValue(raw);
  if (!value) throw new Error("Type a value.");
  if (value.length > 200) throw new Error("Too long (200 characters at most).");
  const { data, error } = await db
    .from("product_attribute_values")
    .insert({ organization_id: organizationId, kind, value })
    .select("id, kind, value")
    .single();
  if (error) {
    if (isMissingAttributeListsTable(error)) throw new Error("Run SQL 71 (product master lists) first.");
    if (error.code === "23505") throw new Error(`"${value}" is already in the list.`);
    throw error;
  }
  return data as AttributeRow;
}

export async function deleteAttributeValue(db: AttributeListsDb, organizationId: string, id: string): Promise<void> {
  const { error } = await db.from("product_attribute_values").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

export async function renameAttributeValue(
  db: AttributeListsDb,
  organizationId: string,
  kind: ProductAttributeKind,
  oldValue: string,
  rawNew: string,
  applyToItems: boolean,
): Promise<{ itemsChanged: number }> {
  const value = cleanAttributeValue(rawNew);
  if (!value) throw new Error("Type the new name.");
  const { data, error } = await db.rpc("rename_product_attribute_value", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_old: oldValue,
    p_new: value,
    p_apply_to_items: applyToItems && kind !== "product_name",
  });
  if (error) {
    if (isMissingAttributeListsTable(error)) throw new Error("Run SQL 71 (product master lists) first.");
    throw new Error(error.message || "Rename failed");
  }
  return { itemsChanged: Number((data as { items_changed?: unknown } | null)?.items_changed) || 0 };
}

/** Suggestions for a field: the master list and the values already on items, once each. */
export function mergeSuggestions(listValues: readonly string[] | undefined, itemValues: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...(listValues ?? []), ...itemValues]) {
    const clean = cleanAttributeValue(String(v ?? ""));
    const key = attributeKey(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
