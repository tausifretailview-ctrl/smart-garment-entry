import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export type UpdateType = "find_replace" | "update_field" | "apply_discount" | "update_gst" | "update_prices";

export interface FilterCriteria {
  category?: string;
  brand?: string;
  productName?: string;
  barcode?: string;
  style?: string;
  hsnCode?: string;
  gstPercent?: number | null;
}

export interface FindReplaceConfig {
  field: "product_name" | "category" | "brand" | "style" | "color" | "hsn_code";
  find: string;
  replace: string;
  exactMatch: boolean;
}

export interface UpdateFieldConfig {
  field: "category" | "brand" | "style" | "color" | "hsn_code" | "gst_per";
  value: string | number;
}

export interface DiscountConfig {
  discountType: "percentage" | "flat";
  value: number;
  applyTo: "sale_price" | "mrp";
}

export interface GSTConfig {
  currentGst: number | null;
  newGst: number;
}

export interface PriceConfig {
  priceType: "pur_price" | "sale_price" | "mrp";
  updateMethod: "set" | "increase" | "decrease";
  value: number;
}

export interface PreviewItem {
  id: string;
  productId: string;
  productName: string;
  style?: string;
  barcode?: string;
  size?: string;
  currentValue: string | number | null;
  newValue: string | number | null;
  type: "product" | "variant";
}

export const useBulkProductUpdate = () => {
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);

  const fetchFilterOptions = async () => {
    if (!currentOrganization) return { productNames: [], categories: [], brands: [], styles: [] };

    const { data: products } = await supabase
      .from("products")
      .select("product_name, category, brand, style")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);

    const productNames = [...new Set(products?.map(p => p.product_name).filter(Boolean) as string[])].sort();
    const categories = [...new Set(products?.map(p => p.category).filter(Boolean) as string[])].sort();
    const brands = [...new Set(products?.map(p => p.brand).filter(Boolean) as string[])].sort();
    const styles = [...new Set(products?.map(p => p.style).filter(Boolean) as string[])].sort();

    return { productNames, categories, brands, styles };
  };

  const fetchMatchingProducts = async (filters: FilterCriteria) => {
    if (!currentOrganization) return [];

    let query = supabase
      .from("products")
      .select("id, product_name, category, brand, style, color, hsn_code, gst_per")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);

    if (filters.category) query = query.eq("category", filters.category);
    if (filters.brand) query = query.eq("brand", filters.brand);
    if (filters.productName) query = query.ilike("product_name", `%${filters.productName}%`);
    if (filters.style) query = query.ilike("style", `%${filters.style}%`);
    if (filters.hsnCode) query = query.eq("hsn_code", filters.hsnCode);
    if (filters.gstPercent !== undefined && filters.gstPercent !== null) {
      query = query.eq("gst_per", filters.gstPercent);
    }

    const { data } = await query;
    return data || [];
  };

  const fetchMatchingVariants = async (filters: FilterCriteria) => {
    if (!currentOrganization) return [];

    let productsQuery = supabase
      .from("products")
      .select("id")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null);

    if (filters.category) productsQuery = productsQuery.eq("category", filters.category);
    if (filters.brand) productsQuery = productsQuery.eq("brand", filters.brand);
    if (filters.productName) productsQuery = productsQuery.ilike("product_name", `%${filters.productName}%`);
    if (filters.style) productsQuery = productsQuery.ilike("style", `%${filters.style}%`);

    const { data: products } = await productsQuery;
    if (!products?.length) return [];

    const productIds = products.map(p => p.id);

    let variantsQuery = supabase
      .from("product_variants")
      .select("id, product_id, barcode, size, color, mrp, sale_price, pur_price, products!inner(product_name, style)")
      .eq("organization_id", currentOrganization.id)
      .is("deleted_at", null)
      .in("product_id", productIds);

    if (filters.barcode) variantsQuery = variantsQuery.eq("barcode", filters.barcode);

    const { data } = await variantsQuery;
    return data || [];
  };

  const generatePreview = async (
    filters: FilterCriteria,
    updateType: UpdateType,
    config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig
  ) => {
    setLoading(true);
    try {
      const items: PreviewItem[] = [];

      if (updateType === "find_replace") {
        const frConfig = config as FindReplaceConfig;
        const products = await fetchMatchingProducts(filters);
        
        for (const product of products) {
          const currentValue = product[frConfig.field as keyof typeof product] as string | null;
          if (!currentValue) continue;

          let matches = false;
          let newValue = currentValue;

          if (frConfig.exactMatch) {
            matches = currentValue === frConfig.find;
            if (matches) newValue = frConfig.replace;
          } else {
            matches = currentValue.toLowerCase().includes(frConfig.find.toLowerCase());
            if (matches) {
              newValue = currentValue.replace(new RegExp(frConfig.find, "gi"), frConfig.replace);
            }
          }

          if (matches) {
            items.push({
              id: product.id,
              productId: product.id,
              productName: product.product_name,
              style: product.style || undefined,
              currentValue,
              newValue,
              type: "product",
            });
          }
        }
      } else if (updateType === "update_field") {
        const ufConfig = config as UpdateFieldConfig;
        const products = await fetchMatchingProducts(filters);
        
        for (const product of products) {
          const currentValue = product[ufConfig.field as keyof typeof product];
          items.push({
            id: product.id,
            productId: product.id,
            productName: product.product_name,
            style: product.style || undefined,
            currentValue: currentValue as string | number | null,
            newValue: ufConfig.value,
            type: "product",
          });
        }
      } else if (updateType === "update_gst") {
        const gstConfig = config as GSTConfig;
        let gstFilters = { ...filters };
        if (gstConfig.currentGst !== null) {
          gstFilters.gstPercent = gstConfig.currentGst;
        }
        const products = await fetchMatchingProducts(gstFilters);
        
        for (const product of products) {
          items.push({
            id: product.id,
            productId: product.id,
            productName: product.product_name,
            style: product.style || undefined,
            currentValue: product.gst_per,
            newValue: gstConfig.newGst,
            type: "product",
          });
        }
      } else if (updateType === "apply_discount" || updateType === "update_prices") {
        const variants = await fetchMatchingVariants(filters);
        
        for (const variant of variants) {
          const productData = variant.products as { product_name: string; style: string | null };
          
          if (updateType === "apply_discount") {
            const discConfig = config as DiscountConfig;
            const currentPrice = discConfig.applyTo === "sale_price" ? variant.sale_price : variant.mrp;
            let newPrice: number;

            if (discConfig.discountType === "percentage") {
              newPrice = (currentPrice || 0) * (1 - discConfig.value / 100);
            } else {
              newPrice = (currentPrice || 0) - discConfig.value;
            }

            items.push({
              id: variant.id,
              productId: variant.product_id,
              productName: productData.product_name,
              style: productData.style || undefined,
              barcode: variant.barcode || undefined,
              size: variant.size,
              currentValue: currentPrice,
              newValue: Math.round(newPrice * 100) / 100,
              type: "variant",
            });
          } else {
            const priceConfig = config as PriceConfig;
            const currentPrice = variant[priceConfig.priceType as keyof typeof variant] as number | null;
            let newPrice: number;

            if (priceConfig.updateMethod === "set") {
              newPrice = priceConfig.value;
            } else if (priceConfig.updateMethod === "increase") {
              newPrice = (currentPrice || 0) * (1 + priceConfig.value / 100);
            } else {
              newPrice = (currentPrice || 0) * (1 - priceConfig.value / 100);
            }

            items.push({
              id: variant.id,
              productId: variant.product_id,
              productName: productData.product_name,
              style: productData.style || undefined,
              barcode: variant.barcode || undefined,
              size: variant.size,
              currentValue: currentPrice,
              newValue: Math.round(newPrice * 100) / 100,
              type: "variant",
            });
          }
        }
      }

      setPreviewItems(items);
      return items;
    } finally {
      setLoading(false);
    }
  };

  // Field mappings for cascade updates
  const purchaseItemsFieldMap: Record<string, string> = {
    product_name: "product_name",
    category: "category",
    brand: "brand",
    style: "style",
    hsn_code: "hsn_code",
    gst_per: "gst_per",
  };

  const saleItemsFieldMap: Record<string, string> = {
    product_name: "product_name",
    hsn_code: "hsn_code",
    gst_per: "gst_percent",
  };

  const cascadeToTransactionItems = async (
    field: string,
    value: string | number | null,
    productIds: string[]
  ) => {
    if (!currentOrganization || !productIds.length) return;

    const piField = purchaseItemsFieldMap[field];
    if (piField) {
      await (supabase
        .from("purchase_items")
        .update({ [piField]: value } as any) as any)
        .in("product_id", productIds)
        .eq("organization_id", currentOrganization.id);
    }

    const siField = saleItemsFieldMap[field];
    if (siField) {
      await (supabase
        .from("sale_items")
        .update({ [siField]: value } as any) as any)
        .in("product_id", productIds)
        .eq("organization_id", currentOrganization.id);
    }
  };

  const applyUpdates = async (
    updateType: UpdateType,
    config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig,
    items: PreviewItem[]
  ) => {
    if (!currentOrganization || !items.length) return false;

    setLoading(true);
    try {
      const productItems = items.filter(i => i.type === "product");
      const variantItems = items.filter(i => i.type === "variant");

      // Update products
      if (productItems.length > 0) {
        if (updateType === "find_replace") {
          const frConfig = config as FindReplaceConfig;
          for (const item of productItems) {
            await supabase
              .from("products")
              .update({ [frConfig.field]: item.newValue })
              .eq("id", item.id);

            // Cascade to transaction items
            await cascadeToTransactionItems(frConfig.field, item.newValue, [item.id]);
          }
        } else if (updateType === "update_field") {
          const ufConfig = config as UpdateFieldConfig;
          const ids = productItems.map(i => i.id);
          await supabase
            .from("products")
            .update({ [ufConfig.field]: ufConfig.value })
            .in("id", ids);

          // Cascade to transaction items
          await cascadeToTransactionItems(ufConfig.field, ufConfig.value, ids);
        } else if (updateType === "update_gst") {
          const gstConfig = config as GSTConfig;
          const ids = productItems.map(i => i.id);
          await supabase
            .from("products")
            .update({ gst_per: gstConfig.newGst })
            .in("id", ids);

          // Cascade GST to transaction items
          await cascadeToTransactionItems("gst_per", gstConfig.newGst, ids);
        }
      }

      // Update variants
      if (variantItems.length > 0) {
        if (updateType === "apply_discount") {
          const discConfig = config as DiscountConfig;
          for (const item of variantItems) {
            await supabase
              .from("product_variants")
              .update({ [discConfig.applyTo]: item.newValue })
              .eq("id", item.id);
          }
        } else if (updateType === "update_prices") {
          const priceConfig = config as PriceConfig;
          for (const item of variantItems) {
            await supabase
              .from("product_variants")
              .update({ [priceConfig.priceType]: item.newValue })
              .eq("id", item.id);
          }
        }
      }

      toast.success(`Successfully updated ${items.length} items`);
      setPreviewItems([]);
      return true;
    } catch (error) {
      console.error("Bulk update error:", error);
      toast.error("Failed to apply updates");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    previewItems,
    fetchFilterOptions,
    fetchMatchingProducts,
    fetchMatchingVariants,
    generatePreview,
    applyUpdates,
    clearPreview: () => setPreviewItems([]),
  };
};
