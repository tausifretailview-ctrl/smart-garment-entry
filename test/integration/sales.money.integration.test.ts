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
  minimalSaleRow,
  readVariantStock,
  seedMoneyTestFixtures,
  type MoneyTestSeed,
} from "../helpers/moneyTestSeed";
import { derivePaidAndStatus } from "@/utils/saleSettlement";

const describeIntegration = hasMoneyTestDb() ? describe : describe.skip;

describeIntegration("integration — POS / sales money paths", () => {
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

  it("ring a bill: stock decrements by line qty, payment fields consistent", async () => {
    const qty = 3;
    const unitPrice = 200;
    const net = qty * unitPrice;

    const { data: saleNumber, error: numErr } = await client.rpc("generate_pos_number_atomic", {
      p_organization_id: seed.orgId,
    });
    expect(numErr).toBeNull();
    expect(saleNumber).toBeTruthy();

    const saleId = randomUUID();
    const saleInsert = minimalSaleRow({
      orgId: seed.orgId,
      customerId: seed.customerId,
      saleNumber: saleNumber as string,
      netAmount: net,
      paidAmount: net,
      paymentStatus: "completed",
      cashAmount: net,
    });

    const { error: saleErr } = await client.from("sales").insert({ ...saleInsert, id: saleId });
    expect(saleErr).toBeNull();

    const { error: itemErr } = await client.from("sale_items").insert({
      id: randomUUID(),
      organization_id: seed.orgId,
      sale_id: saleId,
      product_id: seed.productId,
      variant_id: seed.variantId,
      product_name: "MONEY TEST SHIRT",
      size: "M",
      quantity: qty,
      unit_price: unitPrice,
      mrp: 250,
      line_total: net,
      barcode: "MT-TEST",
    });
    expect(itemErr).toBeNull();

    const stockAfterSale = await readVariantStock(client, seed.variantId, seed.orgId);
    expect(stockAfterSale).toBe(seed.initialStock - qty);

    const { data: saleRow, error: fetchErr } = await client
      .from("sales")
      .select("net_amount, paid_amount, payment_status, is_cancelled, deleted_at")
      .eq("id", saleId)
      .single();
    expect(fetchErr).toBeNull();
    expect(Number(saleRow?.net_amount)).toBe(net);
    expect(Number(saleRow?.paid_amount)).toBe(net);
    expect(saleRow?.payment_status).toBe("completed");

    const derived = derivePaidAndStatus({
      netAmount: net,
      saleReturnAdjust: 0,
      cashReceived: net,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(derived.paymentStatus).toBe("completed");
  });

  it("partial payment sale persists partial status and paid < net", async () => {
    const net = 1000;
    const paid = 400;

    const { data: saleNumber } = await client.rpc("generate_pos_number_atomic", {
      p_organization_id: seed.orgId,
    });
    const saleId = randomUUID();
    const { error } = await client.from("sales").insert({
      ...minimalSaleRow({
        orgId: seed.orgId,
        customerId: seed.customerId,
        saleNumber: saleNumber as string,
        netAmount: net,
        paidAmount: paid,
        paymentStatus: "partial",
        cashAmount: paid,
      }),
      id: saleId,
    });
    expect(error).toBeNull();

    await client.from("sale_items").insert({
      id: randomUUID(),
      organization_id: seed.orgId,
      sale_id: saleId,
      product_id: seed.productId,
      variant_id: seed.variantId,
      product_name: "MONEY TEST SHIRT",
      size: "M",
      quantity: 1,
      unit_price: net,
      mrp: 250,
      line_total: net,
    });

    const { data: row } = await client
      .from("sales")
      .select("paid_amount, payment_status, net_amount")
      .eq("id", saleId)
      .single();

    expect(row?.payment_status).toBe("partial");
    expect(Number(row?.paid_amount)).toBe(paid);
    expect(Number(row?.net_amount) - Number(row?.paid_amount)).toBe(600);
  });

  it("soft_delete_sale restores stock exactly once (no double credit)", async () => {
    const qty = 2;
    const net = 400;
    const stockBefore = await readVariantStock(client, seed.variantId, seed.orgId);

    const { data: saleNumber } = await client.rpc("generate_pos_number_atomic", {
      p_organization_id: seed.orgId,
    });
    const saleId = randomUUID();
    await client.from("sales").insert({
      ...minimalSaleRow({
        orgId: seed.orgId,
        customerId: seed.customerId,
        saleNumber: saleNumber as string,
        netAmount: net,
        paidAmount: net,
        paymentStatus: "completed",
      }),
      id: saleId,
    });
    await client.from("sale_items").insert({
      id: randomUUID(),
      organization_id: seed.orgId,
      sale_id: saleId,
      product_id: seed.productId,
      variant_id: seed.variantId,
      product_name: "MONEY TEST SHIRT",
      size: "M",
      quantity: qty,
      unit_price: 200,
      mrp: 250,
      line_total: net,
    });

    const stockAfterSale = await readVariantStock(client, seed.variantId, seed.orgId);
    expect(stockAfterSale).toBe(stockBefore - qty);

    const { error: delErr } = await client.rpc("soft_delete_sale", {
      p_sale_id: saleId,
      p_user_id: null,
    });
    expect(delErr).toBeNull();

    const stockAfterCancel = await readVariantStock(client, seed.variantId, seed.orgId);
    expect(stockAfterCancel).toBe(stockBefore);

    const { data: cancelled } = await client
      .from("sales")
      .select("deleted_at, is_cancelled, payment_status")
      .eq("id", saleId)
      .single();
    expect(cancelled?.deleted_at).not.toBeNull();
    expect(cancelled?.is_cancelled).toBe(true);
  });

  it("concurrent POS number generation yields distinct sale_numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        client.rpc("generate_pos_number_atomic", { p_organization_id: seed.orgId }),
      ),
    );
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(r.data).toBeTruthy();
    }
    const numbers = results.map((r) => String(r.data));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
