import { supabase } from "@/integrations/supabase/client";

export type BarcodeConflict = {
  barcode: string;
  productName: string;
  salePrice?: number;
  mrp?: number | null;
};

export type BarcodePriceTier = {
  salePrice?: number | null;
  mrp?: number | null;
};

export type IncomingBarcodePrice = BarcodePriceTier & {
  requiresImei?: boolean;
};

/** Trim, drop blanks, dedupe. */
export function normalizeBarcodes(
  barcodes: Array<string | null | undefined>,
): string[] {
  return [...new Set(
    barcodes.map((b) => String(b ?? "").trim()).filter(Boolean),
  )];
}

/**
 * Shelf / branded price key: MRP when set, otherwise sale price.
 * Used so the same manufacturer EAN can exist at different MRP tiers (Jockey, etc.).
 */
export function effectiveBarcodePriceTier(p: BarcodePriceTier): number {
  const mrp = Number(p.mrp) || 0;
  const sale = Number(p.salePrice) || 0;
  return mrp > 0 ? mrp : sale;
}

/**
 * Compound tier key for TIER-MATCHING decisions (fork/conflict/import-dedupe) —
 * distinct from effectiveBarcodePriceTier, which is a single display value that
 * deliberately prefers MRP. That preference is the wrong tool for "are these
 * the same priced batch": an org with a real, populated MRP that stays fixed
 * while sale_price changes between purchase batches (or a stale MRP left over
 * from data entry, never actually maintained) would have effectiveBarcodePriceTier
 * collapse two genuinely different sale prices into one identical tier value,
 * since MRP alone decided it. Two rows are the same tier only if BOTH MRP and
 * sale price match — either one differing is a real price change.
 */
export function barcodePriceTierKey(p: BarcodePriceTier): string {
  const mrp = Math.round((Number(p.mrp) || 0) * 100);
  const sale = Math.round((Number(p.salePrice) || 0) * 100);
  return `${mrp}|${sale}`;
}

/**
 * True when this org-level barcode hit should block create/save.
 * Serialized IMEI units always conflict. Branded EANs conflict only at the same
 * price tier (same MRP AND same sale price); either differing is allowed.
 */
export function isBarcodeOrgConflict(args: {
  existingRequiresImei?: boolean;
  incomingRequiresImei?: boolean;
  existing: BarcodePriceTier;
  incoming: BarcodePriceTier;
  tolerance?: number;
}): boolean {
  if (args.existingRequiresImei || args.incomingRequiresImei) return true;
  const existingTier = effectiveBarcodePriceTier(args.existing);
  const incomingTier = effectiveBarcodePriceTier(args.incoming);
  // Until the new line has a price, keep the hard warning (same as legacy).
  if (incomingTier <= 0 || existingTier <= 0) return true;
  return barcodePriceTierKey(args.existing) === barcodePriceTierKey(args.incoming);
}

/**
 * Check if a barcode already exists in product_variants for the given organization.
 * Optionally exclude a specific variant ID (useful for edit scenarios).
 * Pass `incoming` to allow the same branded EAN at a different MRP/sale price.
 */
export async function checkBarcodeExists(
  barcode: string,
  organizationId: string,
  excludeVariantId?: string,
  incoming?: IncomingBarcodePrice,
): Promise<{ exists: boolean; productName?: string }> {
  const conflicts = await findBarcodeConflictsInOrg(
    [barcode],
    organizationId,
    {
      excludeVariantIds: excludeVariantId ? [excludeVariantId] : undefined,
      incomingByBarcode: incoming
        ? { [String(barcode).trim()]: incoming }
        : undefined,
      /** IMEI edits must stay globally unique even without incoming prices. */
      forceUnique: incoming?.requiresImei === true,
    },
  );
  if (!conflicts.length) return { exists: false };
  return { exists: true, productName: conflicts[0].productName };
}

/**
 * Return barcodes from the list that already exist on another product in the org
 * at the same price tier (or always, for IMEI / when no incoming price map).
 */
export async function findBarcodeConflictsInOrg(
  barcodes: Array<string | null | undefined>,
  organizationId: string,
  options?: {
    excludeProductId?: string | null;
    excludeVariantIds?: string[];
    /** Per-barcode prices for the rows being saved. Different MRP ⇒ not a conflict. */
    incomingByBarcode?: Record<string, IncomingBarcodePrice>;
    /** When true, ignore price-tier allowance (IMEI / serialized). */
    forceUnique?: boolean;
  },
): Promise<BarcodeConflict[]> {
  const cleaned = normalizeBarcodes(barcodes);
  if (!cleaned.length) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, barcode, product_id, sale_price, mrp, products!inner(product_name, requires_imei)")
    .eq("organization_id", organizationId)
    .in("barcode", cleaned)
    .is("deleted_at", null);

  if (error) throw error;

  const excludeVariantIds = new Set(options?.excludeVariantIds?.filter(Boolean) ?? []);
  const incomingByBarcode = options?.incomingByBarcode;
  const forceUnique = options?.forceUnique === true;

  return (data ?? [])
    .filter((row) => {
      if (excludeVariantIds.has(row.id)) return false;
      if (options?.excludeProductId && row.product_id === options.excludeProductId) {
        return false;
      }

      const barcode = String(row.barcode || "").trim();
      const product = row.products as {
        product_name?: string;
        requires_imei?: boolean | null;
      } | null;
      const incoming = incomingByBarcode?.[barcode];

      if (forceUnique || !incomingByBarcode) {
        // Legacy callers (IMEI correction, no price context): any hit is a conflict.
        return true;
      }

      if (!incoming) return true;

      return isBarcodeOrgConflict({
        existingRequiresImei: product?.requires_imei === true,
        incomingRequiresImei: incoming.requiresImei === true,
        existing: {
          salePrice: row.sale_price,
          mrp: row.mrp,
        },
        incoming,
      });
    })
    .map((row) => {
      const product = row.products as {
        product_name?: string;
      } | null;
      return {
        barcode: String(row.barcode),
        productName: product?.product_name || "Unknown Product",
        salePrice: row.sale_price != null ? Number(row.sale_price) : undefined,
        mrp: row.mrp != null ? Number(row.mrp) : null,
      };
    });
}

export function formatBarcodeConflictMessage(conflicts: BarcodeConflict[]): string {
  const seen = new Map<string, string>();
  for (const conflict of conflicts) {
    if (!seen.has(conflict.barcode)) {
      const tier = effectiveBarcodePriceTier({
        salePrice: conflict.salePrice,
        mrp: conflict.mrp,
      });
      const priceNote = tier > 0 ? ` @ ₹${tier}` : "";
      seen.set(conflict.barcode, `${conflict.productName}${priceNote}`);
    }
  }
  return [...seen.entries()]
    .map(([barcode, productName]) => `"${barcode}" (${productName})`)
    .join(", ");
}
