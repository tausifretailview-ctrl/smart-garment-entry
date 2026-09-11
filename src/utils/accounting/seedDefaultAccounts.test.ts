import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSeedDefaultAccountsCache,
  seedDefaultAccounts,
  type SeededAccount,
} from "./seedDefaultAccounts";

type Row = SeededAccount;

function makeRow(partial: Partial<Row> & Pick<Row, "account_code" | "account_name">): Row {
  return {
    id: partial.id || `id-${partial.account_code}`,
    organization_id: partial.organization_id || "org-adtech",
    account_type: partial.account_type || "Expense",
    account_group: partial.account_group ?? "Indirect Expenses",
    parent_account_id: null,
    is_system_account: partial.is_system_account ?? false,
    ...partial,
  };
}

/**
 * Minimal thenable query builder that records inserts/updates and serves
 * chart_of_accounts rows for seedDefaultAccounts.
 */
function makeClient(initial: Row[]) {
  const rows = [...initial];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ patch: Record<string, unknown>; id?: string }> = [];

  const api = {
    inserts,
    updates,
    rows,
    from(_table: string) {
      let filters: Record<string, unknown> = {};
      let inCodes: string[] | null = null;
      let mode: "select" | "insert" | "update" = "select";
      let patch: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;

      const builder: any = {
        select() {
          mode = "select";
          return builder;
        },
        insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          mode = "insert";
          insertPayload = payload;
          return builder;
        },
        update(p: Record<string, unknown>) {
          mode = "update";
          patch = p;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        in(col: string, vals: string[]) {
          if (col === "account_code") inCodes = vals;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(execute()).then((res) => {
            const data = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
            return { data, error: res.error };
          });
        },
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };

      function execute(): { data: Row[] | null; error: { code?: string; message: string } | null } {
        if (mode === "insert") {
          const list = Array.isArray(insertPayload) ? insertPayload : [insertPayload!];
          for (const item of list) {
            const code = String(item.account_code);
            const name = String(item.account_name);
            if (rows.some((r) => r.account_code === code)) {
              return { data: null, error: { code: "23505", message: "duplicate key account_code" } };
            }
            if (rows.some((r) => r.account_name === name)) {
              return { data: null, error: { code: "23505", message: "duplicate key account_name" } };
            }
            inserts.push(item);
            rows.push(
              makeRow({
                account_code: code,
                account_name: name,
                account_type: item.account_type as Row["account_type"],
                account_group: item.account_group as Row["account_group"],
                is_system_account: Boolean(item.is_system_account),
                organization_id: String(item.organization_id),
              }),
            );
          }
          return { data: null, error: null };
        }

        if (mode === "update") {
          updates.push({ patch: patch!, id: filters.id as string | undefined });
          for (const row of rows) {
            if (filters.id && row.id !== filters.id) continue;
            if (filters.organization_id && row.organization_id !== filters.organization_id) continue;
            Object.assign(row, patch);
          }
          return { data: null, error: null };
        }

        let result = rows.slice();
        if (filters.organization_id) {
          result = result.filter((r) => r.organization_id === filters.organization_id);
        }
        if (filters.is_system_account !== undefined) {
          result = result.filter((r) => r.is_system_account === filters.is_system_account);
        }
        if (filters.account_code) {
          result = result.filter((r) => r.account_code === filters.account_code);
        }
        if (inCodes) {
          result = result.filter((r) => inCodes!.includes(r.account_code));
        }
        return { data: result, error: null };
      }

      return builder;
    },
  };

  return api;
}

describe("seedDefaultAccounts", () => {
  beforeEach(() => {
    clearSeedDefaultAccountsCache();
  });

  it("promotes non-system 6050/1200 instead of failing unique insert (adtech-style)", async () => {
    const client = makeClient([
      makeRow({
        account_code: "1200",
        account_name: "Accounts Receivable",
        account_type: "Asset",
        account_group: "Sundry Debtors",
        is_system_account: false,
      }),
      makeRow({
        account_code: "6050",
        account_name: "Settlement Discounts Given",
        account_type: "Expense",
        account_group: "Indirect Expenses",
        is_system_account: false,
      }),
      // Enough other required codes as system so we only exercise promote for 1200/6050
      ...[
        "1000", "1010", "1300", "1400", "1410", "1420", "2000", "2150",
        "2200", "2210", "2220", "4000", "4010", "4050", "4100", "4060",
        "4070", "5000", "5050", "6000", "6070", "6100", "6900",
      ].map((code) =>
        makeRow({
          account_code: code,
          account_name: `Acct ${code}`,
          is_system_account: true,
          account_type: "Asset",
          account_group: "Current Assets",
        }),
      ),
    ]);

    const accounts = await seedDefaultAccounts("org-adtech", client);

    expect(client.updates.some((u) => u.patch.is_system_account === true)).toBe(true);
    expect(accounts.find((a) => a.account_code === "1200")?.is_system_account).toBe(true);
    expect(accounts.find((a) => a.account_code === "6050")?.is_system_account).toBe(true);
    // Should not attempt duplicate insert for codes that already existed
    expect(client.inserts.some((i) => i.account_code === "6050")).toBe(false);
    expect(client.inserts.some((i) => i.account_code === "1200")).toBe(false);
  });

  it("inserts missing 6050 when the code is absent", async () => {
    const client = makeClient(
      [
        "1000", "1010", "1200", "1300", "1400", "1410", "1420", "2000", "2150",
        "2200", "2210", "2220", "4000", "4010", "4050", "4100", "4060",
        "4070", "5000", "5050", "6000", "6070", "6100", "6900",
      ].map((code) =>
        makeRow({
          account_code: code,
          account_name: `Acct ${code}`,
          is_system_account: true,
          account_type: "Asset",
          account_group: "Current Assets",
        }),
      ),
    );

    const accounts = await seedDefaultAccounts("org-adtech", client);
    expect(client.inserts.some((i) => i.account_code === "6050")).toBe(true);
    expect(accounts.some((a) => a.account_code === "6050" && a.is_system_account)).toBe(true);
  });

  it("retries with code-suffixed name when canonical account_name is taken", async () => {
    const client = makeClient([
      makeRow({
        account_code: "9999",
        account_name: "Settlement Discounts Given",
        is_system_account: false,
        account_type: "Expense",
        account_group: "Indirect Expenses",
      }),
      ...[
        "1000", "1010", "1200", "1300", "1400", "1410", "1420", "2000", "2150",
        "2200", "2210", "2220", "4000", "4010", "4050", "4100", "4060",
        "4070", "5000", "5050", "6000", "6070", "6100", "6900",
      ].map((code) =>
        makeRow({
          account_code: code,
          account_name: `Acct ${code}`,
          is_system_account: true,
          account_type: "Asset",
          account_group: "Current Assets",
        }),
      ),
    ]);

    const accounts = await seedDefaultAccounts("org-adtech", client);
    const inserted6050 = client.inserts.find((i) => i.account_code === "6050");
    expect(inserted6050?.account_name).toBe("Settlement Discounts Given (6050)");
    expect(accounts.some((a) => a.account_code === "6050")).toBe(true);
  });
});
