import { describe, expect, it } from "vitest";
import {
  createMoneyTestClient,
  hasMoneyTestDb,
  readMoneyTestEnv,
} from "../helpers/supabaseTestClient";
import { runFixMissingMrpEquivalenceCheck } from "@/utils/fixMissingMrpEquivalence";

const describeIntegration = hasMoneyTestDb() ? describe : describe.skip;

describeIntegration("fix_missing_mrp Phase 2 equivalence (staging)", () => {
  it("preview RPC exists and loop vs RPC agree for test org", async () => {
    const env = readMoneyTestEnv();
    const orgId = env?.orgId;
    if (!orgId) {
      throw new Error("Set SUPABASE_TEST_ORG_ID in .env.test for this integration check.");
    }

    const client = createMoneyTestClient();

    const { error: previewError } = await client.rpc("preview_fix_missing_mrp_for_org", {
      p_org_id: orgId,
    });
    expect(previewError?.message ?? "").not.toMatch(/function .* does not exist/i);

    const report = await runFixMissingMrpEquivalenceCheck(client, orgId);

    // Log for manual Phase 2 sign-off on staging.
    console.info("[MRP Phase 2 equivalence]", {
      orgId,
      passed: report.passed,
      summary: report.summary,
      loopRowCount: report.loopRowCount,
      rpcRowCount: report.rpcRowCount,
      crossOrgRowCount: report.crossOrgRowCount,
      valueMismatches: report.valueMismatches,
      rpcOnlyCount: report.rpcOnlyRows.length,
      unexplainedLoopOnly: report.loopOnlyRows.filter(
        (row) => !report.crossOrgRows.some((c) => c.purchaseItemId === row.purchaseItemId),
      ).length,
    });

    expect(report.valueMismatches).toEqual([]);
    expect(report.rpcOnlyRows).toEqual([]);
    expect(
      report.loopOnlyRows.every((row) =>
        report.crossOrgRows.some((c) => c.purchaseItemId === row.purchaseItemId),
      ) || report.loopOnlyRows.length === 0,
    ).toBe(true);
  }, 120_000);
});
