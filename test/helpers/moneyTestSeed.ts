import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export type MoneyTestSeed = {
  orgId: string;
  customerId: string;
  supplierId: string;
  productId: string;
  variantId: string;
  slug: string;
  /** Initial stock_qty seeded on the variant. */
  initialStock: number;
};

const TEST_PREFIX = "money-test";

/**
 * Minimal disposable org + customer + supplier + product/variant for integration tests.
 * Uses service role — never point at production without a dedicated test project.
 */
export async function seedMoneyTestFixtures(
  client: SupabaseClient,
  existingOrgId?: string,
): Promise<MoneyTestSeed> {
  const slug = `${TEST_PREFIX}-${Date.now().toString(36)}`;
  let orgId = existingOrgId;

  if (!orgId) {
    const { data: org, error: orgErr } = await client
      .from("organizations")
      .insert({
        name: `Money Test Org ${slug}`,
        slug,
        organization_type: "retail",
        subscription_tier: "trial",
      })
      .select("id")
      .single();
    if (orgErr) throw orgErr;
    orgId = org.id;
  }

  const { data: customer, error: custErr } = await client
    .from("customers")
    .insert({
      organization_id: orgId,
      customer_name: "MONEY TEST CUSTOMER",
      phone: "9999900001",
    })
    .select("id")
    .single();
  if (custErr) throw custErr;

  const { data: supplier, error: supErr } = await client
    .from("suppliers")
    .insert({
      organization_id: orgId,
      supplier_name: "MONEY TEST SUPPLIER",
    })
    .select("id")
    .single();
  if (supErr) throw supErr;

  const { data: product, error: prodErr } = await client
    .from("products")
    .insert({
      organization_id: orgId,
      product_name: "MONEY TEST SHIRT",
      brand: "TEST",
      category: "TEST",
      gst_per: 5,
      uom: "NOS",
      default_pur_price: 100,
      default_sale_price: 200,
      status: "active",
    })
    .select("id")
    .single();
  if (prodErr) throw prodErr;

  const barcode = `MT${Date.now().toString().slice(-8)}`;
  const initialStock = 20;
  const { data: variant, error: varErr } = await client
    .from("product_variants")
    .insert({
      organization_id: orgId,
      product_id: product.id,
      size: "M",
      color: "WHITE",
      barcode,
      pur_price: 100,
      sale_price: 200,
      mrp: 250,
      stock_qty: initialStock,
      active: true,
    })
    .select("id")
    .single();
  if (varErr) throw varErr;

  return {
    orgId,
    customerId: customer.id,
    supplierId: supplier.id,
    productId: product.id,
    variantId: variant.id,
    slug,
    initialStock,
  };
}

export async function readVariantStock(
  client: SupabaseClient,
  variantId: string,
  orgId: string,
): Promise<number> {
  const { data, error } = await client
    .from("product_variants")
    .select("stock_qty")
    .eq("id", variantId)
    .eq("organization_id", orgId)
    .single();
  if (error) throw error;
  return Number(data.stock_qty || 0);
}

export async function cleanupMoneyTestFixtures(
  client: SupabaseClient,
  seed: MoneyTestSeed,
): Promise<void> {
  const { orgId } = seed;
  // Best-effort cleanup — order respects FK dependencies.
  await client.from("sale_items").delete().eq("organization_id", orgId);
  await client.from("sales").delete().eq("organization_id", orgId);
  await client.from("purchase_items").delete().eq("organization_id", orgId);
  await client.from("purchase_bills").delete().eq("organization_id", orgId);
  await client.from("voucher_entries").delete().eq("organization_id", orgId);
  await client.from("customer_advances").delete().eq("organization_id", orgId);
  await client.from("product_variants").delete().eq("organization_id", orgId);
  await client.from("products").delete().eq("organization_id", orgId);
  await client.from("customers").delete().eq("organization_id", orgId);
  await client.from("suppliers").delete().eq("organization_id", orgId);
  if (!process.env.SUPABASE_TEST_ORG_ID) {
    await client.from("organizations").delete().eq("id", orgId);
  }
}

export function minimalSaleRow(params: {
  orgId: string;
  customerId: string;
  saleNumber: string;
  netAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod?: string;
  cashAmount?: number;
}) {
  const today = new Date().toISOString().split("T")[0];
  return {
    id: randomUUID(),
    organization_id: params.orgId,
    customer_id: params.customerId,
    customer_name: "MONEY TEST CUSTOMER",
    sale_number: params.saleNumber,
    sale_type: "pos",
    sale_date: today,
    gross_amount: params.netAmount,
    net_amount: params.netAmount,
    discount_amount: 0,
    flat_discount_amount: 0,
    flat_discount_percent: 0,
    round_off: 0,
    tax_type: "inclusive",
    payment_method: params.paymentMethod ?? "cash",
    payment_status: params.paymentStatus,
    paid_amount: params.paidAmount,
    cash_amount: params.cashAmount ?? params.paidAmount,
    card_amount: 0,
    upi_amount: 0,
    journal_status: "pending",
    is_cancelled: false,
  };
}
