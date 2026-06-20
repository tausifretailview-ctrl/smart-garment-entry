import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { minimalSaleRow, readVariantStock, type MoneyTestSeed } from "./moneyTestSeed";

/** Fixed slugs — re-seed finds orgs by slug, purges money data, re-inserts scenarios. */
export const STAGING_ORG_A_SLUG = "money-staging-org-a";
export const STAGING_ORG_B_SLUG = "money-staging-org-b";

export type MoneyTestScenarioSeed = {
  orgA: MoneyTestSeed & {
    customerPlainId: string;
    customerUnusedAdvanceId: string;
    customerPartialPaidId: string;
    customerWithReturnId: string;
    saleFullyPaidId: string;
    salePartialId: string;
    saleCancelledId: string;
    saleWithReturnId: string;
    saleReturnId: string;
    purchaseBillId: string;
    advanceFullyUsedId: string;
    advancePartiallyUsedId: string;
    advanceUnusedId: string;
    variantBId: string;
    productBId: string;
  };
  orgB: {
    orgId: string;
    slug: string;
    customerId: string;
  };
};

const TODAY = () => new Date().toISOString().split("T")[0];

async function findOrgIdBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureOrg(
  client: SupabaseClient,
  slug: string,
  name: string,
): Promise<string> {
  const existing = await findOrgIdBySlug(client, slug);
  if (existing) return existing;

  const { data, error } = await client
    .from("organizations")
    .insert({
      name,
      slug,
      organization_type: "retail",
      subscription_tier: "trial",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Removes money-path rows for an org; keeps the org row. */
export async function purgeOrgMoneyData(
  client: SupabaseClient,
  orgId: string,
): Promise<void> {
  const { data: returns } = await client
    .from("sale_returns")
    .select("id")
    .eq("organization_id", orgId);
  const returnIds = (returns ?? []).map((r) => r.id);
  if (returnIds.length > 0) {
    await client.from("sale_return_items").delete().in("return_id", returnIds);
  }

  await client.from("sale_returns").delete().eq("organization_id", orgId);
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
}

async function insertCustomer(
  client: SupabaseClient,
  orgId: string,
  name: string,
  phone: string,
): Promise<string> {
  const { data, error } = await client
    .from("customers")
    .insert({
      organization_id: orgId,
      customer_name: name,
      phone,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertSupplier(client: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await client
    .from("suppliers")
    .insert({
      organization_id: orgId,
      supplier_name: "MONEY SEED SUPPLIER",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertProductVariant(
  client: SupabaseClient,
  orgId: string,
  label: string,
  barcode: string,
  stockQty: number,
): Promise<{ productId: string; variantId: string }> {
  const { data: product, error: prodErr } = await client
    .from("products")
    .insert({
      organization_id: orgId,
      product_name: `MONEY SEED ${label}`,
      brand: "SEED",
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
      stock_qty: stockQty,
      active: true,
    })
    .select("id")
    .single();
  if (varErr) throw varErr;

  return { productId: product.id, variantId: variant.id };
}

async function insertSaleWithItem(params: {
  client: SupabaseClient;
  orgId: string;
  customerId: string;
  customerName: string;
  saleId: string;
  saleNumber: string;
  productId: string;
  variantId: string;
  netAmount: number;
  paidAmount: number;
  paymentStatus: string;
  qty?: number;
  saleReturnAdjust?: number;
  paymentMethod?: string;
  cancelled?: boolean;
}): Promise<void> {
  const qty = params.qty ?? 1;
  const unitPrice = params.netAmount / qty;
  const today = TODAY();

  const { error: saleErr } = await client.from("sales").insert({
    ...minimalSaleRow({
      orgId: params.orgId,
      customerId: params.customerId,
      saleNumber: params.saleNumber,
      netAmount: params.netAmount,
      paidAmount: params.paidAmount,
      paymentStatus: params.paymentStatus,
      paymentMethod: params.paymentMethod,
      cashAmount: params.paidAmount,
    }),
    id: params.saleId,
    customer_name: params.customerName,
    sale_return_adjust: params.saleReturnAdjust ?? 0,
    is_cancelled: params.cancelled ?? false,
    deleted_at: params.cancelled ? new Date().toISOString() : null,
    cancelled_at: params.cancelled ? new Date().toISOString() : null,
    sale_date: today,
  });
  if (saleErr) throw saleErr;

  if (!params.cancelled) {
    const { error: itemErr } = await client.from("sale_items").insert({
      id: randomUUID(),
      organization_id: params.orgId,
      sale_id: params.saleId,
      product_id: params.productId,
      variant_id: params.variantId,
      product_name: "MONEY SEED SHIRT A",
      size: "M",
      quantity: qty,
      unit_price: unitPrice,
      mrp: 250,
      line_total: params.netAmount,
      barcode: `SEED-${params.saleNumber}`,
    });
    if (itemErr) throw itemErr;
  }
}

/**
 * Hand-crafted realistic money scenarios for staging / atomic-refactor prep.
 * Idempotent: re-run purges org money data and re-inserts the same scenario set.
 */
export async function seedMoneyTestScenarios(
  client: SupabaseClient,
): Promise<MoneyTestScenarioSeed> {
  const orgAId = await ensureOrg(
    client,
    STAGING_ORG_A_SLUG,
    "Money Staging Org A",
  );
  const orgBId = await ensureOrg(
    client,
    STAGING_ORG_B_SLUG,
    "Money Staging Org B",
  );

  await purgeOrgMoneyData(client, orgAId);
  await purgeOrgMoneyData(client, orgBId);

  const customerPlainId = await insertCustomer(
    client,
    orgAId,
    "MONEY SEED PLAIN",
    "9999900101",
  );
  const customerUnusedAdvanceId = await insertCustomer(
    client,
    orgAId,
    "MONEY SEED UNUSED ADVANCE",
    "9999900102",
  );
  const customerPartialPaidId = await insertCustomer(
    client,
    orgAId,
    "MONEY SEED PARTIAL PAID",
    "9999900103",
  );
  const customerWithReturnId = await insertCustomer(
    client,
    orgAId,
    "MONEY SEED SALE RETURN",
    "9999900104",
  );

  const supplierId = await insertSupplier(client, orgAId);
  const { productId, variantId } = await insertProductVariant(
    client,
    orgAId,
    "SHIRT A",
    "SEED-BARCODE-A",
    100,
  );
  const { productId: productBId, variantId: variantBId } = await insertProductVariant(
    client,
    orgAId,
    "SHIRT B",
    "SEED-BARCODE-B",
    50,
  );

  const saleFullyPaidId = randomUUID();
  const salePartialId = randomUUID();
  const saleCancelledId = randomUUID();
  const saleWithReturnId = randomUUID();
  const saleReturnId = randomUUID();
  const purchaseBillId = randomUUID();
  const advanceFullyUsedId = randomUUID();
  const advancePartiallyUsedId = randomUUID();
  const advanceUnusedId = randomUUID();

  await insertSaleWithItem({
    client,
    orgId: orgAId,
    customerId: customerPlainId,
    customerName: "MONEY SEED PLAIN",
    saleId: saleFullyPaidId,
    saleNumber: "MONEY-SEED/PAID/001",
    productId,
    variantId,
    netAmount: 600,
    paidAmount: 600,
    paymentStatus: "completed",
    qty: 2,
  });

  await insertSaleWithItem({
    client,
    orgId: orgAId,
    customerId: customerPartialPaidId,
    customerName: "MONEY SEED PARTIAL PAID",
    saleId: salePartialId,
    saleNumber: "MONEY-SEED/PARTIAL/001",
    productId,
    variantId,
    netAmount: 1000,
    paidAmount: 400,
    paymentStatus: "partial",
    qty: 1,
  });

  await insertSaleWithItem({
    client,
    orgId: orgAId,
    customerId: customerPlainId,
    customerName: "MONEY SEED PLAIN",
    saleId: saleCancelledId,
    saleNumber: "MONEY-SEED/CANCEL/001",
    productId,
    variantId,
    netAmount: 200,
    paidAmount: 200,
    paymentStatus: "completed",
    cancelled: true,
  });

  const returnAdjust = 300;
  await insertSaleWithItem({
    client,
    orgId: orgAId,
    customerId: customerWithReturnId,
    customerName: "MONEY SEED SALE RETURN",
    saleId: saleWithReturnId,
    saleNumber: "MONEY-SEED/RETURN/001",
    productId,
    variantId,
    netAmount: 800,
    paidAmount: 500,
    paymentStatus: "partial",
    saleReturnAdjust: returnAdjust,
    qty: 2,
  });

  const today = TODAY();
  const { error: srErr } = await client.from("sale_returns").insert({
    id: saleReturnId,
    organization_id: orgAId,
    customer_id: customerWithReturnId,
    customer_name: "MONEY SEED SALE RETURN",
    refund_type: "credit_note",
    return_date: today,
    return_number: "MONEY-SEED/SR/001",
    original_sale_number: "MONEY-SEED/RETURN/001",
    linked_sale_id: saleWithReturnId,
    credit_status: "adjusted",
    gross_amount: returnAdjust,
    gst_amount: 0,
    net_amount: returnAdjust,
    journal_status: "pending",
    notes: "Staging seed — return applied to invoice",
  });
  if (srErr) throw srErr;

  await client.from("sale_return_items").insert({
    id: randomUUID(),
    return_id: saleReturnId,
    product_id: productId,
    variant_id: variantId,
    product_name: "MONEY SEED SHIRT A",
    size: "M",
    quantity: 1,
    unit_price: returnAdjust,
    line_total: returnAdjust,
    gst_percent: 5,
  });

  const billLineA = { qty: 3, purPrice: 80, salePrice: 150, mrp: 199 };
  const billLineB = { qty: 2, purPrice: 90, salePrice: 180, mrp: 229 };
  const billTotal =
    billLineA.qty * billLineA.purPrice + billLineB.qty * billLineB.purPrice;

  const { error: billErr } = await client.from("purchase_bills").insert({
    id: purchaseBillId,
    organization_id: orgAId,
    supplier_id: supplierId,
    supplier_name: "MONEY SEED SUPPLIER",
    supplier_invoice_no: "MONEY-SEED-PUR-001",
    software_bill_no: "MONEY-SEED/PUR/001",
    bill_date: today,
    gross_amount: billTotal,
    net_amount: billTotal,
    total_qty: billLineA.qty + billLineB.qty,
    payment_status: "pending",
  });
  if (billErr) throw billErr;

  const purchaseItems = [
    {
      id: randomUUID(),
      organization_id: orgAId,
      bill_id: purchaseBillId,
      product_id: productId,
      sku_id: variantId,
      product_name: "MONEY SEED SHIRT A",
      size: "M",
      qty: billLineA.qty,
      pur_price: billLineA.purPrice,
      sale_price: billLineA.salePrice,
      mrp: billLineA.mrp,
      gst_per: 5,
      line_total: billLineA.qty * billLineA.purPrice,
      barcode: "SEED-PUR-A",
    },
    {
      id: randomUUID(),
      organization_id: orgAId,
      bill_id: purchaseBillId,
      product_id: productBId,
      sku_id: variantBId,
      product_name: "MONEY SEED SHIRT B",
      size: "M",
      qty: billLineB.qty,
      pur_price: billLineB.purPrice,
      sale_price: billLineB.salePrice,
      mrp: billLineB.mrp,
      gst_per: 5,
      line_total: billLineB.qty * billLineB.purPrice,
      barcode: "SEED-PUR-B",
    },
  ];
  const { error: purItemsErr } = await client.from("purchase_items").insert(purchaseItems);
  if (purItemsErr) throw purItemsErr;

  const advances = [
    {
      id: advanceFullyUsedId,
      customer_id: customerPlainId,
      advance_number: "MONEY-SEED/ADV/FULL",
      amount: 5000,
      used_amount: 5000,
      status: "fully_used",
    },
    {
      id: advancePartiallyUsedId,
      customer_id: customerPartialPaidId,
      advance_number: "MONEY-SEED/ADV/PARTIAL",
      amount: 8000,
      used_amount: 3000,
      status: "partially_used",
    },
    {
      id: advanceUnusedId,
      customer_id: customerUnusedAdvanceId,
      advance_number: "MONEY-SEED/ADV/UNUSED",
      amount: 6000,
      used_amount: 0,
      status: "active",
    },
  ];
  for (const adv of advances) {
    const { error } = await client.from("customer_advances").insert({
      ...adv,
      organization_id: orgAId,
      advance_date: today,
      payment_method: "cash",
    });
    if (error) throw error;
  }

  const orgBCustomerId = await insertCustomer(
    client,
    orgBId,
    "MONEY SEED ORG B ONLY",
    "9999900201",
  );

  const stockAfterSeed = await readVariantStock(client, variantId, orgAId);

  return {
    orgA: {
      orgId: orgAId,
      customerId: customerPlainId,
      supplierId,
      productId,
      variantId,
      slug: STAGING_ORG_A_SLUG,
      initialStock: stockAfterSeed,
      customerPlainId,
      customerUnusedAdvanceId,
      customerPartialPaidId,
      customerWithReturnId,
      saleFullyPaidId,
      salePartialId,
      saleCancelledId,
      saleWithReturnId,
      saleReturnId,
      purchaseBillId,
      advanceFullyUsedId,
      advancePartiallyUsedId,
      advanceUnusedId,
      variantBId,
      productBId,
    },
    orgB: {
      orgId: orgBId,
      slug: STAGING_ORG_B_SLUG,
      customerId: orgBCustomerId,
    },
  };
}

/** Asserts org B cannot see org A customers (cross-tenant isolation smoke check). */
export async function verifyOrgIsolation(
  client: SupabaseClient,
  seed: MoneyTestScenarioSeed,
): Promise<void> {
  const { data, error } = await client
    .from("customers")
    .select("id")
    .eq("organization_id", seed.orgB.orgId)
    .in("id", [
      seed.orgA.customerPlainId,
      seed.orgA.customerUnusedAdvanceId,
      seed.orgA.customerPartialPaidId,
    ]);
  if (error) throw error;
  if ((data ?? []).length > 0) {
    throw new Error("Cross-tenant leakage: org B query returned org A customer ids");
  }
}
