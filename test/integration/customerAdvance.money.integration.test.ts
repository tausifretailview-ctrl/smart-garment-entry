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
  seedMoneyTestFixtures,
  type MoneyTestSeed,
} from "../helpers/moneyTestSeed";
import { consumeAdvanceFIFO } from "@/utils/saleSettlement";
import { computeCustomerOutstanding } from "@/utils/customerBalanceUtils";

const describeIntegration = hasMoneyTestDb() ? describe : describe.skip;

describeIntegration("integration — customer advance application", () => {
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

  it("apply advance FIFO: used_amount increases once, outstanding drops by consumed amount", async () => {
    const advanceAmount = 10000;
    const consumeRequest = 4000;
    const invoiceNet = 8000;

    const { data: advance, error: advErr } = await client
      .from("customer_advances")
      .insert({
        organization_id: seed.orgId,
        customer_id: seed.customerId,
        amount: advanceAmount,
        used_amount: 0,
        status: "active",
        advance_date: new Date().toISOString().split("T")[0],
        advance_number: `ADV-TEST-${Date.now()}`,
      })
      .select("id, amount, used_amount")
      .single();
    expect(advErr).toBeNull();

    const { data: saleNumber } = await client.rpc("generate_sale_number_atomic", {
      p_organization_id: seed.orgId,
    });
    const saleId = randomUUID();
    await client.from("sales").insert({
      ...minimalSaleRow({
        orgId: seed.orgId,
        customerId: seed.customerId,
        saleNumber: saleNumber as string,
        netAmount: invoiceNet,
        paidAmount: 0,
        paymentStatus: "pending",
        paymentMethod: "pay_later",
        cashAmount: 0,
      }),
      id: saleId,
    });

    const { consumed, vouchers } = await consumeAdvanceFIFO(client, {
      customerId: seed.customerId,
      organizationId: seed.orgId,
      saleId,
      requestedAmount: consumeRequest,
    });

    expect(consumed).toBeCloseTo(consumeRequest, 2);
    expect(vouchers.length).toBeGreaterThan(0);

    const { data: advAfter } = await client
      .from("customer_advances")
      .select("used_amount, status")
      .eq("id", advance!.id)
      .single();
    expect(Number(advAfter?.used_amount)).toBeCloseTo(consumeRequest, 2);
    expect(advAfter?.status).toBe("partially_used");

    const { data: receiptRows } = await client
      .from("voucher_entries")
      .select("total_amount, payment_method, reference_id")
      .eq("organization_id", seed.orgId)
      .eq("reference_id", saleId)
      .eq("payment_method", "advance_adjustment");

    const advVoucherTotal = (receiptRows || []).reduce(
      (s, r) => s + Number(r.total_amount || 0),
      0,
    );
    expect(advVoucherTotal).toBeCloseTo(consumeRequest, 2);

    const outstanding = computeCustomerOutstanding({
      openingBalance: 0,
      customerId: seed.customerId,
      sales: [{ id: saleId, net_amount: invoiceNet, paid_amount: 0, sale_return_adjust: 0 }],
      vouchers: (receiptRows || []).map((r) => ({
        reference_id: saleId,
        reference_type: "sale",
        total_amount: r.total_amount,
        payment_method: r.payment_method,
      })),
      adjustmentTotal: 0,
      advances: [{ id: advance!.id, amount: advanceAmount, used_amount: consumeRequest }],
      advanceRefundTotal: 0,
      saleReturns: [],
      refundsPaidTotal: 0,
    });

    expect(outstanding.balance).toBeCloseTo(invoiceNet - consumeRequest, 0);
    expect(outstanding.unusedAdvanceTotal).toBeCloseTo(advanceAmount - consumeRequest, 0);
  });
});
