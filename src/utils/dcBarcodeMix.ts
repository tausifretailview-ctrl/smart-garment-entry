/**
 * Same barcode on a GST bill and a DC (No GST) bill. product_variants.is_dc_product follows
 * the latest purchase bill, so the barcode's old stock changes side with it. Purchase Entry
 * asks before saving such a mix (decided 24 Oct 2026); a lookup error never blocks a save.
 */

export type DcMixedBarcode = { variantId: string; barcode: string; stockQty: number };

type VariantRow = {
  id: string;
  barcode?: string | null;
  stock_qty?: number | null;
  is_dc_product?: boolean | null;
};

type VariantsClient = { from: (table: string) => any };

const CHUNK = 200;

/** Barcodes on this bill that have stock on the other side (GST stock on a DC bill, or the reverse). */
export function pickDcMixedBarcodes(rows: readonly VariantRow[], billIsDc: boolean): DcMixedBarcode[] {
  return rows
    .filter((r) => (Number(r.stock_qty) || 0) > 0 && (r.is_dc_product === true) !== billIsDc)
    .map((r) => ({ variantId: r.id, barcode: String(r.barcode || "").trim() || "(no barcode)", stockQty: Number(r.stock_qty) || 0 }));
}

export async function findDcMixedBarcodes(
  supabaseClient: unknown,
  organizationId: string,
  lines: ReadonlyArray<{ sku_id?: string | null }>,
  billIsDc: boolean,
): Promise<DcMixedBarcode[]> {
  const client = supabaseClient as VariantsClient;
  const ids = [...new Set(lines.map((l) => l.sku_id).filter((id): id is string => !!id))];
  const rows: VariantRow[] = [];
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await client
        .from("product_variants")
        .select("id, barcode, stock_qty, is_dc_product")
        .eq("organization_id", organizationId)
        .in("id", ids.slice(i, i + CHUNK));
      if (error) return [];
      rows.push(...((data || []) as VariantRow[]));
    }
  } catch {
    return [];
  }
  return pickDcMixedBarcodes(rows, billIsDc);
}

export function dcMixConfirmMessage(mixed: readonly DcMixedBarcode[], billIsDc: boolean): string {
  const shown = mixed.slice(0, 5).map((m) => `${m.barcode} (stock ${m.stockQty})`).join(", ");
  const more = mixed.length > 5 ? ` and ${mixed.length - 5} more` : "";
  if (billIsDc) {
    return (
      `These barcodes already have GST stock: ${shown}${more}.\n\n` +
      "Saving this DC bill tags them as DC, so their GST stock is treated as DC too " +
      "(hidden with DC stock, left out of GST reports on the next sale).\n\n" +
      "Better: give the DC items a new barcode.\n\nOK = save anyway, Cancel = change the lines."
    );
  }
  return (
    `These barcodes are DC stock: ${shown}${more}.\n\n` +
    "Saving this GST bill turns their DC tag off, so their DC stock shows as GST stock " +
    "in stock reports and GST sale reports.\n\n" +
    "Better: give the GST items a new barcode.\n\nOK = save anyway, Cancel = change the lines."
  );
}
