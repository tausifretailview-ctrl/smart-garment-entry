import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Phase 1: Child/item tables that don't have organization_id.
// Deleted via parent table join using the DB helper function.
// FK column names match the actual schema (verified 2026-04-17).
const CHILD_TABLES = [
  { child: "sale_items", fk: "sale_id", parent: "sales" },
  { child: "sale_return_items", fk: "return_id", parent: "sale_returns" },
  { child: "purchase_items", fk: "bill_id", parent: "purchase_bills" },
  { child: "purchase_return_items", fk: "return_id", parent: "purchase_returns" },
  { child: "quotation_items", fk: "quotation_id", parent: "quotations" },
  { child: "sale_order_items", fk: "order_id", parent: "sale_orders" },
  { child: "purchase_order_items", fk: "order_id", parent: "purchase_orders" },
  { child: "delivery_challan_items", fk: "challan_id", parent: "delivery_challans" },
  { child: "voucher_items", fk: "voucher_id", parent: "voucher_entries" },
];

// Phase 2: Tables with organization_id (child-first order).
// Order matters: delete dependents before parents to avoid FK violations.
const ORG_TABLES = [
  // Movement / audit
  "stock_movements",
  "batch_stock",
  "delivery_tracking",
  "dc_sale_transfers",
  // Transactions (parents of items already cleared in Phase 1)
  "sale_returns",
  "purchase_returns",
  "sales",
  "purchase_bills",
  "quotations",
  "sale_orders",
  "purchase_orders",
  "delivery_challans",
  "voucher_entries",
  // Customer money / loyalty
  "credit_notes",
  "advance_refunds",
  "customer_advances",
  "customer_balance_adjustments",
  "customer_brand_discounts",
  "customer_product_prices",
  "customer_points_history",
  "gift_redemptions",
  // Catalog
  "product_images",
  "product_variants",
  "products",
  // Masters
  "customers",
  "suppliers",
  "size_groups",
  "employees",
  // Misc
  "legacy_invoices",
  "drafts",
  "whatsapp_messages",
  "whatsapp_conversations",
  "whatsapp_logs",
  "sms_logs",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { organizationId, barcodeStartValue } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startValue = Number(barcodeStartValue) > 0 ? Number(barcodeStartValue) : 1;

    // Verify admin role
    const { data: membership } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only administrators can reset organization data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const deletedCounts: Record<string, number> = {};
    const errors: string[] = [];

    // Phase 1: Delete child/item tables via RPC helper
    for (const { child, fk, parent } of CHILD_TABLES) {
      try {
        const { data, error } = await adminClient.rpc("delete_child_rows_for_org", {
          p_child_table: child,
          p_fk_column: fk,
          p_parent_table: parent,
          p_organization_id: organizationId,
        });
        if (error) {
          console.error(`Phase 1 error for ${child}:`, error.message);
          errors.push(`${child}: ${error.message}`);
        } else {
          deletedCounts[child] = data || 0;
        }
      } catch (err: any) {
        console.error(`Phase 1 exception for ${child}:`, err.message);
        errors.push(`${child}: ${err.message}`);
      }
    }

    // Phase 2: Delete tables with organization_id directly
    for (const tableName of ORG_TABLES) {
      try {
        const { data, error } = await adminClient
          .from(tableName)
          .delete()
          .eq("organization_id", organizationId)
          .select("id");

        if (error) {
          if (error.code === "42703" || error.code === "42P01") {
            console.log(`Skipping ${tableName}: ${error.message}`);
            continue;
          }
          console.error(`Phase 2 error for ${tableName}:`, error.message);
          errors.push(`${tableName}: ${error.message}`);
        } else {
          deletedCounts[tableName] = data?.length || 0;
        }
      } catch (err: any) {
        errors.push(`${tableName}: ${err.message}`);
      }
    }

    // Phase 3: Reset sequences
    // barcode_sequence (singular) — upsert so a missing row gets created
    const { error: barcodeError } = await adminClient
      .from("barcode_sequence")
      .upsert(
        { organization_id: organizationId, next_barcode: startValue, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" }
      );
    if (barcodeError) {
      errors.push(`barcode_sequence reset: ${barcodeError.message}`);
    } else {
      deletedCounts["barcode_sequence"] = 1;
    }

    // bill_number_sequence (monthly counters)
    const { data: billSeqData, error: billSeqError } = await adminClient
      .from("bill_number_sequence")
      .delete()
      .eq("organization_id", organizationId)
      .select("id");
    if (billSeqError) {
      errors.push(`bill_number_sequence: ${billSeqError.message}`);
    } else {
      deletedCounts["bill_number_sequence"] = billSeqData?.length || 0;
    }

    // bill_number_sequences (series counters)
    const { data: billSeqs2Data, error: billSeqs2Error } = await adminClient
      .from("bill_number_sequences")
      .delete()
      .eq("organization_id", organizationId)
      .select("id");
    if (billSeqs2Error) {
      errors.push(`bill_number_sequences: ${billSeqs2Error.message}`);
    } else {
      deletedCounts["bill_number_sequences"] = billSeqs2Data?.length || 0;
    }

    // Log the reset
    await adminClient.from("backup_logs").insert({
      organization_id: organizationId,
      backup_type: "reset",
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_count: deletedCounts,
      error_message: errors.length > 0 ? errors.join("; ") : null,
    });

    const criticalTables = ["sales", "purchase_bills", "products", "customers", "product_variants", "suppliers"];
    const criticalErrors = errors.filter((e) => criticalTables.some((t) => e.startsWith(t + ":")));

    return new Response(
      JSON.stringify({
        success: criticalErrors.length === 0,
        deletedCounts,
        errors: errors.length > 0 ? errors : undefined,
        barcodeResetTo: startValue,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Reset organization error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
