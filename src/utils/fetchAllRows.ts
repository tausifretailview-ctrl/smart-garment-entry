import { supabase } from "@/integrations/supabase/client";
import { isCustomerReceiptVoucher } from "@/utils/paymentVoucherFilters";
import { fetchItemsGrossBySaleId as fetchItemsGrossBySaleIdRpc } from "@/utils/fetchItemsGrossBySaleId";

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

export type CustomerPartyBalanceRpcRow = {
  customer_id: string;
  customer_name: string;
  signed_balance: number;
  advance_available: number;
  direction: string;
  net_position: number;
  total_dr: number;
  total_cr: number;
  net_receivable: number;
};

/**
 * Fetch all rows from get_customer_party_balances (PostgREST default cap is 1000).
 */
export async function fetchAllCustomerPartyBalances(
  organizationId: string,
): Promise<CustomerPartyBalanceRpcRow[]> {
  const allRows: CustomerPartyBalanceRpcRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .rpc("get_customer_party_balances", {
        p_organization_id: organizationId,
      })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching customer party balances:", error);
      throw error;
    }

    const page = (data ?? []) as CustomerPartyBalanceRpcRow[];
    if (page.length === 0) break;

    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

export type StockReconciliationRow = {
  variant_id: string;
  barcode: string | null;
  product_name: string | null;
  size: string | null;
  color: string | null;
  stored_stock_qty: number;
  opening_qty: number;
  purchases: number;
  sales: number;
  purchase_returns: number;
  sale_returns: number;
  pending_dc: number;
  recomputed_stock_qty: number;
  drift: number;
};

/**
 * Fetch all rows from get_stock_reconciliation (PostgREST default cap is 1000).
 */
export async function fetchAllStockReconciliation(
  organizationId: string,
): Promise<StockReconciliationRow[]> {
  const allRows: StockReconciliationRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .rpc("get_stock_reconciliation", {
        p_organization_id: organizationId,
      })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching stock reconciliation:", error);
      throw error;
    }

    const page = (data ?? []) as StockReconciliationRow[];
    if (page.length === 0) break;

    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

/**
 * Fetch id → phone map for an organization (lightweight join for party balance search).
 */
export async function fetchCustomerPhoneMap(organizationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching customer phones:", error);
      throw error;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        if (row.id) map.set(row.id, row.phone ?? "");
      }
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return map;
}

export type SupplierPartyBalanceRpcRow = {
  supplier_id: string;
  supplier_name: string;
  signed_balance: number;
  direction: string;
  total_cr: number;
  total_dr: number;
  net_payable: number;
};

/**
 * Fetch all rows from get_supplier_party_balances (PostgREST default cap is 1000).
 */
export async function fetchAllSupplierPartyBalances(
  organizationId: string,
): Promise<SupplierPartyBalanceRpcRow[]> {
  const allRows: SupplierPartyBalanceRpcRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .rpc("get_supplier_party_balances", {
        p_organization_id: organizationId,
      })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching supplier party balances:", error);
      throw error;
    }

    const page = (data ?? []) as SupplierPartyBalanceRpcRow[];
    if (page.length === 0) break;

    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

export type OrphanedProductRpcRow = {
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  created_at: string | null;
  total_stock: number;
  user_cancelled_at: string | null;
  reason: string;
};

/**
 * Fetch all rows from get_orphaned_products (PostgREST default cap is 1000).
 */
export async function fetchAllOrphanedProducts(
  organizationId: string,
): Promise<OrphanedProductRpcRow[]> {
  const allRows: OrphanedProductRpcRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .rpc("get_orphaned_products", {
        p_organization_id: organizationId,
      })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching orphaned products:", error);
      throw error;
    }

    const page = (data ?? []) as OrphanedProductRpcRow[];
    if (page.length === 0) break;

    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

export type SoftDeleteOrphanedProductsResult = {
  deleted_count: number;
  skipped: Array<{ product_id: string; reason: string }>;
};

/**
 * Soft-delete orphaned products (server re-checks orphan status). Product + variants atomically per id.
 */
export async function softDeleteOrphanedProducts(
  organizationId: string,
  productIds: string[],
): Promise<SoftDeleteOrphanedProductsResult> {
  if (productIds.length === 0) {
    return { deleted_count: 0, skipped: [] };
  }

  const { data, error } = await supabase.rpc("soft_delete_orphaned_products", {
    p_organization_id: organizationId,
    p_product_ids: productIds,
  });

  if (error) {
    console.error("Error soft-deleting orphaned products:", error);
    throw error;
  }

  const payload = (data ?? { deleted_count: 0, skipped: [] }) as {
    deleted_count?: number;
    skipped?: Array<{ product_id: string; reason: string }>;
  };

  return {
    deleted_count: Number(payload.deleted_count ?? 0),
    skipped: Array.isArray(payload.skipped) ? payload.skipped : [],
  };
}

/** Fetch id → phone map for supplier party balance search. */
export async function fetchSupplierPhoneMap(organizationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching supplier phones:", error);
      throw error;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        if (row.id) map.set(row.id, row.phone ?? "");
      }
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return map;
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
      .select(
        "id, customer_id, net_amount, paid_amount, cash_amount, card_amount, upi_amount, payment_status, sale_date, sale_number, customer_name, sale_return_adjust",
      )
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

/** Σ(mrp × qty) per sale — for customer balance pre/post-return gating. */
export async function fetchItemsGrossBySaleId(
  organizationId: string,
  saleIds: string[],
): Promise<Map<string, number>> {
  if (!organizationId || saleIds.length === 0) return new Map();
  return fetchItemsGrossBySaleIdRpc(supabase, saleIds);
}

const TRUE_OUTSTANDING_RPC_CHUNK = 25;

/**
 * Lifetime outstanding per customer via `get_customer_true_outstanding` (matches Customer Ledger / audit RPC).
 */
export async function fetchCustomerTrueOutstandingMap(
  organizationId: string,
  customerIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(customerIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += TRUE_OUTSTANDING_RPC_CHUNK) {
    const chunk = unique.slice(i, i + TRUE_OUTSTANDING_RPC_CHUNK);
    const rows = await Promise.all(
      chunk.map(async (customerId) => {
        const { data, error } = await (supabase.rpc as any)("get_customer_true_outstanding", {
          p_customer_id: customerId,
          p_organization_id: organizationId,
        });
        if (error) throw error;
        return { customerId, balance: Math.round(Number(data || 0)) };
      }),
    );
    rows.forEach((r) => map.set(r.customerId, r.balance));
  }
  return map;
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

const CUSTOMER_RECEIPT_VOUCHER_SELECT =
  "id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, reference_id, payment_method, discount_amount, discount_reason, receiving_bank_account_id, created_at";

/**
 * Fetch customer payment receipts only (RCP), ordered by entry time (created_at).
 * Unlike the shared Accounts voucher list (all types, mixed sorts), this
 * avoids older receipts being buried under high-volume expense/salary vouchers.
 */
export async function fetchCustomerReceiptVouchers(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("voucher_entries")
      .select(CUSTOMER_RECEIPT_VOUCHER_SELECT)
      .eq("organization_id", organizationId)
      .ilike("voucher_type", "receipt")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error fetching customer receipt vouchers:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data.filter(isCustomerReceiptVoucher));
      offset += pageSize;
      hasMore = data.length === pageSize;
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
  selectFields: string = "id, pur_price",
  organizationId?: string,
) {
  if (variantIds.length === 0) return [];

  const allRows: any[] = [];
  const batchSize = 500;

  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batchIds = variantIds.slice(i, i + batchSize);
    // F6 (Batch C2): pass organization_id so the planner uses the
    // (organization_id, id) composite path instead of an RLS-only scan.
    let query = supabase.from("product_variants").select(selectFields).in("id", batchIds);
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;

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
 * Fetch all purchase items for one bill — bypasses PostgREST 1000-row default cap.
 * Orders by line_number when the column exists (entry order); falls back otherwise.
 */
export async function fetchPurchaseItemsByBillId(
  billId: string,
  selectFields: string = "*",
  options?: { includeDeleted?: boolean },
) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;
  let orderByLineNumber = true;

  while (hasMore) {
    let query = supabase
      .from("purchase_items")
      .select(selectFields)
      .eq("bill_id", billId);

    if (orderByLineNumber) {
      query = query.order("line_number", { ascending: true });
    }
    query = query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!options?.includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query;

    if (error) {
      const msg = String(error.message || "");
      if (orderByLineNumber && /line_number/i.test(msg)) {
        orderByLineNumber = false;
        offset = 0;
        allRows.length = 0;
        hasMore = true;
        continue;
      }
      console.error("Error fetching purchase items for bill:", error);
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
  for (const billId of billIds) {
    const items = await fetchPurchaseItemsByBillId(billId, selectFields);
    allRows.push(...items);
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
      .select("id, bill_date, supplier_name, supplier_invoice_no, gross_amount, gst_amount, net_amount, total_qty, supplier_id")
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
