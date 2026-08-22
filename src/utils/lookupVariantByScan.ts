import { supabase } from "@/integrations/supabase/client";
import { expandBarcodeScanCandidates, isDoubledNumericBarcode } from "@/utils/barcodeScanResolve";
import { normalizeProductSearchTerm } from "@/utils/productDashboardBarcodeSearch";
import {
  resolvePurchaseBarcodesForStockReport,
  type PurchaseBarcodeStockClient,
} from "@/utils/stockReportPurchaseBarcodeResolve";

export type VariantScanResolvedVia = "variant-exact" | "variant-fuzzy" | "purchase-items";

export type VariantScanLookupResult = {
  rows: Record<string, unknown>[];
  matchedCandidate: string;
  wasDoubledScan: boolean;
  resolvedVia: VariantScanResolvedVia | null;
  scanCandidates: string[];
};

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, "\\$&");
}

type LookupClient = typeof supabase;

/**
 * Canonical barcode → product_variants lookup for scan surfaces.
 * Tries, in order for each candidate: exact barcode, fuzzy barcode, purchase_items → sku_id.
 */
export async function lookupVariantRowsByScan(
  organizationId: string,
  raw: string,
  variantSelect: string,
  client: LookupClient = supabase,
): Promise<VariantScanLookupResult> {
  const scanCandidates = expandBarcodeScanCandidates(raw);
  const empty: VariantScanLookupResult = {
    rows: [],
    matchedCandidate: normalizeProductSearchTerm(raw),
    wasDoubledScan: isDoubledNumericBarcode(raw),
    resolvedVia: null,
    scanCandidates,
  };

  if (!organizationId || !scanCandidates.length) return empty;

  const base = () =>
    client
      .from("product_variants")
      .select(variantSelect)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .is("deleted_at", null);

  for (const candidate of scanCandidates) {
    const { data: exactRows, error: exactErr } = await base().eq("barcode", candidate).limit(25);
    if (!exactErr && exactRows?.length) {
      return {
        rows: exactRows as Record<string, unknown>[],
        matchedCandidate: candidate,
        wasDoubledScan: isDoubledNumericBarcode(raw),
        resolvedVia: "variant-exact",
        scanCandidates,
      };
    }
  }

  for (const candidate of scanCandidates) {
    const escaped = escapeIlike(candidate);
    const { data: fuzzyRows, error: fuzzyErr } = await base()
      .ilike("barcode", `%${escaped}%`)
      .limit(25);
    if (!fuzzyErr && fuzzyRows?.length) {
      return {
        rows: fuzzyRows as Record<string, unknown>[],
        matchedCandidate: candidate,
        wasDoubledScan: isDoubledNumericBarcode(raw),
        resolvedVia: "variant-fuzzy",
        scanCandidates,
      };
    }
  }

  for (const candidate of scanCandidates) {
    if (!/^\d{4,}$/.test(candidate)) continue;

    const resolutions = await resolvePurchaseBarcodesForStockReport(
      client as unknown as PurchaseBarcodeStockClient,
      organizationId,
      candidate,
    );
    const skuIds = resolutions.filter((r) => !r.excludeReason && r.skuId).map((r) => r.skuId);
    if (!skuIds.length) continue;

    const { data: bySkuRows, error: bySkuErr } = await base().in("id", skuIds).limit(25);
    if (!bySkuErr && bySkuRows?.length) {
      return {
        rows: bySkuRows as Record<string, unknown>[],
        matchedCandidate: candidate,
        wasDoubledScan: isDoubledNumericBarcode(raw),
        resolvedVia: "purchase-items",
        scanCandidates,
      };
    }
  }

  return empty;
}

/** Best single variant row when scan resolves to multiple sku matches. */
export function pickBestVariantScanRow(
  rows: Record<string, unknown>[],
  candidates: string[],
): Record<string, unknown> | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const lowered = candidates.map((c) => c.toLowerCase());
  const exact = rows.find((row) => {
    const bc = String(row.barcode ?? "").trim().toLowerCase();
    return lowered.includes(bc);
  });
  return exact ?? rows[0];
}
