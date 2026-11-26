import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Spin & Win SQL (file 57): the rules that keep it fair and private. */
const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20270530120000_spin_and_win.sql"),
  "utf8",
);

describe("Spin & Win database rules", () => {
  it("one spin per bill: unique bill, a lock, and a repeat returns the first result", () => {
    expect(sql).toMatch(/sale_id uuid NOT NULL UNIQUE/);
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('spin:' || p_sale_id::text))");
    expect(sql).toContain("'again', true");
  });

  it("the server picks the prize by chance and stock, never the phone", () => {
    expect(sql).toMatch(/random\(\) \* v_total/);
    expect(sql).toContain("p.won_count < p.stock_total");
    expect(sql).toContain("p.stock_per_day IS NULL OR p.stock_per_day >");
  });

  it("the public page gets no amounts or phone numbers and is rate limited", () => {
    const view = sql.slice(sql.indexOf("FUNCTION public.get_public_spin"), sql.indexOf("FUNCTION public.spin_for_sale"));
    expect(view).toContain("storefront_public_lookup_rate_ok");
    expect(view).not.toMatch(/'net_amount'|'customer_phone'|'customer_name'/);
  });

  it("tables are members-only; results are written only by the functions", () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.spin_campaigns, public\.spin_prizes, public\.spin_results FROM anon/);
    expect(sql).toMatch(/GRANT SELECT ON public\.spin_results TO authenticated;/);
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*spin_results/);
  });

  it("POS code functions check the shop and are closed to anon", () => {
    for (const fn of ["check_spin_code", "redeem_spin_code"]) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}`));
      expect(body.slice(0, 600)).toContain("get_user_organization_ids(auth.uid())");
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`));
    }
  });

  it("a cancelled or deleted bill frees a used code and cancels an unused prize", () => {
    expect(sql).toContain("AFTER UPDATE OF deleted_at, is_cancelled ON public.sales");
    expect(sql).toContain("WHERE redeemed_sale_id = NEW.id AND status = 'redeemed'");
    expect(sql).toContain("won_count = greatest(0, p.won_count - 1)");
  });
});

/** File 58: campaign dates and the per-day limit follow the shop's day in India, not UTC. */
const istSql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20270531120000_spin_and_win_ist_dates.sql"),
  "utf8",
);

describe("Spin & Win dates use India time", () => {
  it("start/end dates and the per-day count use Asia/Kolkata", () => {
    for (const fn of ["_spin_bill_block_reason", "spin_for_sale"]) {
      expect(istSql).toContain(`FUNCTION public.${fn}`);
    }
    const block = istSql.slice(istSql.indexOf("FUNCTION public._spin_bill_block_reason"), istSql.indexOf("FUNCTION public.spin_for_sale"));
    expect(block).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(block).not.toMatch(/\bcurrent_date\b/);
    const spin = istSql.slice(istSql.indexOf("FUNCTION public.spin_for_sale"));
    expect(spin).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(spin).not.toMatch(/\bcurrent_date\b/);
  });
});
