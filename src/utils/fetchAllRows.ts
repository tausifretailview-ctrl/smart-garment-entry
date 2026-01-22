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
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("customer_name")
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

  console.log(`Fetched ${allRows.length} total customers`);
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
      .select("id, customer_id, net_amount, paid_amount, payment_status, sale_date, sale_number, customer_name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
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

  console.log(`Fetched ${allRows.length} total sales`);
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
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
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

  console.log(`Fetched ${allRows.length} total sales with details`);
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
      .select("*")
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

  console.log(`Fetched ${allRows.length} total suppliers`);
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
      .select("*, product_variants (*)")
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

  console.log(`Fetched ${productsWithValidVariants.length} total products`);
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
      .select("*")
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

  console.log(`Fetched ${allRows.length} total vouchers`);
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

  console.log(`Fetched ${allRows.length} total variants`);
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
        .select("variant_id, quantity, line_total, gst_percent, product_id, product_name, sale_id")
        .in("sale_id", batchIds)
        .is("deleted_at", null)
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

  console.log(`Fetched ${allRows.length} total sale items`);
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

  console.log(`Fetched ${allRows.length} total purchase items`);
  return allRows;
}
