/**
 * Product Master → Create products (Nov 2026): items typed row by row in a sheet, saved the
 * way the Excel item import saves them, without the Add New Product window.
 *
 *  - Rows with the same name, brand, category, style and colour are one product; each row is
 *    one size of it (a blank size is "None", like Add Product with no sizes).
 *  - A product that already exists gets the new sizes; a size it already has is skipped.
 *  - The name takes the spelling already used in the shop ("eln dup" → "ELN-DUP").
 *  - A typed barcode is kept (a company EAN is marked external); a barcode already on another
 *    item is refused for that row; a blank barcode gets the shop's next number.
 * Pure helpers are separate from the database steps so they can be tested on their own.
 */
import { productNameMatchKey } from "@/utils/productNameDedupe";
import { cleanProductName } from "@/utils/productNameMerge";
import { classifyBarcodeSource } from "@/utils/barcodeChecksum";
import { normalizeImportUom } from "@/utils/excelImportUtils";
import { fetchAllRows, type RangeQuery } from "@/lib/data/fetchInIdBatches";

export type ProductMasterRow = {
  product_name: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  size: string;
  hsn_code: string;
  gst_per: string;
  uom: string;
  pur_price: string;
  sale_price: string;
  mrp: string;
  barcode: string;
  opening_qty: string;
};

export const EMPTY_PRODUCT_MASTER_ROW: ProductMasterRow = {
  product_name: "", brand: "", category: "", style: "", color: "", size: "", hsn_code: "", gst_per: "",
  uom: "", pur_price: "", sale_price: "", mrp: "", barcode: "", opening_qty: "",
};

export type RowResult = { index: number; status: "created" | "skipped" | "error"; message?: string };

const t = (v: string | undefined | null) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v: string | undefined | null): number => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function isBlankRow(r: ProductMasterRow): boolean {
  return (Object.keys(EMPTY_PRODUCT_MASTER_ROW) as Array<keyof ProductMasterRow>).every((k) => !t(r[k]));
}

/** Problems a row has before anything is saved (null when fine). */
export function rowProblem(r: ProductMasterRow): string | null {
  if (!t(r.product_name)) return "Product name is needed";
  for (const k of ["gst_per", "pur_price", "sale_price", "mrp", "opening_qty"] as const) {
    const raw = t(r[k]);
    if (raw && !Number.isFinite(Number(raw.replace(/,/g, "")))) return `${k.replace("_", " ")} is not a number`;
    if (raw && Number(raw.replace(/,/g, "")) < 0) return `${k.replace("_", " ")} cannot be negative`;
  }
  const gst = num(r.gst_per);
  if (t(r.gst_per) && ![0, 0.25, 3, 5, 12, 18, 28, 40].includes(gst)) return "GST % is not a GST rate";
  return null;
}

/** Product key: same name / brand / category / style / colour → one product. */
export function productGroupKey(r: Pick<ProductMasterRow, "product_name" | "brand" | "category" | "style" | "color">): string {
  return [productNameMatchKey(r.product_name), t(r.brand), t(r.category), t(r.style), t(r.color)].join("|").toLowerCase();
}

export function groupRows(rows: readonly ProductMasterRow[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (isBlankRow(r)) return;
    const key = productGroupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  return groups;
}

// ── Database steps ──────────────────────────────────────────────────────────────────────────

type DbError = { code?: string; message?: string } | null;
type Single<T> = PromiseLike<{ data: T | null; error: DbError }>;
type ProductLite = { id: string; product_name: string; brand: string | null; category: string | null; style: string | null; color: string | null };

/** The narrow part of the Supabase client used here (kept loose on purpose; tested with a fake). */
export type ProductMasterDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: unknown) => {
        is: (k: string, v: null) => {
          order: (c: string) => RangeQuery<ProductLite>;
          eq: (k: string, v: unknown) => PromiseLike<{ data: Array<{ id: string; product_id?: string; size?: string | null }> | null; error: DbError }>;
        };
        eq: (k: string, v: unknown) => {
          is: (k: string, v: null) => PromiseLike<{ data: Array<{ id: string; product_id: string; size: string | null }> | null; error: DbError }>;
        };
      };
    };
    insert: (row: Record<string, unknown>) => { select: (cols: string) => { single: () => Single<{ id: string }> } };
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export async function saveProductMasterRows(
  db: ProductMasterDb,
  organizationId: string,
  rows: readonly ProductMasterRow[],
  opts: { defaultGst?: number; defaultUom?: string; organizationNumber?: number | null } = {},
): Promise<RowResult[]> {
  const results: RowResult[] = [];
  const valid: number[] = [];
  rows.forEach((r, i) => {
    if (isBlankRow(r)) return;
    const problem = rowProblem(r);
    if (problem) results.push({ index: i, status: "error", message: problem });
    else valid.push(i);
  });
  if (valid.length === 0) return results.sort((a, b) => a.index - b.index);

  // Live products of the shop, every page (a shop can have more than 1,000).
  const existing = await fetchAllRows<ProductLite>(() =>
    db
      .from("products")
      .select("id, product_name, brand, category, style, color")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id"),
  );
  const spelling = new Map<string, string>();
  const productByKey = new Map<string, string>();
  for (const p of existing) {
    const k = productNameMatchKey(p.product_name);
    if (k && !spelling.has(k)) spelling.set(k, p.product_name);
    productByKey.set(
      productGroupKey({ product_name: p.product_name, brand: p.brand ?? "", category: p.category ?? "", style: p.style ?? "", color: p.color ?? "" }),
      p.id,
    );
  }

  const validRows = valid.map((i) => ({ i, r: rows[i] }));
  const groups = new Map<string, Array<{ i: number; r: ProductMasterRow }>>();
  for (const item of validRows) {
    const key = productGroupKey(item.r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const barcodesInSheet = new Set<string>();

  for (const [key, items] of groups) {
    const first = items[0].r;
    const typedName = cleanProductName(first.product_name);
    const name = spelling.get(productNameMatchKey(typedName)) ?? typedName;
    let productId = productByKey.get(key);
    try {
      if (!productId) {
        const gst = t(first.gst_per) ? num(first.gst_per) : opts.defaultGst ?? 0;
        const { data, error } = await db
          .from("products")
          .insert({
            organization_id: organizationId,
            product_name: name,
            brand: t(first.brand) || null,
            category: t(first.category) || null,
            style: t(first.style) || null,
            color: t(first.color) || null,
            hsn_code: t(first.hsn_code) || null,
            gst_per: gst,
            purchase_gst_percent: gst,
            sale_gst_percent: gst,
            default_pur_price: num(first.pur_price),
            default_sale_price: num(first.sale_price),
            uom: t(first.uom) ? normalizeImportUom(first.uom) : opts.defaultUom || "NOS",
            status: "active",
            requires_imei: false,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message || "Product not saved");
        productId = data.id;
        productByKey.set(key, productId);
      }
    } catch (e) {
      for (const it of items) results.push({ index: it.i, status: "error", message: e instanceof Error ? e.message : "Product not saved" });
      continue;
    }

    const { data: variants } = await db.from("product_variants").select("id, product_id, size").eq("organization_id", organizationId).eq("product_id", productId).is("deleted_at", null);
    const sizes = new Set((variants ?? []).map((v) => t(v.size).toLowerCase() || "none"));

    for (const { i, r } of items) {
      const size = t(r.size) || "None";
      if (sizes.has(size.toLowerCase())) {
        results.push({ index: i, status: "skipped", message: `${name} already has size ${size}` });
        continue;
      }
      try {
        let barcode = t(r.barcode);
        let source: "generated" | "external" = "generated";
        if (barcode) {
          if (barcodesInSheet.has(barcode.toLowerCase())) throw new Error(`Barcode ${barcode} is twice in this sheet`);
          const { data: taken } = await db.from("product_variants").select("id").eq("organization_id", organizationId).is("deleted_at", null).eq("barcode", barcode);
          if ((taken ?? []).length > 0) throw new Error(`Barcode ${barcode} is already on another item`);
          source = classifyBarcodeSource(barcode, { organizationNumber: opts.organizationNumber }).source;
        } else {
          const { data: next, error: nextErr } = await db.rpc("generate_next_barcode", { p_organization_id: organizationId });
          if (nextErr || !next) throw new Error("Could not get the next barcode number");
          barcode = String(next);
        }
        barcodesInSheet.add(barcode.toLowerCase());
        const opening = num(r.opening_qty);
        const mrp = num(r.mrp);
        const { error } = await db
          .from("product_variants")
          .insert({
            organization_id: organizationId,
            product_id: productId,
            size,
            color: t(r.color) || null,
            barcode,
            barcode_source: source,
            pur_price: num(r.pur_price),
            sale_price: num(r.sale_price),
            mrp: mrp > 0 ? mrp : null,
            stock_qty: opening,
            opening_qty: opening,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.code === "23505" ? `Barcode ${barcode} is already used` : error.message || "Size not saved");
        sizes.add(size.toLowerCase());
        results.push({ index: i, status: "created" });
      } catch (e) {
        results.push({ index: i, status: "error", message: e instanceof Error ? e.message : "Not saved" });
      }
    }
  }
  return results.sort((a, b) => a.index - b.index);
}
