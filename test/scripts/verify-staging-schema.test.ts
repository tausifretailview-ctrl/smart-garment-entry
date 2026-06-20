import { describe, expect, it } from "vitest";
import {
  createMoneyTestClient,
  hasMoneyTestDb,
} from "../helpers/supabaseTestClient";

const MONEY_TABLES = [
  "sales",
  "sale_items",
  "purchase_bills",
  "purchase_items",
  "product_variants",
  "customers",
  "voucher_entries",
  "customer_advances",
  "sale_returns",
] as const;

const describeVerify = hasMoneyTestDb() ? describe : describe.skip;

describeVerify("staging schema — money tables", () => {
  it("key money tables exist and are queryable", async () => {
    const client = createMoneyTestClient();
    const missing: string[] = [];

    for (const table of MONEY_TABLES) {
      const { error } = await client.from(table).select("*", { count: "exact", head: true });
      if (error) missing.push(`${table}: ${error.message}`);
    }

    expect(missing, missing.join("\n")).toEqual([]);
  }, 60_000);
});
