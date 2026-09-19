/**
 * Tier 1 duplicate-receipt repair set — locks the 11 voucher_entries ids in
 * scripts/ssot-tier1-dup-double-submit-repair-2026-09-19.sql against the dry-run v2 paste
 * (docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv). No DB, no mutate.
 *
 * Tier 1 = receipt rows with status DELETE and shape DUP_DOUBLE_SUBMIT whose customer is
 * READY and carries NO DUP_TENDER_REKEYED leg. Approved 19 Sep 2026 as 11 rows / 10
 * customers / ₹62,916. Tier 2 (DUP_TENDER_REKEYED customers) and every HOLD row must be
 * absent from the SQL. If this test fails, the SQL and the approved set have drifted — stop.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(new URL(import.meta.url).pathname);
const csvPath = path.resolve(
  here,
  "../../docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv",
);
const sqlPath = path.resolve(
  here,
  "../../scripts/ssot-tier1-dup-double-submit-repair-2026-09-19.sql",
);

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: Row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const receipts = rows.filter((r) => r.section === "receipt");
const readyCustomers = new Set(
  rows.filter((r) => r.section === "customer" && r.status === "READY").map((r) => r.customer_id),
);
const rekeyedCustomers = new Set(
  receipts.filter((r) => r.shape === "DUP_TENDER_REKEYED").map((r) => r.customer_id),
);

const tier1 = receipts.filter(
  (r) =>
    r.status === "DELETE" &&
    r.shape === "DUP_DOUBLE_SUBMIT" &&
    readyCustomers.has(r.customer_id) &&
    !rekeyedCustomers.has(r.customer_id),
);
const tier2 = receipts.filter(
  (r) => r.status === "DELETE" && readyCustomers.has(r.customer_id) && rekeyedCustomers.has(r.customer_id),
);
const holds = receipts.filter((r) => r.status.startsWith("HOLD"));

const sql = readFileSync(sqlPath, "utf8");
const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ORG_IDS = new Set([
  "e8fbf0d8-182c-4364-8570-96c756b72db8",
  "dafc3d0c-874e-4784-bac3-5eab5f3c85b5",
  "3fdca631-1e0c-4417-9704-421f5129ff67",
  "4bc73037-e877-4123-9261-eb6e3876698c",
]);
const sqlUuids = new Set((sql.match(uuidRe) ?? []).filter((u) => !ORG_IDS.has(u)));

// Block A VALUES list is the authoritative expectation table.
const valuesRe =
  /\('([0-9a-f-]{36})'::uuid,\s*'([^']+)',\s*'([^']+)',\s*([0-9.]+)::numeric,\s*'([^']+)'\)/g;
const blockA = [...sql.matchAll(valuesRe)].map((m) => ({
  id: m[1],
  voucher: m[2],
  sale: m[3],
  amount: Number(m[4]),
  keep: m[5],
}));

describe("Tier 1 set derived from the dry-run v2 paste", () => {
  it("is 11 rows / 10 customers / ₹62,916, every row a tender-0 DUP_DOUBLE_SUBMIT", () => {
    expect(tier1).toHaveLength(11);
    expect(new Set(tier1.map((r) => r.customer_id)).size).toBe(10);
    expect(tier1.reduce((s, r) => s + Number(r.a), 0)).toBe(62916);
    for (const r of tier1) {
      expect(Number(r.b)).toBeLessThanOrEqual(0.5); // remaining_before
      const bill = rows.find(
        (b) => b.section === "bill" && b.customer_id === r.customer_id && b.sale_number === r.sale_number,
      );
      expect(bill, r.sale_number).toBeDefined();
      expect(Number(bill!.b)).toBe(0); // tender
      expect(bill!.h).toBe("completed → completed"); // paid status unchanged
    }
  });

  it("Tier 2 is 11 rows / 7 customers / ₹26,164; HOLD is 28 receipt rows; no non-Tier-1 id is in the SQL", () => {
    expect(tier2).toHaveLength(11);
    expect(new Set(tier2.map((r) => r.customer_id)).size).toBe(7);
    expect(tier2.reduce((s, r) => s + Number(r.a), 0)).toBe(26164);
    expect(holds).toHaveLength(28);
    const tier1Ids = new Set(tier1.map((r) => r.i));
    // Tier 2, HOLD, the DELETE legs of HOLD customers (ANANYA, 3063c897) and every KEEP leg
    for (const r of receipts.filter((x) => !tier1Ids.has(x.i))) {
      expect(sqlUuids.has(r.i), `${r.voucher_number} must not be in the Tier 1 SQL`).toBe(false);
    }
  });
});

describe("Block A live paste 20 Sep 00:41 IST", () => {
  const live = parseCsv(
    readFileSync(
      path.resolve(here, "../../docs/ssot-tier1-block-a-dry-run-live-2026-09-20-00-41-18.csv"),
      "utf8",
    ),
  );
  const liveRows = live.filter((r) => r.section === "row");
  const headline = live.find((r) => r.section === "headline")!;

  it("headline is ALL_OK at 11 rows / 10 customers / 62916 with every gate true", () => {
    expect(headline.delete_voucher).toBe("ALL_OK");
    expect(headline.sale_number).toBe("11 rows / 10 customers");
    expect(Number(headline.amount)).toBe(62916);
    expect(Number(headline.tender)).toBe(0);
    expect(Number(headline.live_receipt_rows)).toBe(22); // exactly two cash receipts per bill
    expect(Number(headline.receipts_others)).toBe(62916); // keep legs equal delete legs
    expect(Number(headline.over_after)).toBeCloseTo(0.1, 6); // JATIN's paise only
    for (const k of ["found", "live", "sale_live", "keep_leg_live", "row_ok"]) expect(headline[k]).toBe("true");
  });

  it("the 11 live rows are the same ids, vouchers, bills and amounts as the SQL and the dry-run", () => {
    expect(liveRows).toHaveLength(11);
    const byId = new Map(blockA.map((v) => [v.id, v]));
    for (const r of liveRows) {
      const v = byId.get(r.voucher_id);
      expect(v, `${r.delete_voucher} (${r.voucher_id}) is not in the SQL`).toBeDefined();
      expect(r.delete_voucher).toBe(v!.voucher);
      expect(r.sale_number).toBe(v!.sale);
      expect(Number(r.amount)).toBe(v!.amount);
      expect(r.keep_voucher_number).toBe(v!.keep);
      expect(r.row_ok).toBe("true");
      expect(Number(r.tender)).toBe(0);
      expect(Number(r.live_receipt_rows)).toBe(2);
      expect(r.status_live).toBe("completed");
      expect(Math.abs(Number(r.paid_live) - Number(r.net_due))).toBeLessThanOrEqual(0.5);
      expect(Number(r.over_after)).toBeGreaterThanOrEqual(-0.5);
      expect(Number(r.over_after)).toBeLessThanOrEqual(1);
      // the keep leg was written BEFORE the delete leg on every bill
      expect(new Date(r.keep_created_ist).getTime()).toBeLessThan(new Date(r.delete_created_ist).getTime());
    }
    expect(new Set(liveRows.map((r) => r.customer_id)).size).toBe(10);
    expect(liveRows.filter((r) => r.org_name === "ELLA NOOR")).toHaveLength(4);
    expect(liveRows.filter((r) => r.org_name.startsWith("VELVET"))).toHaveLength(7);
  });
});

describe("scripts/ssot-tier1-dup-double-submit-repair-2026-09-19.sql", () => {
  it("Block A VALUES lists exactly the 11 Tier 1 ids with the paste's voucher number, bill and amount", () => {
    expect(blockA).toHaveLength(11);
    const byId = new Map(tier1.map((r) => [r.i, r]));
    for (const v of blockA) {
      const r = byId.get(v.id);
      expect(r, `${v.voucher} (${v.id}) is not a Tier 1 row in the paste`).toBeDefined();
      expect(v.voucher).toBe(r!.voucher_number);
      expect(v.sale).toBe(r!.sale_number);
      expect(v.amount).toBe(Number(r!.a));
    }
    expect(blockA.reduce((s, v) => s + v.amount, 0)).toBe(62916);
  });

  it("each keep leg is the earlier live receipt on the same bill for the same amount (±1)", () => {
    for (const v of blockA) {
      const keep = receipts.find(
        (r) => r.sale_number === v.sale && r.voucher_number === v.keep && r.status === "KEEP",
      );
      expect(keep, `${v.sale}: keep leg ${v.keep}`).toBeDefined();
      expect(Math.abs(Number(keep!.a) - v.amount)).toBeLessThanOrEqual(1);
      expect(keep!.i).not.toBe(v.id);
    }
  });

  it("Block B repeats the same 11 ids, expects 11 / 10 / 62916, defaults to REHEARSE, soft-deletes only", () => {
    const blockB = sql.slice(sql.indexOf("-- BLOCK B — MUTATE"), sql.indexOf("-- BLOCK C — INVARIANT"));
    expect(blockB.length).toBeGreaterThan(1000);
    for (const v of blockA) expect(blockB).toContain(`('${v.id}', '${v.voucher}'`);
    expect(blockB).toMatch(/v_expected_rows\s+int\s+:= 11;/);
    expect(blockB).toMatch(/v_expected_custs\s+int\s+:= 10;/);
    expect(blockB).toMatch(/v_expected_sum\s+numeric := 62916;/);
    expect(blockB).toMatch(/v_mode\s+text := 'REHEARSE';/);
    expect(blockB).toContain("[dup_receipt_repair_20260919]");
    expect(blockB).toContain("SET deleted_at = now()");
    expect(blockB).not.toMatch(/\bDELETE FROM\b/i);
    expect(blockB).toMatch(/AND ve\.organization_id = ANY\(v_orgs\)/);
    // the whole SQL touches no other uuid than the 11 rows + 4 orgs
    expect([...sqlUuids].sort()).toEqual(blockA.map((v) => v.id).sort());
  });
});
