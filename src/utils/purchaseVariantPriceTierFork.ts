import { supabase } from "@/integrations/supabase/client";
import { effectiveBarcodePriceTier } from "@/utils/barcodeValidation";
import {
  importPriceTierKey,
  makePurchaseImportProductKey,
} from "@/utils/purchaseImportBarcodeTier";

export const PURCHASE_PRICE_TIER_TOLERANCE = 0.009;

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

export function purchasePriceTiersMatch(
  existing: PriceTierLike,
  incoming: PriceTierLike,
  tolerance = PURCHASE_PRICE_TIER_TOLERANCE,
): boolean {
  const existingTier = purchasePriceTierValue(existing);
  const incomingTier = purchasePriceTierValue(incoming);
  if (incomingTier <= 0 || existingTier <= 0) return true;
  return Math.abs(existingTier - incomingTier) <= tolerance;
}

type VariantPriceRow = {
  id: string;
  product_id: string;
  size: string;
  color: string | null;
  barcode: string | null;
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

function parsePurchaseDate(purchaseDate?: string | null): string {
  if (purchaseDate && String(purchaseDate).trim()) {
    const trimmed = String(purchaseDate).trim();
    return new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed,
    ).toISOString();
  }
  return new Date().toISOString();
}

async function fetchVariantById(
  organizationId: string,
  variantId: string,
): Promise<VariantPriceRow | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, size, color, barcode, pur_price, sale_price, mrp")
    .eq("organization_id", organizationId)
    .eq("id", variantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as VariantPriceRow | null) ?? null;
}

async function fetchVariantsByBarcode(
  organizationId: string,
  barcode: string,
): Promise<VariantPriceRow[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, size, color, barcode, pur_price, sale_price, mrp")
    .eq("organization_id", organizationId)
    .eq("barcode", barcode)
    .is("deleted_at", null);
  if (error) throw error;
  return (data as VariantPriceRow[]) ?? [];
}

async function fetchProduct(organizationId: string, productId: string): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, product_name, brand, category, color, style, hsn_code, gst_per, purchase_gst_percent, sale_gst_percent, uom, requires_imei, default_pur_price, default_sale_price",
    )
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as ProductRow | null) ?? null;
}

async function findProductIdForTier(
  organizationId: string,
  sourceProduct: ProductRow,
  incomingSalePrice: number,
  incomingMrp?: number,
): Promise<string | null> {
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

  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, brand, category, color, style, default_sale_price")
    .eq("organization_id", organizationId)
    .eq("product_name", sourceProduct.product_name)
    .is("deleted_at", null);
  if (error) throw error;

  for (const row of data ?? []) {
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

async function forkProductAndVariantForTier(args: {
  organizationId: string;
  sourceVariant: VariantPriceRow;
  sourceProduct: ProductRow;
  incomingPurPrice: number;
  incomingSalePrice: number;
  incomingMrp?: number;
  purchaseDate?: string | null;
}): Promise<ResolveVariantForIncomingPriceTierResult> {
  const {
    organizationId,
    sourceVariant,
    sourceProduct,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
  } = args;

  let productId = await findProductIdForTier(
    organizationId,
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
      })
      .select("id")
      .single();
    if (productError) throw productError;
    productId = createdProduct.id;
  }

  const barcode = (sourceVariant.barcode || "").trim();
  const lastPurchaseDate = parsePurchaseDate(purchaseDate);
  const mrpVal = Number(incomingMrp) || 0;

  const variantInsert: Record<string, unknown> = {
    organization_id: organizationId,
    product_id: productId,
    size: sourceVariant.size || "",
    color: sourceVariant.color,
    barcode,
    barcode_source: barcode ? "external" : "generated",
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

  const { data: createdVariant, error: variantError } = await supabase
    .from("product_variants")
    .insert(variantInsert as never)
    .select("id")
    .single();
  if (variantError) throw variantError;

  return {
    variantId: createdVariant.id,
    productId,
    forked: true,
  };
}

/**
 * Resolve which variant should receive a purchase-line price sync.
 * When the incoming sale/MRP tier differs from the matched variant, keep the old
 * SKU unchanged and return (or create) a sibling variant for the new tier.
 */
export async function resolveVariantForIncomingPriceTier(
  params: ResolveVariantForIncomingPriceTierParams,
): Promise<ResolveVariantForIncomingPriceTierResult | null> {
  const {
    organizationId,
    variantId,
    barcode,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
  } = params;

  if (!organizationId) return null;
  if (incomingPurPrice <= 0 || incomingSalePrice <= 0) return null;

  const incomingTier = { mrp: incomingMrp, salePrice: incomingSalePrice };

  let sourceVariant: VariantPriceRow | null = null;
  if (variantId) {
    sourceVariant = await fetchVariantById(organizationId, variantId);
  }
  const lookupBarcode = (barcode || sourceVariant?.barcode || "").trim();
  if (!sourceVariant && lookupBarcode) {
    const siblings = await fetchVariantsByBarcode(organizationId, lookupBarcode);
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
    const siblings = await fetchVariantsByBarcode(organizationId, lookupBarcode);
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

  const sourceProduct = await fetchProduct(organizationId, sourceVariant.product_id);
  if (!sourceProduct) return null;

  return forkProductAndVariantForTier({
    organizationId,
    sourceVariant,
    sourceProduct,
    incomingPurPrice,
    incomingSalePrice,
    incomingMrp,
    purchaseDate,
  });
}

export { importPriceTierKey };
