import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Tables to delete in order (child tables first to respect FK constraints)
const DELETION_ORDER = [
  "sale_items",
  "sale_return_items",
  "purchase_return_items",
  "purchase_items",
  "quotation_items",
  "sale_order_items",
  "purchase_order_items",
  "delivery_challan_items",
  "voucher_items",
  "stock_movements",
  "batch_stock",
  "delivery_tracking",
  "sale_returns",
  "purchase_returns",
  "sales",
  "purchase_bills",
  "quotations",
  "sale_orders",
  "purchase_orders",
  "delivery_challans",
  "credit_notes",
  "customer_advances",
  "customer_brand_discounts",
  "customer_product_prices",
  "customer_points_history",
  "gift_redemptions",
  "product_images",
  "product_variants",
  "products",
  "customers",
  "suppliers",
  "size_groups",
  "employees",
  "legacy_invoices",
  "drafts",
  "whatsapp_messages",
  "whatsapp_conversations",
  "whatsapp_logs",
  "sms_logs",
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for deletions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // First verify the user with their token
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

    // Parse request body
    const { organizationId, barcodeStartValue } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin of this organization
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ error: "User is not a member of this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (membership.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only administrators can reset organization data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for deletions (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const deletedCounts: Record<string, number> = {};
    const errors: string[] = [];

    // Delete data from each table in order
    for (const tableName of DELETION_ORDER) {
      try {
        const { data, error } = await adminClient
          .from(tableName)
          .delete()
          .eq("organization_id", organizationId)
          .select("id");

        if (error) {
          // Some tables might not have organization_id, skip them
          if (error.code === "42703") {
            console.log(`Table ${tableName} does not have organization_id column, skipping`);
            continue;
          }
          errors.push(`${tableName}: ${error.message}`);
        } else {
          deletedCounts[tableName] = data?.length || 0;
        }
      } catch (err: any) {
        errors.push(`${tableName}: ${err.message}`);
      }
    }

    // Reset barcode_sequence
    const startValue = barcodeStartValue || 90001001;
    const { error: barcodeError } = await adminClient
      .from("barcode_sequence")
      .update({ next_barcode: startValue })
      .eq("organization_id", organizationId);

    if (barcodeError) {
      errors.push(`barcode_sequence reset: ${barcodeError.message}`);
    } else {
      deletedCounts["barcode_sequence"] = 1;
    }

    // Delete bill_number_sequence entries
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

    // Log the reset action to backup_logs
    await adminClient.from("backup_logs").insert({
      organization_id: organizationId,
      backup_type: "reset",
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      records_count: deletedCounts,
      error_message: errors.length > 0 ? errors.join("; ") : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deletedCounts,
        errors: errors.length > 0 ? errors : undefined,
        barcodeResetTo: startValue,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Reset organization error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
