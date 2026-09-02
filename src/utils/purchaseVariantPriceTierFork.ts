import { supabase } from "@/integrations/supabase/client";
import { insertGeneratedProductVariant } from "@/utils/barcodeCollisionGuard";
import { classifyBarcodeSource } from "@/utils/barcodeChecksum";
import { effectiveBarcodePriceTier, barcodePriceTierKey } from "@/utils/barcodeValidation";
import {
  importPriceTierKey,
  makePurchaseImportProductKey,
} from "@/utils/purchaseImportBarcodeTier";

export const PURCHASE_PRICE_TIER_TOLERANCE = 0.009;

const IN_QUERY_CHUNK = 100;

export type PriceTierLike = {
  mrp?: number | null;
  salePrice?: number | null;
};

export function purchasePriceTierValue(tier: PriceTierLike): number {
  return effectiveBarcodePriceTier({
    mrp: tier.mrp,
    salePrice: tier.salePrice,
  });
}

function mrpIsUnset(mrp?: number | null): boolean {
  return mrp == null || !Number.isFinite(Number(mrp)) || Number(mrp) <= 0;
}

function salePricesMatch(
  existingSale?: number | null,
  incomingSale?: number | null,
): boolean {
  const existingCents = Math.round((Number(existingSale) || 0) * 100);
  const incomingCents = Math.round((Number(incomingSale) || 0) * 100);
  return existingCents === incomingCents;
}

export function purchasePriceTiersMatch(
  existing: PriceTierLike,
  incoming: PriceTierLike,
  _tolerance = PURCHASE_PRICE_TIER_TOLERANCE,
): boolean {
  const existingTier = purchasePriceTierValue(existing);
  const incomingTier = purchasePriceTierValue(incoming);
  if (incomingTier <= 0 || existingTier <= 0) return true;
  // Filling or omitting MRP on an otherwise identical sale price is master-data
  // completion, not a new commercial tier. Chirag JEANS 450006800: Add New
  // Product saved MRP empty / sale 1199, the bill line then sent MRP 1199
  // (sale-price fallback) and forked a sibling that copied the generated barcode.
  if (mrpIsUnset(existing.mrp) || mrpIsUnset(incoming.mrp)) {
    return salePricesMatch(existing.salePrice, incoming.salePrice);
  }
  // Compound key — mrp alone is not a safe tier match. A stale, unmaintained
  // MRP that never changes between purchase batches would otherwise mask a
  // genuine sale_price change (the org-697c451a JOCKEY BRA case: mrp stuck at
  // 200 across batches while sale_price moved 400 -> 500, silently overwrote
  // the master row instead of forking a sibling SKU for the new price).
  return (
    barcodePriceTierKey({ mrp: existing.mrp, salePrice: existing.salePrice }) ===
    barcodePriceTierKey({ mrp: incoming.mrp, salePrice: incoming.salePrice })
  );
}

/**
 * Manufacturer EANs (Jockey etc.) must keep the same barcode across price-tier
 * forks so POS scan still finds every MRP/sale sibling. App-generated barcodes
 * are unique per SKU — copying them is what produced Chirag's dual 450006800 rows.
 */
export function shouldReuseBarcodeOnPriceTierFork(args: {
  barcode_source?: string | null;
  barcode?: string | null;
}): boolean {
  const source = (args.barcode_source || "").trim().toLowerCase();
  if (source === "external") return true;
  if (source === "generated") return false;
  return classifyBarcodeSource(args.barcode).source === "external";
}

const VARIANT_PRICE_SELECT =
  "id, product_id, size, color, barcode, barcode_source, pur_price, sale_price, mrp";

type VariantPriceRow = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
  barcode_source?: string | null;
  pur_price: number | null;
  sale_price: number | null;
  mrp: number | null;
};

type ProductRow = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  style: string | null;
  hsn_code: string | null;
  gst_per: number | null;
  purchase_gst_percent: number | null;
  sale_gst_percent: number | null;
  uom: string | null;
  requires_imei: boolean | null;
  default_pur_price: number | null;
  default_sale_price: number | null;
};

export type ResolveVariantForIncomingPriceTierParams = {
  organizationId: string;
  variantId?: string;
  barcode?: string;
  incomingPurPrice: number;
  incomingSalePrice: number;
  incomingMrp?: number;
  purchaseDate?: string | null;
};

export type ResolveVariantForIncomingPriceTierResult = {
  variantId: string;
  productId: string;
  /** True when a new product+variant row was created for this price tier. */
  forked: boolean;
};

type TierResolutionContext = {
  organizationId: string;
  variantById: Map<string, VariantPriceRow>;
  variantsByBarcode: Map<string, VariantPriceRow[]>;
  productById: Map<string, ProductRow>;
  productsByName: Map<string, ProductRow[]>;
  productsByNameLoaded: boolean;
};

type ForkRequest = {
  cacheKey: string;
  sourceVariant: VariantPriceRow;
  sourceProduct: ProductRow;
  incomingPurPrice: number;
  incomingSalePrice: number;
  incomingMrp?: number;
  purchaseDate?: string | null;
};

function parsePurchaseDate(purchaseDate?: string | null): string {
  if (purchaseDate && String(purchaseDate).trim()) {
    const trimmed = String(purchaseDate).trim();
    return new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed,
    ).toISOString();
  }
  return new Date().toISOString();
}

function forkCacheKey(sourceVariantId: string, incomingMrp?: number, incomingSalePrice?: number): string {
  return `${sourceVariantId}::${importPriceTierKey(incomingMrp, incomingSalePrice)}`;
}

async function fetchInIdChunks<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK) {
    out.push(...(await fetchChunk(unique.slice(i, i + IN_QUERY_CHUNK))));
  }
  return out;
}

async function fetchVariantsByIds(
  organizationId: string,
  variantIds: string[],
): Promise<VariantPriceRow[]> {
  return fetchInIdChunks(variantIds, async (chunk) => {
    const { data, error } = await supabase
      .from("product_variants")
      .select(VARIANT_PRICE_SELECT)
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    return (data as VariantPriceRow[]) ?? [];
  });
}

async function fetchVariantsByBarcodes(
  organizationId: string,
  barcodes: string[],
): Promise<VariantPriceRow[]> {
  return fetchInIdChunks(barcodes, async (chunk) => {
    const { data, error } = await supabase
      .from("product_variants")
      .select(VARIANT_PRICE_SELECT)
      .eq("organization_id", organizationId)
      .in("barcode", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    return (data as VariantPriceRow[]) ?? [];
  });
}

async function fetchProductsByIds(
  organizationId: string,
  productIds: string[],
): Promise<ProductRow[]> {
  return fetchInIdChunks(productIds, async (chunk) => {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, product_name, brand, category, color, style, hsn_code, gst_per, purchase_gst_percent, sale_gst_percent, uom, requires_imei, default_pur_price, default_sale_price",
      )
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    return (data as ProductRow[]) ?? [];
  });
}

/** Uses (organization_id, product_name) index — filter tier in memory. */
async function fetchProductsByNames(
  organizationId: string,
  productNames: string[],
): Promise<ProductRow[]> {
  return fetchInIdChunks(productNames, async (chunk) => {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, product_name, brand, category, color, style, default_sale_price",
      )
      .eq("organization_id", organizationId)
      .in("product_name", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    return (data as ProductRow[]) ?? [];
  });
}

function indexVariantsByBarcode(rows: VariantPriceRow[]): Map<string, VariantPriceRow[]> {
  const map = new Map<string, VariantPriceRow[]>();
  for (const row of rows) {
    const bc = (row.barcode || "").trim();
    if (!bc) continue;
    const list = map.get(bc) ?? [];
    list.push(row);
    map.set(bc, list);
  }
  return map;
}

function indexProductsByName(rows: ProductRow[]): Map<string, ProductRow[]> {
  const map = new Map<string, ProductRow[]>();
  for (const row of rows) {
    const name = row.product_name?.trim() || "";
    if (!name) continue;
    const list = map.get(name) ?? [];
    list.push(row);
    map.set(name, list);
  }
  return map;
}

async function buildTierResolutionContext(
  organizationId: string,
  params: ResolveVariantForIncomingPriceTierParams[],
): Promise<TierResolutionContext> {
  const variantIds: string[] = [];
  const barcodes: string[] = [];

  for (const p of params) {
    if (p.variantId) variantIds.push(p.variantId);
    const bc = (p.barcode || "").trim();
    if (bc) barcodes.push(bc);
  }

  const [variantsByIdRows, variantsByBarcodeRows] = await Promise.all([
    fetchVariantsByIds(organizationId, variantIds),
    fetchVariantsByBarcodes(organizationId, barcodes),
  ]);

  const variantById = new Map<string, VariantPriceRow>();
  for (const row of variantsByIdRows) variantById.set(row.id, row);
  for (const row of variantsByBarcodeRows) {
    if (!variantById.has(row.id)) variantById.set(row.id, row);
  }

  const variantsByBarcode = indexVariantsByBarcode([
    ...variantsByIdRows,
    ...variantsByBarcodeRows,
  ]);

  const productIds = [...new Set([...variantById.values()].map((v) => v.product_id))];
  const sourceProducts = await fetchProductsByIds(organizationId, productIds);
  const productById = new Map(sourceProducts.map((p) => [p.id, p]));

  return {
    organizationId,
    variantById,
    variantsByBarcode,
    productById,
    productsByName: new Map(),
    productsByNameLoaded: false,
  };
}

async function ensureProductsByNameLoaded(ctx: TierResolutionContext): Promise<void> {
  if (ctx.productsByNameLoaded) return;
  const productNames = [
    ...new Set([...ctx.productById.values()].map((p) => p.product_name).filter(Boolean)),
  ];
  const tierProductRows = await fetchProductsByNames(ctx.organizationId, productNames);
  ctx.productsByName = indexProductsByName(tierProductRows);
  ctx.productsByNameLoaded = true;
}

function findProductIdForTierInContext(
  ctx: TierResolutionContext,
  sourceProduct: ProductRow,
  incomingSalePrice: number,
  incomingMrp?: number,
): string | null {
  const tierKey = makePurchaseImportProductKey(
    {
      product_name: sourceProduct.product_name,
      brand: sourceProduct.brand,
      category: sourceProduct.category,
      color: sourceProduct.color,
      style: sourceProduct.style,
      sale_price: incomingSalePrice,
      mrp: incomingMrp,
    },
    (value) => Number(value) || 0,
  );

  for (const row of ctx.productsByName.get(sourceProduct.product_name) ?? []) {
    const key = makePurchaseImportProductKey(
      {
        product_name: row.product_name,
        brand: row.brand,
        category: row.category,
        color: row.color,
        style: row.style,
        sale_price: row.default_sale_price,
        mrp: null,
      },
      (value) => Number(value) || 0,
    );
    if (key === tierKey) return row.id;
  }
  return null;
}

function resolveWithoutFork(
  params: ResolveVariantForIncomingPriceTierParams,
  ctx: TierResolutionContext,
): ResolveVariantForIncomingPriceTierResult | ForkRequest | null {
  const {
    variantId,
    barcode,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
  } = params;

  if (incomingPurPrice <= 0 || incomingSalePrice <= 0) return null;

  const incomingTier = { mrp: incomingMrp, salePrice: incomingSalePrice };

  let sourceVariant: VariantPriceRow | null = null;
  if (variantId) {
    sourceVariant = ctx.variantById.get(variantId) ?? null;
  }
  const lookupBarcode = (barcode || sourceVariant?.barcode || "").trim();
  if (!sourceVariant && lookupBarcode) {
    const siblings = ctx.variantsByBarcode.get(lookupBarcode) ?? [];
    sourceVariant = siblings[0] ?? null;
  }
  if (!sourceVariant) return null;

  if (
    purchasePriceTiersMatch(
      { mrp: sourceVariant.mrp, salePrice: sourceVariant.sale_price },
      incomingTier,
    )
  ) {
    return {
      variantId: sourceVariant.id,
      productId: sourceVariant.product_id,
      forked: false,
    };
  }

  if (lookupBarcode) {
    const siblings = ctx.variantsByBarcode.get(lookupBarcode) ?? [];
    const tierSibling = siblings.find((row) =>
      purchasePriceTiersMatch({ mrp: row.mrp, salePrice: row.sale_price }, incomingTier),
    );
    if (tierSibling) {
      return {
        variantId: tierSibling.id,
        productId: tierSibling.product_id,
        forked: tierSibling.id !== sourceVariant.id,
      };
    }
  }

  const sourceProduct = ctx.productById.get(sourceVariant.product_id);
  if (!sourceProduct) return null;

  return {
    cacheKey: forkCacheKey(sourceVariant.id, incomingMrp, incomingSalePrice),
    sourceVariant,
    sourceProduct,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
  };
}

async function forkProductAndVariantForTier(args: {
  organizationId: string;
  sourceVariant: VariantPriceRow;
  sourceProduct: ProductRow;
  incomingPurPrice: number;
  incomingSalePrice: number;
  incomingMrp?: number;
  purchaseDate?: string | null;
  ctx: TierResolutionContext;
}): Promise<ResolveVariantForIncomingPriceTierResult> {
  const {
    organizationId,
    sourceVariant,
    sourceProduct,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
    ctx,
  } = args;

  let productId = findProductIdForTierInContext(
    ctx,
    sourceProduct,
    incomingSalePrice,
    incomingMrp,
  );

  if (!productId) {
    const { data: createdProduct, error: productError } = await supabase
      .from("products")
      .insert({
        organization_id: organizationId,
        product_name: sourceProduct.product_name,
        brand: sourceProduct.brand,
        category: sourceProduct.category,
        color: sourceProduct.color,
        style: sourceProduct.style,
        hsn_code: sourceProduct.hsn_code,
        gst_per: sourceProduct.gst_per,
        purchase_gst_percent: sourceProduct.purchase_gst_percent,
        sale_gst_percent: sourceProduct.sale_gst_percent,
        uom: sourceProduct.uom,
        requires_imei: sourceProduct.requires_imei,
        default_pur_price: incomingPurPrice,
        default_sale_price: incomingSalePrice,
        status: "active",
        created_in_purchase: true,
      })
      .select("id")
      .single();
    if (productError) throw productError;
    productId = createdProduct.id;

    const tierRow: ProductRow = {
      id: productId,
      product_name: sourceProduct.product_name,
      brand: sourceProduct.brand,
      category: sourceProduct.category,
      color: sourceProduct.color,
      style: sourceProduct.style,
      hsn_code: sourceProduct.hsn_code,
      gst_per: sourceProduct.gst_per,
      purchase_gst_percent: sourceProduct.purchase_gst_percent,
      sale_gst_percent: sourceProduct.sale_gst_percent,
      uom: sourceProduct.uom,
      requires_imei: sourceProduct.requires_imei,
      default_pur_price: incomingPurPrice,
      default_sale_price: incomingSalePrice,
    };
    ctx.productById.set(productId, tierRow);
    const nameList = ctx.productsByName.get(sourceProduct.product_name) ?? [];
    nameList.push(tierRow);
    ctx.productsByName.set(sourceProduct.product_name, nameList);
  }

  const sourceBarcode = (sourceVariant.barcode || "").trim();
  const reuseBarcode = shouldReuseBarcodeOnPriceTierFork({
    barcode_source: sourceVariant.barcode_source,
    barcode: sourceBarcode,
  });
  const lastPurchaseDate = parsePurchaseDate(purchaseDate);
  const mrpVal = Number(incomingMrp) || 0;

  const variantInsert: Record<string, unknown> = {
    organization_id: organizationId,
    product_id: productId,
    size: sourceVariant.size || "",
    color: sourceVariant.color,
    pur_price: incomingPurPrice,
    sale_price: incomingSalePrice,
    stock_qty: 0,
    active: true,
    last_purchase_pur_price: incomingPurPrice,
    last_purchase_sale_price: incomingSalePrice,
    last_purchase_date: lastPurchaseDate,
  };
  if (mrpVal > 0) {
    variantInsert.mrp = mrpVal;
    variantInsert.last_purchase_mrp = mrpVal;
  }

  let createdRow: VariantPriceRow;
  if (reuseBarcode && sourceBarcode) {
    variantInsert.barcode = sourceBarcode;
    variantInsert.barcode_source = "external";
    const { data: createdVariant, error: variantError } = await supabase
      .from("product_variants")
      .insert(variantInsert as never)
      .select(VARIANT_PRICE_SELECT)
      .single();
    if (variantError) throw variantError;
    createdRow = createdVariant as VariantPriceRow;
  } else {
    const { data: createdVariant } = await insertGeneratedProductVariant<VariantPriceRow>(
      {
        ...variantInsert,
        organization_id: organizationId,
        barcode: "",
        barcode_source: "generated",
      },
      VARIANT_PRICE_SELECT,
    );
    createdRow = createdVariant;
  }

  ctx.variantById.set(createdRow.id, createdRow);
  const createdBarcode = (createdRow.barcode || "").trim();
  if (createdBarcode) {
    const siblings = ctx.variantsByBarcode.get(createdBarcode) ?? [];
    siblings.push(createdRow);
    ctx.variantsByBarcode.set(createdBarcode, siblings);
  }

  return {
    variantId: createdRow.id,
    productId,
    forked: true,
  };
}

async function executeForkRequests(
  organizationId: string,
  requests: ForkRequest[],
  ctx: TierResolutionContext,
): Promise<Map<string, ResolveVariantForIncomingPriceTierResult>> {
  const results = new Map<string, ResolveVariantForIncomingPriceTierResult>();
  if (requests.length === 0) return results;

  await ensureProductsByNameLoaded(ctx);

  const pending = new Map<string, Promise<ResolveVariantForIncomingPriceTierResult>>();

  await Promise.all(
    requests.map(async (req) => {
      if (results.has(req.cacheKey)) return;

      let promise = pending.get(req.cacheKey);
      if (!promise) {
        promise = forkProductAndVariantForTier({
          organizationId,
          sourceVariant: req.sourceVariant,
          sourceProduct: req.sourceProduct,
          incomingPurPrice: req.incomingPurPrice,
          incomingSalePrice: req.incomingSalePrice,
          incomingMrp: req.incomingMrp,
          purchaseDate: req.purchaseDate,
          ctx,
        });
        pending.set(req.cacheKey, promise);
      }

      const result = await promise;
      results.set(req.cacheKey, result);
    }),
  );

  return results;
}

/**
 * Batch tier resolution — constant small number of reads, parallel deduped forks.
 */
export async function resolveVariantsForIncomingPriceTiers(
  params: ResolveVariantForIncomingPriceTierParams[],
): Promise<Array<ResolveVariantForIncomingPriceTierResult | null>> {
  if (params.length === 0) return [];

  const organizationId = params[0]?.organizationId;
  if (!organizationId || params.some((p) => p.organizationId !== organizationId)) {
    throw new Error("resolveVariantsForIncomingPriceTiers requires a single organizationId");
  }

  const eligible = params.map((p) =>
    p.organizationId && (p.incomingPurPrice > 0 && p.incomingSalePrice > 0) ? p : null,
  );

  const toResolve = eligible.filter(Boolean) as ResolveVariantForIncomingPriceTierParams[];
  if (toResolve.length === 0) {
    return params.map(() => null);
  }

  const ctx = await buildTierResolutionContext(organizationId, toResolve);

  const forkRequests: ForkRequest[] = [];
  const forkRequestKeys = new Set<string>();
  const prelim: Array<ResolveVariantForIncomingPriceTierResult | ForkRequest | null> = [];

  for (const p of toResolve) {
    const outcome = resolveWithoutFork(p, ctx);
    if (!outcome) {
      prelim.push(null);
    } else if ("cacheKey" in outcome) {
      prelim.push(outcome);
      if (!forkRequestKeys.has(outcome.cacheKey)) {
        forkRequestKeys.add(outcome.cacheKey);
        forkRequests.push(outcome);
      }
    } else {
      prelim.push(outcome);
    }
  }

  const forkResults =
    forkRequests.length > 0
      ? await executeForkRequests(organizationId, forkRequests, ctx)
      : new Map<string, ResolveVariantForIncomingPriceTierResult>();

  const resolvedEligible: Array<ResolveVariantForIncomingPriceTierResult | null> = prelim.map(
    (outcome) => {
      if (!outcome) return null;
      if ("cacheKey" in outcome) {
        return forkResults.get(outcome.cacheKey) ?? null;
      }
      return outcome;
    },
  );

  let eligibleIdx = 0;
  return params.map((p) => {
    if (!p.organizationId || p.incomingPurPrice <= 0 || p.incomingSalePrice <= 0) return null;
    return resolvedEligible[eligibleIdx++] ?? null;
  });
}

/**
 * Resolve which variant should receive a purchase-line price sync.
 * When the incoming sale/MRP tier differs from the matched variant, keep the old
 * SKU unchanged and return (or create) a sibling variant for the new tier.
 */
export async function resolveVariantForIncomingPriceTier(
  params: ResolveVariantForIncomingPriceTierParams,
): Promise<ResolveVariantForIncomingPriceTierResult | null> {
  if (!params.organizationId) return null;
  const [result] = await resolveVariantsForIncomingPriceTiers([params]);
  return result ?? null;
}

export { importPriceTierKey };
