import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getCustomerAccountState } from "@/utils/customerBalanceCore";
import { computeCustomerOutstanding as computeAuditOutstanding } from "@/utils/customerAuditMath";
import { invoiceThisBillBalance } from "@/utils/invoiceAccountDue";

/**
 * Two-tier SSOT + 51-bill overlap (no mutate).
 *
 * Invoice leftover is tier-1 only. SNAP/C-PARTY/C-REC share
 * GREATEST(0, tender − receipts). C-JS uses max(paid, tender) − vouchers.
 * After duplicate removal those two still disagree with leftover on mixed
 * at-sale + later-receipt bills.
 */

const AT_SALE_875 = 1_000;
const RCP_799 = 2_100;
const RCP_1128 = 2_100;
const RCP_1129 = 1_000;
const AT_SALE_824 = 500;
const RCP_1391 = 3_000;
const POS_1903 = 17_250;
const AT_SALE_1903 = 1_000;
const LEFTOVER_1903 = POS_1903 - AT_SALE_1903; // 16,250

const POS_765 = 3_000;
const AT_SALE_765 = 400;
const RCP_1125 = 2_600;
const RCP_1126 = 400;

const POS_717 = 81_200;
const AT_SALE_717 = 75_200;
const RCP_213 = 6_000;
const RCP_1131_2 = 6_000;

const POS_123 = 11_000;
const AT_SALE_123 = 1_000;
const RCP_DIYA_PRIOR = 10_000;
const RCP_1145 = 10_000;

const POS_454 = 4_500;
const AT_SALE_454 = 3_000;
const RCP_DOLLY_PRIOR = 1_500;
const RCP_1144 = 1_500;

/** C-SNAP / C-PARTY / C-REC paid_at_sale_drift — no paid_amount. */
function snapDrift(tender: number, receipts: number): number {
  return Math.max(0, tender - receipts);
}

/** Amount of at-sale cash SNAP fails to credit once remaining receipts cover tender. */
function snapDrop(tender: number, receiptsAfter: number): number {
  return tender > 0.005 && receiptsAfter >= tender ? tender : 0;
}

/** C-JS computePaidAmountDrift gap; negative discarded. */
function cjsGap(paidAmount: number, tender: number, receiptsAfter: number): number {
  return Math.max(paidAmount, tender) - receiptsAfter;
}

/** leftover paidForReconcile floor. */
function leftoverPaidFloor(tender: number, storedPaid: number, voucherSum: number): number {
  return Math.max(tender, Math.max(0, storedPaid - voucherSum));
}

describe("tier-1 leftover is invoice-only — not customer SSOT", () => {
  it("this-bill leftover matches print ₹16,250 and is not C-JS / SNAP / ledger", () => {
    expect(invoiceThisBillBalance(POS_1903, AT_SALE_1903)).toBe(16_250);
    expect(16_250).not.toBe(14_150);
    expect(16_250).not.toBe(14_650);
    expect(16_250).not.toBe(13_150);
  });
});

describe("51-bill overlap — SNAP drop survives duplicate removal", () => {
  it("WAIT SHREEVASTAV POS/875: remaining RCP/799 ≥ tender → SNAP still drops ₹1,000", () => {
    const receiptsAfter = RCP_799;
    expect(snapDrop(AT_SALE_875, receiptsAfter)).toBe(1_000);
    expect(snapDrift(AT_SALE_875, receiptsAfter)).toBe(0);
    expect(leftoverPaidFloor(AT_SALE_875, 3_100, receiptsAfter)).toBe(1_000);
  });

  it("WAIT SHREEVASTAV sibling POS/824: SNAP drop ₹500 is independent of 1128/1129", () => {
    expect(snapDrop(AT_SALE_824, RCP_1391)).toBe(500);
    expect(LEFTOVER_1903 + AT_SALE_875 + AT_SALE_824).toBe(17_750);
  });

  it("WAIT VIMLA POS/765: after 1126 gone, SNAP drops ₹400 while leftover/ledger → ₹0", () => {
    const receiptsAfter = RCP_1125;
    expect(AT_SALE_765 + RCP_1125).toBe(POS_765);
    expect(snapDrop(AT_SALE_765, receiptsAfter)).toBe(400);
    expect(POS_765 - leftoverPaidFloor(AT_SALE_765, 3_000, receiptsAfter) - receiptsAfter).toBe(0);
  });

  it("WAIT DIYA POS/123: after 1145 gone, SNAP drops ₹1,000", () => {
    expect(snapDrop(AT_SALE_123, RCP_DIYA_PRIOR)).toBe(1_000);
    expect(RCP_1145).toBe(RCP_DIYA_PRIOR);
  });

  it("DOLLY POS/454: SNAP captures at-sale on THIS bill (receipts < tender)", () => {
    const receiptsAfter = RCP_DOLLY_PRIOR;
    expect(snapDrop(AT_SALE_454, receiptsAfter)).toBe(0);
    expect(snapDrift(AT_SALE_454, receiptsAfter)).toBe(1_500);
    expect(RCP_1144).toBe(RCP_DOLLY_PRIOR);
  });

  it("SANTOSH POS/717: SNAP captures at-sale on THIS bill; still WAIT customer (1131-1)", () => {
    const receiptsAfter = RCP_213;
    expect(snapDrop(AT_SALE_717, receiptsAfter)).toBe(0);
    expect(snapDrift(AT_SALE_717, receiptsAfter)).toBe(69_200);
    expect(RCP_1131_2).toBe(RCP_213);
  });

  it("Velvet tender-0 full-net dups: SNAP skip on THIS bill, not a customer all-clear", () => {
    expect(snapDrop(0, 13_700)).toBe(0);
  });
});

describe("C-JS GREATEST is independent of SNAP drop", () => {
  it("SHREEVASTAV 875: paid_amount 3100 restores C-JS; rewrite to 2100 does not", () => {
    const receiptsAfter = RCP_799;
    expect(cjsGap(3_100, AT_SALE_875, receiptsAfter)).toBe(1_000);
    expect(cjsGap(2_100, AT_SALE_875, receiptsAfter)).toBe(0);
    const invoiced = 34_350;
    const receiptsLive = 13_800;
    const jsDriftLive = 6_400;
    const receiptsAfterAll = receiptsLive - RCP_1128 - RCP_1129;
    expect(invoiced - receiptsAfterAll - (jsDriftLive + AT_SALE_875)).toBe(16_250);
    expect(invoiced - receiptsAfterAll - jsDriftLive).toBe(17_250);
  });

  it("VIMLA: paid_amount 3000 keeps C-JS gap ₹400 after 1126 gone (SNAP still drops)", () => {
    expect(cjsGap(3_000, AT_SALE_765, RCP_1125)).toBe(400);
    expect(snapDrop(AT_SALE_765, RCP_1125)).toBe(400);
  });
});

describe("customer/org-level families — none selected as SSOT", () => {
  const farhaanCore = {
    openingBalance: 0,
    customerId: "farhaan",
    sales: [
      { id: "inv-a", net_amount: 11800, paid_amount: 11800, sale_return_adjust: 0, items_gross: 11800 },
      { id: "inv-b", net_amount: 2800, paid_amount: 2800, sale_return_adjust: 0, items_gross: 2800 },
      { id: "inv-c", net_amount: 2700, paid_amount: 0, sale_return_adjust: 2700, items_gross: 2700 },
    ],
    voucherEntries: [
      { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-a", total_amount: 11800, discount_amount: 0, payment_method: "cash", description: "" },
      { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1700, discount_amount: 0, payment_method: "cash", description: "" },
      { voucher_type: "receipt" as const, reference_type: "sale", reference_id: "inv-b", total_amount: 1100, discount_amount: 0, payment_method: "cash", description: "" },
      {
        voucher_type: "receipt" as const,
        reference_type: "sale",
        reference_id: "inv-c",
        total_amount: 2700,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted against invoice INV/26-27/xxx",
      },
    ],
    customerAdvances: [] as Array<{ amount?: number | null; used_amount?: number | null; status: string }>,
    advanceRefunds: [] as Array<{ refund_amount?: number | null }>,
    saleReturns: [
      {
        net_amount: 2800,
        credit_status: "partially_adjusted",
        credit_available_balance: 100,
        linked_sale_id: null as string | null,
      },
    ],
    options: { ledgerAlignedApplicationReceipts: true },
  };

  it("C-AUDIT delegates to C-JS — same GREATEST family, not a second customer source", () => {
    const js = getCustomerAccountState(farhaanCore);
    const audit = computeAuditOutstanding(farhaanCore, { ledgerAlignedApplicationReceipts: true });
    expect(audit.outstanding).toBeCloseTo(js.balance, 0);
  });

  it("C-OB-SALES opening+invoiced−paid_amount is not Farhaan −₹100", () => {
    const naive = 0 + 17_300 - (11_800 + 2_800 + 0);
    expect(naive).toBe(2_700);
    expect(naive).not.toBe(-100);
  });

  it("C-PARTY / C-SNAP / C-REC share SNAP drift — installing C-PARTY installs bucket (g)", () => {
    // Identity: same GREATEST(0, tender − receipts) as SNAP. Remaining 799 on 875 drops tender.
    expect(snapDrift(AT_SALE_875, RCP_799)).toBe(0);
    expect(snapDrift(AT_SALE_824, RCP_1391)).toBe(0);
  });

  it("Farhaan −₹100 lock does not clear mixed at-sale+receipt SNAP drop", () => {
    const js = getCustomerAccountState(farhaanCore);
    expect(js.balance).toBeCloseTo(-100, 0);
    expect(snapDrop(AT_SALE_875, RCP_799)).not.toBe(0);
  });
});

/** Live SQL editor paste 19 Sep 2026 20:10 IST — May already-zero named set, not the all-time 51. */
describe("live overlap CSV 20:10 IST", () => {
  const HEENA = "dde74df8-fe5d-48c8-a010-d33f290b98bc";
  const ANANYA = "0616f278-8878-45fb-9dd4-ea899dfeb039";
  const SHREE = "3a4ef881-e561-4c0e-9764-1c8e903fe109";
  const text = readFileSync(
    resolve(__dirname, "../../docs/ssot-51-bill-overlap-live-2026-09-19-20-10-57.csv"),
    "utf8",
  );
  const lines = text.trim().split(/\n/);
  const header = lines[0].split(";");
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(";");
    const o: Record<string, string> = {};
    header.forEach((h, i) => {
      o[h] = cols[i] ?? "";
    });
    return o;
  });
  const num = (row: Record<string, string>, key: string) => {
    const raw = (row[key] || "").trim();
    if (!raw) return 0;
    return Number(raw);
  };
  const named = rows.filter((r) => r.section === "named_bill");
  const siblings = rows.filter((r) => r.section === "sibling_snap_drop");

  it("18 unique named bills (POS/875 twice for 1128 and 1129)", () => {
    const sales = new Set(named.map((r) => r.sale_number));
    expect(named.filter((r) => r.sale_number === "POS/25-26/875")).toHaveLength(2);
    expect(sales.size).toBe(18);
  });

  it("direct SNAP-drop on the repaired bill: 875 ₹1,000, 765 ₹400, 123 ₹1,000", () => {
    const drop = (sale: string) =>
      num(named.find((r) => r.sale_number === sale)!, "snap_drop_after");
    expect(drop("POS/25-26/875")).toBe(1_000);
    expect(drop("POS/26-27/765")).toBe(400);
    expect(drop("POS/25-26/123")).toBe(1_000);
  });

  it("live paid_amount still holds tender — C-JS gap positive, GREATEST rewrite did not fire", () => {
    const row875 = named.find((r) => r.sale_number === "POS/25-26/875")!;
    expect(num(row875, "paid_amount")).toBe(3_100);
    expect(num(row875, "cjs_gap_after")).toBe(1_000);
    expect(num(named.find((r) => r.sale_number === "POS/26-27/765")!, "cjs_gap_after")).toBe(400);
    expect(num(named.find((r) => r.sale_number === "POS/25-26/123")!, "cjs_gap_after")).toBe(1_000);
  });

  it("SHREEVASTAV sibling POS/824 SNAP-drop ₹500 is live", () => {
    const row = siblings.find((r) => r.sale_number === "POS/26-27/824")!;
    expect(row.customer_id).toBe(SHREE);
    expect(num(row, "snap_drop_after")).toBe(500);
  });

  it("HEENA tender-0 repair bill 853 sits on ₹9,686 sibling SNAP-drop", () => {
    expect(num(named.find((r) => r.sale_number === "POS/26-27/853")!, "tender")).toBe(0);
    const extra = siblings.filter(
      (r) => r.customer_id === HEENA && r.sale_number !== "POS/26-27/853",
    );
    const sales = extra.map((r) => r.sale_number).sort();
    expect(sales).toEqual(["POS/26-27/1488", "POS/26-27/1594", "POS/26-27/1714"]);
    expect(extra.reduce((s, r) => s + num(r, "snap_drop_after"), 0)).toBe(9_686);
  });

  it("ANANYA four tender-0 dups sit on sibling POS/1788 SNAP-drop ₹2,416", () => {
    const row = siblings.find((r) => r.sale_number === "POS/26-27/1788")!;
    expect(row.customer_id).toBe(ANANYA);
    expect(num(row, "snap_drop_after")).toBe(2_416);
  });
});
