import { describe, expect, it } from "vitest";
import {
  createMoneyTestClient,
  hasMoneyTestDb,
} from "../helpers/supabaseTestClient";
import {
  seedMoneyTestScenarios,
  verifyOrgIsolation,
  STAGING_ORG_A_SLUG,
  STAGING_ORG_B_SLUG,
} from "../helpers/moneyTestSeedScenarios";

const describeSeed = hasMoneyTestDb() ? describe : describe.skip;

describeSeed("staging seed — money scenarios", () => {
  it("seeds idempotently and verifies org isolation", async () => {
    const client = createMoneyTestClient();

    const first = await seedMoneyTestScenarios(client);
    await verifyOrgIsolation(client, first);

    expect(first.orgA.slug).toBe(STAGING_ORG_A_SLUG);
    expect(first.orgB.slug).toBe(STAGING_ORG_B_SLUG);

    const { data: unusedAdv } = await client
      .from("customer_advances")
      .select("amount, used_amount, status")
      .eq("id", first.orgA.advanceUnusedId)
      .single();
    expect(Number(unusedAdv?.amount)).toBe(6000);
    expect(Number(unusedAdv?.used_amount)).toBe(0);
    expect(unusedAdv?.status).toBe("active");

    const { data: partialAdv } = await client
      .from("customer_advances")
      .select("amount, used_amount, status")
      .eq("id", first.orgA.advancePartiallyUsedId)
      .single();
    expect(Number(partialAdv?.used_amount)).toBe(3000);
    expect(partialAdv?.status).toBe("partially_used");

    const { data: fullAdv } = await client
      .from("customer_advances")
      .select("amount, used_amount, status")
      .eq("id", first.orgA.advanceFullyUsedId)
      .single();
    expect(Number(fullAdv?.used_amount)).toBe(Number(fullAdv?.amount));
    expect(fullAdv?.status).toBe("fully_used");

    const { data: purchaseItems } = await client
      .from("purchase_items")
      .select("mrp, qty")
      .eq("bill_id", first.orgA.purchaseBillId);
    expect(purchaseItems?.length).toBe(2);
    expect(purchaseItems?.every((r) => Number(r.mrp) > 0)).toBe(true);

    const second = await seedMoneyTestScenarios(client);
    expect(second.orgA.orgId).toBe(first.orgA.orgId);
    expect(second.orgB.orgId).toBe(first.orgB.orgId);
    await verifyOrgIsolation(client, second);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          orgA: second.orgA.orgId,
          orgB: second.orgB.orgId,
          slugs: [STAGING_ORG_A_SLUG, STAGING_ORG_B_SLUG],
        },
        null,
        2,
      ),
    );
  }, 180_000);
});
