import { beforeEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => [] as { operation: string; additionalContext?: unknown }[]);
vi.mock("@/lib/errorLogger", () => ({ logError: async (ctx: { operation: string }) => void logged.push(ctx) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { bestEffortWrite, rollbackStep } from "@/lib/rollbackStep";
import { reverseCustomerAdvanceFifo } from "@/utils/reverseCustomerAdvanceFifo";

/** Plan Phase 4, R6: clean-up steps never hide a failure; advance writes never fail silently. */
describe("rollbackStep", () => {
  beforeEach(() => void (logged.length = 0));

  it("a Supabase { error } result or a thrown error is logged, never thrown, and the caller can go on", async () => {
    expect(await rollbackStep("x:delete", async () => ({ error: { message: "denied" } }), { recordId: "r1" })).toBe(false);
    expect(await rollbackStep("x:throw", async () => { throw new Error("boom"); })).toBe(false);
    expect(await rollbackStep("x:ok", async () => ({ error: null }))).toBe(true);
    expect(logged.map((l) => l.operation)).toEqual(["rollback:x:delete", "rollback:x:throw"]);
    expect(logged[0].additionalContext).toEqual({ record_id: "r1" });
  });

  it("bestEffortWrite logs under best-effort:<label> and never throws", async () => {
    expect(await bestEffortWrite("sale-return:heal", async () => ({ error: { message: "x" } }))).toBe(false);
    expect(logged.at(-1)?.operation).toBe("best-effort:sale-return:heal");
  });
});

describe("sale return credit", () => {
  it("POS credit consumption checks every write (no double-spent credit)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/hooks/useSaveSale.tsx", "utf8");
    const fn = src.slice(src.indexOf("const markCreditNoteFullyUsedForSrAdjust"), src.indexOf("type SavePaymentMethod"));
    for (const v of ["usedErr", "amountErr", "consumeErr", "partialErr", "leftoverErr"]) {
      expect(fn, v).toContain(`if (${v}) throw ${v};`);
    }
    expect(fn).not.toMatch(/^\s*await supabase\s*\n?\s*\.from\(['"](credit_notes|sale_returns)['"]\)\s*\.update/m);
  });

  it("a failed credit-note read no longer marks the return fully adjusted", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/utils/saleSettlement.ts", "utf8");
    expect(src).toContain("if (cnReadErr || !cnRow)");
    expect(src).toContain('"cn-apply:sync-sale-return"');
  });
});

function fakeClient(opts: { rows?: unknown[]; readError?: unknown; updateError?: unknown | ((n: number) => unknown) }) {
  let updates = 0;
  return {
    from: () => ({
      select: () => {
        const q: Record<string, unknown> = {};
        for (const op of ["eq", "gt", "neq", "is", "in"]) q[op] = () => q;
        q.order = async () => ({ data: opts.rows ?? [], error: opts.readError ?? null });
        q.then = (r: (v: unknown) => void) => r({ data: opts.rows ?? [], error: opts.readError ?? null });
        return q;
      },
      update: () => ({
        eq: async () => {
          updates += 1;
          const e = typeof opts.updateError === "function" ? opts.updateError(updates) : opts.updateError;
          return { error: e ?? null };
        },
      }),
    }),
  } as never;
}

describe("customer advance writes", () => {
  it("reversing advance use throws when the read or an update fails (balance no longer lost silently)", async () => {
    const rows = [{ id: "a1", used_amount: 500, amount: 500 }];
    await expect(reverseCustomerAdvanceFifo(fakeClient({ rows, readError: { message: "read" } }), "o", "c", 100)).rejects.toMatchObject({ message: "read" });
    await expect(reverseCustomerAdvanceFifo(fakeClient({ rows, updateError: { message: "write" } }), "o", "c", 100)).rejects.toMatchObject({ message: "write" });
    await expect(reverseCustomerAdvanceFifo(fakeClient({ rows }), "o", "c", 100)).resolves.toBeUndefined();
  });

  it("the advance helpers have no unchecked writes left", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/utils/reverseCustomerAdvanceFifo.ts", "src/utils/deductCustomerAdvanceManually.ts", "src/utils/advanceRefundService.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/^\s*await client\s*\n?\s*\.from\(/m);
      expect(src, f).not.toMatch(/^\s*await client\.from\([^)]*\)\.(update|delete|insert)\(/m);
    }
  });
});
