import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import {
  createMoneyTestClient,
  hasMoneyTestDb,
  readMoneyTestEnv,
} from "../helpers/supabaseTestClient";
import {
  cleanupMoneyTestFixtures,
  readVariantStock,
  seedMoneyTestFixtures,
  type MoneyTestSeed,
} from "../helpers/moneyTestSeed";

const describeIntegration = hasMoneyTestDb() ? describe : describe.skip;

describeIntegration("integration — purchase bill stock", () => {
  let client: SupabaseClient;
  let seed: MoneyTestSeed;

  beforeAll(async () => {
    client = createMoneyTestClient();
    const env = readMoneyTestEnv();
    seed = await seedMoneyTestFixtures(client, env?.orgId);
  }, 120_000);

  afterAll(async () => {
    if (seed) await cleanupMoneyTestFixtures(client, seed);
  }, 120_000);

  it("save purchase line: stock increments by qty, line total correct", async () => {
    const qty = 5;
    const purPrice = 80.2;
    const salePrice = 150;
    const mrp = 199;
    const lineTotal = qty * purPrice;
    const stockBefore = await readVariantStock(client, seed.variantId, seed.orgId);

    const billId = randomUUID();
    const today = new Date().toISOString().split("T")[0];
    const { error: billErr } = await client.from("purchase_bills").insert({
      id: billId,
      organization_id: seed.orgId,
      supplier_id: seed.supplierId,
      supplier_name: "MONEY TEST SUPPLIER",
      supplier_invoice_no: `TEST-${Date.now()}`,
      software_bill_no: `PUR/TEST/${Date.now()}`,
      bill_date: today,
      gross_amount: lineTotal,
      net_amount: lineTotal,
      total_qty: qty,
      payment_status: "pending",
    });
    expect(billErr).toBeNull();

    const { error: itemErr } = await client.from("purchase_items").insert({
      id: randomUUID(),
      organization_id: seed.orgId,
      bill_id: billId,
      product_id: seed.productId,
      sku_id: seed.variantId,
      product_name: "MONEY TEST SHIRT",
      size: "M",
      qty,
      pur_price: purPrice,
      sale_price: salePrice,
      mrp,
      gst_per: 5,
      line_total: lineTotal,
      barcode: "MT-PUR-TEST",
    });
    expect(itemErr).toBeNull();

    const stockAfter = await readVariantStock(client, seed.variantId, seed.orgId);
    expect(stockAfter).toBe(stockBefore + qty);

    const { data: itemRow } = await client
      .from("purchase_items")
      .select("pur_price, sale_price, mrp, line_total, qty")
      .eq("bill_id", billId)
      .single();

    expect(Number(itemRow?.pur_price)).toBeCloseTo(purPrice, 2);
    expect(Number(itemRow?.sale_price)).toBe(salePrice);
    expect(Number(itemRow?.mrp)).toBe(mrp);
    expect(Number(itemRow?.line_total)).toBeCloseTo(lineTotal, 2);
    expect(Number(itemRow?.qty)).toBe(qty);
  });
});
