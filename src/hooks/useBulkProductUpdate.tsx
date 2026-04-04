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

    const allRows: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
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

      const { data } = await query.order("id").range(offset, offset + pageSize - 1);
      if (data && data.length > 0) {
        allRows.push(...data);
        offset += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return allRows;
  };

  const fetchMatchingVariants = async (filters: FilterCriteria) => {
    if (!currentOrganization) return [];

    // Paginate product IDs fetch
    const allProductIds: string[] = [];
    let pOffset = 0;
    const pPageSize = 1000;
    let pHasMore = true;

    while (pHasMore) {
      let productsQuery = supabase
        .from("products")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (filters.category) productsQuery = productsQuery.eq("category", filters.category);
      if (filters.brand) productsQuery = productsQuery.eq("brand", filters.brand);
      if (filters.productName) productsQuery = productsQuery.ilike("product_name", `%${filters.productName}%`);
      if (filters.style) productsQuery = productsQuery.ilike("style", `%${filters.style}%`);

      const { data: products } = await productsQuery.order("id").range(pOffset, pOffset + pPageSize - 1);
      if (products && products.length > 0) {
        allProductIds.push(...products.map(p => p.id));
        pOffset += pPageSize;
        pHasMore = products.length === pPageSize;
      } else {
        pHasMore = false;
      }
    }

    if (!allProductIds.length) return [];

    // Paginate variants fetch in batches of product IDs
    const allVariants: any[] = [];
    const batchSize = 500;

    for (let i = 0; i < allProductIds.length; i += batchSize) {
      const batchIds = allProductIds.slice(i, i + batchSize);
      let vOffset = 0;
      let vHasMore = true;

      while (vHasMore) {
        let variantsQuery = supabase
          .from("product_variants")
          .select("id, product_id, barcode, size, color, mrp, sale_price, pur_price, products!inner(product_name, style)")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .in("product_id", batchIds);

        if (filters.barcode) variantsQuery = variantsQuery.eq("barcode", filters.barcode);

        const { data } = await variantsQuery.order("id").range(vOffset, vOffset + 1000 - 1);
        if (data && data.length > 0) {
          allVariants.push(...data);
          vOffset += 1000;
          vHasMore = data.length === 1000;
        } else {
          vHasMore = false;
        }
      }
    }

    return allVariants;
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

  const logUpdateHistory = async (
    updateType: UpdateType,
    config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig,
    filters: FilterCriteria,
    items: PreviewItem[]
  ) => {
    if (!currentOrganization) return;
    const { data: { user } } = await supabase.auth.getUser();
    const summary = items.slice(0, 20).map(i => ({
      name: i.productName,
      from: i.currentValue,
      to: i.newValue,
      type: i.type,
      barcode: i.barcode,
      size: i.size,
    }));
    await supabase.from("bulk_update_history" as any).insert({
      organization_id: currentOrganization.id,
      update_type: updateType,
      filters: filters as any,
      config: config as any,
      items_count: items.length,
      items_summary: summary as any,
      created_by: user?.id,
    } as any);
  };

  const fetchHistory = async () => {
    if (!currentOrganization) return [];
    const { data } = await (supabase
      .from("bulk_update_history" as any)
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .order("created_at", { ascending: false })
      .limit(20) as any);
    return data || [];
  };

  const batchUpdateProducts = async (ids: string[], updateData: Record<string, any>) => {
    const batchSize = 500;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { error } = await supabase
        .from("products")
        .update(updateData)
        .in("id", batch);
      if (error) throw error;
    }
  };

  const batchCascade = async (field: string, value: string | number | null, ids: string[]) => {
    const batchSize = 500;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await cascadeToTransactionItems(field, value, batch);
    }
  };

  const batchUpsertVariants = async (upsertData: any[]) => {
    const batchSize = 500;
    for (let i = 0; i < upsertData.length; i += batchSize) {
      const batch = upsertData.slice(i, i + batchSize);
      const { error } = await (supabase
        .from("product_variants") as any)
        .upsert(batch, { onConflict: 'id' });
      if (error) throw error;
    }
  };

  const applyUpdates = async (
    updateType: UpdateType,
    config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig,
    items: PreviewItem[],
    filters?: FilterCriteria
  ) => {
    if (!currentOrganization || !items.length) return false;

    setLoading(true);
    try {
      const productItems = items.filter(i => i.type === "product");
      const variantItems = items.filter(i => i.type === "variant");

      // Update products in batches
      if (productItems.length > 0) {
        const ids = productItems.map(i => i.id);

        if (updateType === "find_replace") {
          const frConfig = config as FindReplaceConfig;
          // For find_replace, each product may have different newValue
          // Group by newValue to batch efficiently
          const valueGroups = new Map<string, string[]>();
          for (const item of productItems) {
            const key = String(item.newValue ?? "");
            if (!valueGroups.has(key)) valueGroups.set(key, []);
            valueGroups.get(key)!.push(item.id);
          }
          for (const [val, groupIds] of valueGroups) {
            await batchUpdateProducts(groupIds, { [frConfig.field]: val });
            await batchCascade(frConfig.field, val, groupIds);
          }
        } else if (updateType === "update_field") {
          const ufConfig = config as UpdateFieldConfig;
          await batchUpdateProducts(ids, { [ufConfig.field]: ufConfig.value });
          await batchCascade(ufConfig.field, ufConfig.value, ids);
        } else if (updateType === "update_gst") {
          const gstConfig = config as GSTConfig;
          await batchUpdateProducts(ids, { gst_per: gstConfig.newGst });
          await batchCascade("gst_per", gstConfig.newGst, ids);
        }
      }

      // Update variants in batches
      if (variantItems.length > 0) {
        if (updateType === "apply_discount") {
          const discConfig = config as DiscountConfig;
          const upsertData = variantItems.map(item => ({
            id: item.id,
            [discConfig.applyTo]: item.newValue,
            organization_id: currentOrganization.id,
          }));
          await batchUpsertVariants(upsertData);
        } else if (updateType === "update_prices") {
          const priceConfig = config as PriceConfig;
          const upsertData = variantItems.map(item => ({
            id: item.id,
            [priceConfig.priceType]: item.newValue,
            organization_id: currentOrganization.id,
          }));
          await batchUpsertVariants(upsertData);
        }
      }

      // Log history
      await logUpdateHistory(updateType, config, filters || {}, items);

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
    setPreviewItems,
    fetchFilterOptions,
    fetchMatchingProducts,
    fetchMatchingVariants,
    generatePreview,
    applyUpdates,
    fetchHistory,
    clearPreview: () => setPreviewItems([]),
  };
};
