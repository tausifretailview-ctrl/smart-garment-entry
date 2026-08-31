import { describe, expect, it } from "vitest";
import {
  runFixtureDualRun,
  diffLedgerRows,
} from "../helpers/customerLedgerExtractDualRun";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerLedgerTransactionsDesktopInline } from "../../scripts/lib/customerLedgerRetailInline.generated";
import {
  createMoneyTestClient,
  hasMoneyTestDb,
  readMoneyTestEnv,
} from "../helpers/supabaseTestClient";

const PRODUCTION_HOST = "lkbbrqcsbhqjvsxiorvp.supabase.co";

function isProductionUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === PRODUCTION_HOST;
  } catch {
    return url.includes(PRODUCTION_HOST);
  }
}

describe("customer ledger extract — fixture dual-run", () => {
  it("matches desktop inline element-by-element across ledger patterns (incl. running balance)", async () => {
    const { caseCount, failures } = await runFixtureDualRun();
    expect(caseCount).toBeGreaterThanOrEqual(15);
    if (failures.length) {
      const detail = failures
        .map((f) => `  ${f.id} (${f.label})\n    ${f.diffs.join("\n    ")}`)
        .join("\n");
      expect.fail(`extraction diverged from desktop inline:\n${detail}`);
    }
  });
});

const describeLive = hasMoneyTestDb() ? describe : describe.skip;

describeLive("customer ledger extract — live staging dual-run", () => {
  it("refuses production and matches desktop inline on real staging customers", async () => {
    const env = readMoneyTestEnv();
    if (!env) return;
    if (isProductionUrl(env.url)) {
      throw new Error("Refusing to dual-run against production Supabase.");
    }
    const viteUrl = process.env.VITE_SUPABASE_URL || "";
    if (viteUrl && env.url.replace(/\/$/, "") === viteUrl.replace(/\/$/, "")) {
      throw new Error("SUPABASE_TEST_URL matches VITE_SUPABASE_URL — refusing production.");
    }

    const client = createMoneyTestClient();
    const { data: orgs, error: orgErr } = await client
      .from("organizations")
      .select("id")
      .eq("organization_type", "retail")
      .limit(5);
    if (orgErr) throw orgErr;
    const orgIds = (orgs || []).map((o) => o.id as string);
    if (orgIds.length === 0) {
      throw new Error("No retail organizations in staging — seed money scenarios first.");
    }

    const customers: { id: string; organization_id: string; opening_balance: number | null }[] = [];
    for (const orgId of orgIds) {
      const { data, error } = await client
        .from("customers")
        .select("id, organization_id, opening_balance")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .limit(20);
      if (error) throw error;
      customers.push(
        ...(data || []).map((c) => ({
          id: c.id as string,
          organization_id: c.organization_id as string,
          opening_balance: (c.opening_balance as number | null) ?? 0,
        })),
      );
    }

    const picked = customers.slice(0, 20);
    expect(picked.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const c of picked) {
      const opening = Math.round(Number(c.opening_balance || 0));
      const extracted = await fetchCustomerLedgerTransactionsWithClient(
        client,
        c.organization_id,
        c.id,
        undefined,
        opening,
      );
      const desktop = await fetchCustomerLedgerTransactionsDesktopInline(
        client,
        c.organization_id,
        { id: c.id, opening_balance: opening },
      );
      const diffs = diffLedgerRows(extracted, desktop);
      if (diffs.length) {
        mismatches.push(`${c.id}: ${diffs.join("; ")}`);
      }
    }
    if (mismatches.length) {
      expect.fail(`live staging dual-run failed:\n${mismatches.join("\n")}`);
    }
  }, 180_000);
});
