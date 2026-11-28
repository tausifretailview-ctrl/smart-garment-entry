/**
 * Extra barcodes per item (variant_barcodes, migration 20270606120000).
 *
 * product_variants.barcode is the item's main barcode. A supermarket item often has more:
 * a new pack's EAN, an old carton, the scale's item code. Scans that miss every main barcode
 * look here (one read, only on a miss), so normal scans cost nothing extra.
 *
 * Until the SQL is run the table does not exist: lookups answer "not found" and remember that
 * for this page load, so a miss does not keep asking.
 */
type DbError = { code?: string; message?: string } | null;
type Res<T> = PromiseLike<{ data: T | null; error: DbError }>;

export type VariantBarcodesDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => { limit: (n: number) => Res<Array<{ variant_id: string }>> };
        in: (k: string, v: string[]) => Res<ExtraBarcodeRow[]>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => Res<ExtraBarcodeRow> };
    };
    delete: () => { eq: (k: string, v: string) => { eq: (k: string, v: string) => PromiseLike<{ error: DbError }> } };
  };
};

export type ExtraBarcodeRow = { id: string; variant_id: string; barcode: string };

let tableMissing = false;

export function isMissingVariantBarcodesTable(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = String(err.message || "");
  return /variant_barcodes/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
}

/** Barcode-like text only: a typed product name never costs a lookup. */
export function looksLikeBarcode(code: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z\-./]{2,63}$/.test(code);
}

/** The item an extra barcode belongs to, or null. Never throws. */
export async function findVariantIdByExtraBarcode(
  db: VariantBarcodesDb,
  organizationId: string,
  rawCode: string,
): Promise<string | null> {
  const code = String(rawCode || "").trim();
  if (tableMissing || !organizationId || !looksLikeBarcode(code)) return null;
  try {
    const { data, error } = await db
      .from("variant_barcodes")
      .select("variant_id")
      .eq("organization_id", organizationId)
      .eq("barcode", code)
      .limit(1);
    if (error) {
      if (isMissingVariantBarcodesTable(error)) tableMissing = true;
      return null;
    }
    return data?.[0]?.variant_id ?? null;
  } catch {
    return null;
  }
}

export async function listExtraBarcodes(
  db: VariantBarcodesDb,
  organizationId: string,
  variantIds: string[],
): Promise<{ rows: ExtraBarcodeRow[]; missingTable: boolean }> {
  if (variantIds.length === 0) return { rows: [], missingTable: tableMissing };
  const { data, error } = await db
    .from("variant_barcodes")
    .select("id, variant_id, barcode")
    .eq("organization_id", organizationId)
    .in("variant_id", variantIds);
  if (error) {
    if (isMissingVariantBarcodesTable(error)) {
      tableMissing = true;
      return { rows: [], missingTable: true };
    }
    throw error;
  }
  return { rows: data ?? [], missingTable: false };
}

/** Add one; a friendly message for a barcode already in use. */
export async function addExtraBarcode(
  db: VariantBarcodesDb,
  organizationId: string,
  variantId: string,
  rawCode: string,
): Promise<ExtraBarcodeRow> {
  const barcode = String(rawCode || "").trim();
  if (!barcode) throw new Error("Type or scan a barcode.");
  const { data, error } = await db
    .from("variant_barcodes")
    .insert({ organization_id: organizationId, variant_id: variantId, barcode })
    .select("id, variant_id, barcode")
    .single();
  if (error) {
    if (isMissingVariantBarcodesTable(error)) throw new Error("Run SQL 69 (extra barcodes) first.");
    if (error.code === "23505") {
      throw new Error(
        /main barcode/i.test(String(error.message))
          ? `${barcode} is already another item's main barcode.`
          : `${barcode} is already an extra barcode of an item.`,
      );
    }
    throw error;
  }
  return data as ExtraBarcodeRow;
}

export async function removeExtraBarcode(db: VariantBarcodesDb, organizationId: string, id: string): Promise<void> {
  const { error } = await db.from("variant_barcodes").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) throw error;
}

/** Tests only. */
export function resetVariantBarcodesStateForTests(): void {
  tableMissing = false;
}
