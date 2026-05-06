import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all customers for an organization using range pagination.
 * This bypasses the default 1000-row limit.
 */
export async function fetchAllCustomers(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone, email, gst_number, address, opening_balance, points_balance, discount_percent")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("customer_name")
      .order("id") // Secondary order for deterministic pagination
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching customers:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all sales summary for an organization using range pagination.
 * Uses minimal fields for performance.
 */
export async function fetchAllSalesSummary(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, customer_id, net_amount, paid_amount, payment_status, sale_date, sale_number, customer_name, sale_return_adjust")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .neq("payment_status", "hold")
      .eq("is_cancelled", false)
      .order("sale_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching sales:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all sales for an organization with full details using range pagination.
 */
export async function fetchAllSalesDetails(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_date, sale_number, customer_name, customer_id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, cash_amount, card_amount, upi_amount, payment_method, payment_status, sale_type, refund_amount, sale_return_adjust, points_redeemed_amount, round_off")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .order("sale_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching sales details:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all suppliers for an organization using range pagination.
 */
export async function fetchAllSuppliers(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name, phone, email, gst_number, address, opening_balance")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("supplier_name")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching suppliers:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all products for an organization using range pagination.
 */
export async function fetchAllProducts(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, category, style, product_type, gst_per, hsn_code, status, image_url, organization_id, product_variants(id, size, color, barcode, sale_price, pur_price, mrp, stock_qty, active, deleted_at, product_id, organization_id)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching products:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  // Filter out deleted variants
  const productsWithValidVariants = allRows.map((product: any) => ({
    ...product,
    product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
  }));

  return productsWithValidVariants;
}

/**
 * Fetch all voucher entries for an organization using range pagination.
 */
export async function fetchAllVouchers(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("voucher_entries")
      .select("id, voucher_number, voucher_date, voucher_type, total_amount, description")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching vouchers:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all product variants for an organization using range pagination.
 */
export async function fetchAllVariants(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("*, products!inner (product_name, brand, category, deleted_at)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .is("products.deleted_at", null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching variants:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all sale items for given sale IDs using range pagination.
 * Handles large datasets by batching sale IDs and paginating results.
 */
export async function fetchAllSaleItems(saleIds: string[]) {
  const allRows: any[] = [];
  const batchSize = 500; // Smaller batch for .in() queries

  for (let i = 0; i < saleIds.length; i += batchSize) {
    const batchIds = saleIds.slice(i, i + batchSize);
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          "variant_id, quantity, line_total, unit_price, mrp, discount_percent, discount_share, round_off_share, net_after_discount, gst_percent, product_id, product_name, sale_id, hsn_code, is_dc_item, barcode, size, color"
        )
        .in("sale_id", batchIds)
        .is("deleted_at", null)
        .order("id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Error fetching sale items:", error);
        throw error;
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        offset += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
  }

  return allRows;
}

/**
 * Fetch all purchase items for given variant IDs using range pagination.
 */
export async function fetchAllPurchaseItems(variantIds: string[]) {
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batchIds = variantIds.slice(i, i + batchSize);
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("sku_id, bill_id")
        .in("sku_id", batchIds)
        .is("deleted_at", null)
        .order("id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Error fetching purchase items:", error);
        throw error;
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        offset += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
  }

  return allRows;
}

/**
 * Fetch product variants by IDs using batched queries to bypass the 1000 limit.
 * Used for COGS calculation, profit reports, etc.
 */
export async function fetchVariantsByIds(
  variantIds: string[], 
  selectFields: string = "id, pur_price"
) {
  if (variantIds.length === 0) return [];
  
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batchIds = variantIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("product_variants")
      .select(selectFields)
      .in("id", batchIds);
    
    if (error) {
      console.error("Error fetching variants by IDs:", error);
      throw error;
    }
    if (data) allRows.push(...data);
  }

  return allRows;
}

/**
 * Fetch products by IDs using batched queries to bypass the 1000 limit.
 */
export async function fetchProductsByIds(
  productIds: string[], 
  selectFields: string = "id, product_name, brand, category, color"
) {
  if (productIds.length === 0) return [];
  
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < productIds.length; i += batchSize) {
    const batchIds = productIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("products")
      .select(selectFields)
      .in("id", batchIds);
    
    if (error) {
      console.error("Error fetching products by IDs:", error);
      throw error;
    }
    if (data) allRows.push(...data);
  }

  return allRows;
}

/**
 * Fetch sale return items by return IDs using batched queries.
 */
export async function fetchSaleReturnItemsByIds(
  returnIds: string[],
  selectFields: string = "return_id, gst_percent, line_total"
) {
  if (returnIds.length === 0) return [];
  
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < returnIds.length; i += batchSize) {
    const batchIds = returnIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("sale_return_items")
      .select(selectFields)
      .in("return_id", batchIds);
    
    if (error) {
      console.error("Error fetching sale return items:", error);
      throw error;
    }
    if (data) allRows.push(...data);
  }

  return allRows;
}

/**
 * Fetch purchase return items by return IDs using batched queries.
 */
export async function fetchPurchaseReturnItemsByIds(
  returnIds: string[],
  selectFields: string = "return_id, gst_per, line_total"
) {
  if (returnIds.length === 0) return [];
  
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < returnIds.length; i += batchSize) {
    const batchIds = returnIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("purchase_return_items")
      .select(selectFields)
      .in("return_id", batchIds);
    
    if (error) {
      console.error("Error fetching purchase return items:", error);
      throw error;
    }
    if (data) allRows.push(...data);
  }

  return allRows;
}

/**
 * Fetch purchase items by bill IDs using batched queries.
 */
export async function fetchPurchaseItemsByBillIds(
  billIds: string[],
  selectFields: string = "bill_id, gst_per, line_total"
) {
  if (billIds.length === 0) return [];
  
  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < billIds.length; i += batchSize) {
    const batchIds = billIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("purchase_items")
      .select(selectFields)
      .in("bill_id", batchIds);
    
    if (error) {
      console.error("Error fetching purchase items by bill IDs:", error);
      throw error;
    }
    if (data) allRows.push(...data);
  }

  return allRows;
}

/**
 * Fetch all sales with filters using range pagination.
 */
export async function fetchAllSalesWithFilters(
  organizationId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
    saleType?: string;
  }
) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("sales")
      .select("id, sale_date, sale_number, customer_name, customer_id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, cash_amount, card_amount, upi_amount, payment_method, payment_status, sale_type, refund_amount, sale_return_adjust, points_redeemed_amount, round_off")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .order("sale_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (filters?.startDate) {
      query = query.gte("sale_date", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte("sale_date", filters.endDate);
    }
    if (filters?.customerId) {
      query = query.eq("customer_id", filters.customerId);
    }
    if (filters?.saleType) {
      query = query.eq("sale_type", filters.saleType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching sales with filters:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all purchase bills with filters using range pagination.
 */
export async function fetchAllPurchaseBillsWithFilters(
  organizationId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    supplierId?: string;
  }
) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("purchase_bills")
      .select("id, bill_date, supplier_name, supplier_invoice_no, gross_amount, gst_amount, net_amount, supplier_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("bill_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (filters?.startDate) {
      query = query.gte("bill_date", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte("bill_date", filters.endDate);
    }
    if (filters?.supplierId) {
      query = query.eq("supplier_id", filters.supplierId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching purchase bills with filters:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Fetch all vouchers with filters using range pagination.
 */
export async function fetchAllVouchersWithFilters(
  organizationId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    voucherType?: string;
  }
) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("voucher_entries")
      .select("id, voucher_number, voucher_date, voucher_type, total_amount, payment_method, description")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("voucher_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (filters?.startDate) {
      query = query.gte("voucher_date", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte("voucher_date", filters.endDate);
    }
    if (filters?.voucherType) {
      query = query.eq("voucher_type", filters.voucherType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching vouchers with filters:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}
