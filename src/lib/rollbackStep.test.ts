import { beforeEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => [] as { operation: string; additionalContext?: unknown }[]);
vi.mock("@/lib/errorLogger", () => ({ logError: async (ctx: { operation: string }) => void logged.push(ctx) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { rollbackStep } from "@/lib/rollbackStep";
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
