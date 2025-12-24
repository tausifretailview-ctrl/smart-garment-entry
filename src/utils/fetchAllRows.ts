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
