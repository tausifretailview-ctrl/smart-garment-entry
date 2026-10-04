/**
 * Balance Adjustment "advance reduced" and advance refunds have no voucher behind their
 * used_amount, so recompute_customer_advances_used (voucher-only) wiped them on the next
 * advance voucher (Saniya Mahaldar, ELLA NOOR: −₹40,000 at 11:46, advance applied 11:48 →
 * ₹40,000 available again). manual_used_amount + refunds are now part of the recompute.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deductCustomerAdvanceManually } from "@/utils/deductCustomerAdvanceManually";
import {
  advanceReductionFromAdjustmentDescription,
  computeInvoiceOutstandingFromReconciliation,
} from "@/utils/customerLedgerReconciliation";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

type Row = { id: string; amount: number; used_amount: number; manual_used_amount?: number };

/** Minimal supabase stand-in: one customer_advances table, FIFO order as given. */
function fakeClient(rows: Row[], opts?: { withoutManualColumn?: boolean }) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from() {
      const q: Record<string, unknown> = {};
      q.select = (cols: string) => {
        const missing = opts?.withoutManualColumn && cols.includes("manual_used_amount");
        const result = missing
          ? { data: null, error: { message: "column does not exist" } }
          : { data: rows.map((r) => ({ ...r })), error: null };
        const chain: Record<string, unknown> = {};
        for (const m of ["eq", "in", "order"]) chain[m] = () => chain;
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
        return chain;
      };
      q.update = (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          if (opts?.withoutManualColumn && "manual_used_amount" in patch) {
            return { error: { message: "column does not exist" } };
          }
          updates.push({ id, patch });
          const row = rows.find((r) => r.id === id)!;
          row.used_amount = patch.used_amount as number;
          if ("manual_used_amount" in patch) row.manual_used_amount = patch.manual_used_amount as number;
          return { error: null };
        },
      });
      return q;
    },
  };
  return { client: client as never, updates };
}

describe("deductCustomerAdvanceManually", () => {
  it("Saniya: ₹59,600 booking with ₹19,600 applied, remove ₹40,000 → used 59,600, manual 40,000", async () => {
    const rows: Row[] = [{ id: "a", amount: 59_600, used_amount: 0, manual_used_amount: 0 }];
    const { client, updates } = fakeClient(rows);
    const left = await deductCustomerAdvanceManually(client, "org", "cust", -40_000);
    expect(left).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toEqual({ used_amount: 40_000, status: "partially_used", manual_used_amount: 40_000 });
  });

  it("takes the oldest booking first and reports what could not be taken", async () => {
    const rows: Row[] = [
      { id: "a", amount: 1_000, used_amount: 400, manual_used_amount: 0 },
      { id: "b", amount: 2_000, used_amount: 0, manual_used_amount: 100 },
    ];
    const { client, updates } = fakeClient(rows);
    const left = await deductCustomerAdvanceManually(client, "org", "cust", 3_000);
    expect(updates.map((u) => u.id)).toEqual(["a", "b"]);
    expect(updates[0]!.patch).toMatchObject({ used_amount: 1_000, status: "fully_used", manual_used_amount: 600 });
    expect(updates[1]!.patch).toMatchObject({ used_amount: 2_000, status: "fully_used", manual_used_amount: 2_100 });
    expect(left).toBe(400);
  });

  it("falls back to the legacy used_amount write before the migration is applied", async () => {
    const rows: Row[] = [{ id: "a", amount: 5_000, used_amount: 0 }];
    const { client, updates } = fakeClient(rows, { withoutManualColumn: true });
    const left = await deductCustomerAdvanceManually(client, "org", "cust", 2_000);
    expect(left).toBe(0);
    expect(updates[0]!.patch).toEqual({ used_amount: 2_000, status: "partially_used" });
  });

  it("does nothing for a zero amount", async () => {
    const { client, updates } = fakeClient([{ id: "a", amount: 5_000, used_amount: 0 }]);
    expect(await deductCustomerAdvanceManually(client, "org", "cust", 0)).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe("both Balance Adjustment writers use the voucher-proof deduction", () => {
  it("dialog and recent-adjustments list call deductCustomerAdvanceManually", () => {
    for (const p of [
      "src/components/CustomerBalanceAdjustmentDialog.tsx",
      "src/components/RecentBalanceAdjustments.tsx",
    ]) {
      const src = read(p);
      expect(src, p).toContain("deductCustomerAdvanceManually(");
      expect(src, p).not.toMatch(/\.update\(\{\s*used_amount: newUsed/);
    }
  });
});

describe("recompute_customer_advances_used keeps manual deductions and refunds", () => {
  const sql = read("supabase/migrations/20270104130000_customer_advances_manual_used_amount.sql");

  it("adds the column and uses it with the refunds of each booking", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS manual_used_amount numeric NOT NULL DEFAULT 0");
    expect(sql).toContain("FROM public.advance_refunds ar");
    expect(sql).toContain("v_fixed := LEAST(rec.amount, rec.manual_used + rec.refunded)");
    expect(sql).toContain("v_take  := LEAST(GREATEST(v_remaining, 0), rec.amount - v_fixed)");
  });

  it("still sums the same advance-application vouchers as before", () => {
    expect(sql).toContain("ve.payment_method = 'advance_adjustment'");
    expect(sql).toContain("ve.description ILIKE '%adjusted from advance balance%'");
  });

  it("does not touch existing data", () => {
    expect(sql).not.toMatch(/^\s*(UPDATE public\.customer_advances\s+SET manual_used_amount|DELETE )/im);
  });
});

describe("Balance Adjustment advance removal stays out of ledger Outstanding", () => {
  it("reads the advance part from the ledger row text (Saniya ₹40,000)", () => {
    expect(
      advanceReductionFromAdjustmentDescription(
        "Balance Adjustment: 40000/-₹ wrong entry done in system (Advance Refund: ₹40,000)",
      ),
    ).toBe(40_000);
    expect(advanceReductionFromAdjustmentDescription("Balance Adjustment: round off")).toBe(0);
    expect(advanceReductionFromAdjustmentDescription(undefined)).toBe(0);
  });

  it("Saniya reconciliation: Bills 19,600 − Advance adjusted 19,600, advance removal excluded → Outstanding 0", () => {
    const adjustments = 40_000 - advanceReductionFromAdjustmentDescription("x (Advance Refund: ₹40,000)");
    expect(
      computeInvoiceOutstandingFromReconciliation({
        opening: 0,
        grossInvoiced: 19_600,
        invoiceCnApplied: 0,
        saleReturns: 0,
        paymentsCash: 0,
        paymentsDiscount: 0,
        advanceApplied: 19_600,
        adjustments,
      }),
    ).toBe(0);
  });

  it("CustomerLedger subtracts it and notes it separately", () => {
    const src = read("src/components/CustomerLedger.tsx");
    expect(src).toContain("advanceReductionFromAdjustmentDescription(t.description)");
    expect(src).toContain("adjustments += (t.debit || 0) - (t.credit || 0) - advancePart;");
    expect(src).toContain("Advance removed in Balance Adjustment (not in Outstanding)");
  });
});
