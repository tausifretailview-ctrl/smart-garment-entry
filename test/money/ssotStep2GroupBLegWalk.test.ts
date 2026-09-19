/**
 * Step 2a dry-run leg selection v2 — locks the rule in
 * scripts/ssot-step2-group-b-dry-run-2026-09-19.sql. No DB, no mutate.
 *
 * Why v1 (22:01 IST paste) was not safe to act on:
 *   - it added FULL at-sale tender, so a POS bill that dual-writes cash_amount and a
 *     same-day receipt looked ₹X over-credited (the printed ledger nets same-day receipts
 *     against tender — CustomerLedgerPage residualPaymentAtSaleTender);
 *   - it deleted any whole-redundant leg, including a ₹4,200 receipt on an ₹8,200 bill
 *     paid at the counter — a real payment on the wrong bill, not a duplicate of anything;
 *   - same-minute pairs where the echo landed first deleted the wrong leg (POS/26-27/2442).
 *
 * v2 rule:
 *   tender_residual  = max(0, tender − same-day receipts)
 *   over_credit      = max(0, receipts + tender_residual − net_due)
 *   tender echo      = ONE leg with amount = tender_residual ±1, not on the sale day,
 *                      over_credit ≥ amount − 1                     → DUP_TENDER_REKEYED → DELETE
 *   remaining_before = net_due − tender_residual − Σ earlier non-echo legs
 *   remaining ≤ 0.5 and amount = an earlier leg ±1                  → DUP_DOUBLE_SUBMIT  → DELETE
 *   remaining ≤ 0.5 otherwise                                        → NON_ECHO_REDUNDANT → HOLD
 *   0.5 < remaining < amount − 0.5                                   → PARTIAL            → HOLD
 *   same-day leg ≤ tender                                            → SAME_DAY_DUAL_WRITE → KEEP
 *   payment_method balance_adjustment                                → HOLD (own thread)
 * Bill OK only if no HOLD leg and Σ DELETE = over_credit within ₹1. Customer READY only if
 * every bill is OK.
 */
import { describe, expect, it } from "vitest";

type Receipt = {
  ref: string;
  amount: number;
  createdAt: string;
  voucherDate: string;
  method?: string;
  description?: string;
};
type Bill = { saleNumber: string; saleDay: string; netDue: number; tender: number; receipts: Receipt[] };
type Kind =
  | "BALANCE_ADJUSTMENT"
  | "COUNTER_MATERIALISED"
  | "SAME_DAY_DUAL_WRITE"
  | "DUP_TENDER_REKEYED"
  | "DUP_DOUBLE_SUBMIT"
  | "NON_ECHO_REDUNDANT"
  | "PARTIAL"
  | "KEEP";
type Action = "DELETE" | "KEEP" | `HOLD_${Kind}`;
type Leg = Receipt & { sameDay: boolean; remainingBefore: number; kind: Kind; action: Action };

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function tenderResidual(bill: Bill): number {
  const sameDay = sum(bill.receipts.filter((r) => r.voucherDate === bill.saleDay).map((r) => r.amount));
  return Math.max(0, bill.tender - sameDay);
}

export function overCredit(bill: Bill): number {
  return Math.max(0, sum(bill.receipts.map((r) => r.amount)) + tenderResidual(bill) - bill.netDue);
}

export function walk(bill: Bill): Leg[] {
  const residual = tenderResidual(bill);
  const over = overCredit(bill);
  const sorted = [...bill.receipts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ref.localeCompare(b.ref));
  const echoIdx = sorted.findIndex(
    (r) =>
      r.voucherDate !== bill.saleDay &&
      r.method !== "balance_adjustment" &&
      residual > 0.005 &&
      Math.abs(r.amount - residual) <= 1 &&
      over >= r.amount - 1,
  );
  let prior = 0;
  return sorted.map((r, i) => {
    const sameDay = r.voucherDate === bill.saleDay;
    const isEcho = i === echoIdx;
    const remainingBefore = bill.netDue - residual - prior;
    if (!isEcho) prior += r.amount;
    const echoesEarlier = sorted.slice(0, i).some((p) => Math.abs(p.amount - r.amount) <= 1);
    let kind: Kind;
    if (r.method === "balance_adjustment") kind = "BALANCE_ADJUSTMENT";
    else if ((r.description ?? "").startsWith("Counter payment received for sale")) kind = "COUNTER_MATERIALISED";
    else if (sameDay && r.amount <= bill.tender + 1) kind = "SAME_DAY_DUAL_WRITE";
    else if (isEcho) kind = "DUP_TENDER_REKEYED";
    else if (remainingBefore <= 0.5 && echoesEarlier) kind = "DUP_DOUBLE_SUBMIT";
    else if (remainingBefore <= 0.5) kind = "NON_ECHO_REDUNDANT";
    else if (remainingBefore < r.amount - 0.5) kind = "PARTIAL";
    else kind = "KEEP";
    const action: Action =
      kind === "DUP_TENDER_REKEYED" || kind === "DUP_DOUBLE_SUBMIT"
        ? "DELETE"
        : kind === "KEEP" || kind === "SAME_DAY_DUAL_WRITE" || (kind === "COUNTER_MATERIALISED" && sameDay)
          ? "KEEP"
          : `HOLD_${kind}`;
    return { ...r, sameDay, remainingBefore, kind, action };
  });
}

export function billStatus(bill: Bill): string {
  const legs = walk(bill);
  const holds = legs.filter((l) => l.action.startsWith("HOLD_"));
  if (holds.length) return "HOLD_" + [...new Set(holds.map((l) => l.kind))].join("+");
  const del = legs.filter((l) => l.action === "DELETE");
  if (Math.abs(sum(del.map((l) => l.amount)) - overCredit(bill)) > 1) return "HOLD_RECON_MISMATCH";
  if (del.length === 0) return "HOLD_NO_DELETE_LEG";
  return "OK";
}

export function customerStatus(bills: Bill[]): "READY" | "HOLD" {
  return bills.every((b) => billStatus(b) === "OK") ? "READY" : "HOLD";
}

export function predictedPaid(bill: Bill): number {
  const del = sum(walk(bill).filter((l) => l.action === "DELETE").map((l) => l.amount));
  const receiptsAfter = sum(bill.receipts.map((r) => r.amount)) - del;
  return Math.min(bill.netDue, Math.max(receiptsAfter, bill.tender));
}

const r = (ref: string, amount: number, createdAt: string, extra: Partial<Receipt> = {}): Receipt => ({
  ref,
  amount,
  createdAt,
  voucherDate: createdAt.slice(0, 10),
  ...extra,
});

describe("same-day netting — the v1 false positives", () => {
  it("POS dual-write (cash_amount + same-day receipt of the same amount) is NOT over-credited", () => {
    const b: Bill = {
      saleNumber: "POS/x",
      saleDay: "2026-07-23",
      netDue: 442,
      tender: 442,
      receipts: [r("RCP/3109", 442, "2026-07-23T21:14")],
    };
    expect(tenderResidual(b)).toBe(0);
    expect(overCredit(b)).toBe(0); // never enters the repair population
    expect(walk(b)[0]).toMatchObject({ kind: "SAME_DAY_DUAL_WRITE", action: "KEEP" });
  });

  it("the app's own 'Counter payment received for sale' backfill on the sale day is KEEP", () => {
    const b: Bill = {
      saleNumber: "POS/93",
      saleDay: "2026-04-10",
      netDue: 20_900,
      tender: 4_000,
      receipts: [
        r("RCP/a", 4_000, "2026-04-20T10:00", {
          voucherDate: "2026-04-10",
          description: "Counter payment received for sale POS/26-27/93",
        }),
        r("RCP/b", 16_900, "2026-04-20T10:00"),
      ],
    };
    expect(overCredit(b)).toBe(0);
    expect(walk(b)[0]).toMatchObject({ kind: "COUNTER_MATERIALISED", action: "KEEP" });
    expect(walk(b)[1]).toMatchObject({ kind: "KEEP" });
  });

  it("Shreevastav 875 is unchanged: no same-day receipt, residual = full ₹1,000 tender", () => {
    const s875: Bill = {
      saleNumber: "POS/25-26/875",
      saleDay: "2026-03-02",
      netDue: 3_100,
      tender: 1_000,
      receipts: [
        r("RCP/25-26/799", 2_100, "2026-03-05T11:44"),
        r("RCP/26-27/1128", 2_100, "2026-05-30T12:59:00"),
        r("RCP/26-27/1129", 1_000, "2026-05-30T12:59:01"),
      ],
    };
    expect(tenderResidual(s875)).toBe(1_000);
    expect(overCredit(s875)).toBe(3_100);
    const legs = walk(s875);
    // 1129 (₹1,000 = residual tender, 30 May) is the tender echo; 1128 doubles 799.
    expect(legs.map((l) => [l.ref, l.kind, l.action])).toEqual([
      ["RCP/25-26/799", "KEEP", "KEEP"],
      ["RCP/26-27/1128", "DUP_DOUBLE_SUBMIT", "DELETE"],
      ["RCP/26-27/1129", "DUP_TENDER_REKEYED", "DELETE"],
    ]);
    expect(billStatus(s875)).toBe("OK");
  });
});

describe("echo-only deletes — the v1 over-reach", () => {
  it("₹4,200 receipt on an ₹8,200 bill paid at the counter is NOT a duplicate → HOLD_NON_ECHO_REDUNDANT", () => {
    // POS/25-26/678, RCP/26-27/2996 (20 Jul upi). v1 said DELETE_WHOLE / customer READY.
    const b: Bill = {
      saleNumber: "POS/25-26/678",
      saleDay: "2026-02-10",
      netDue: 8_200,
      tender: 8_200,
      receipts: [r("RCP/26-27/2996", 4_200, "2026-07-20T17:02", { method: "upi" })],
    };
    expect(overCredit(b)).toBe(4_200);
    expect(walk(b)[0]).toMatchObject({ kind: "NON_ECHO_REDUNDANT", action: "HOLD_NON_ECHO_REDUNDANT" });
    expect(billStatus(b)).toBe("HOLD_NON_ECHO_REDUNDANT");
  });

  it("₹3,842 cash seven weeks after a bill fully paid by UPI is HOLD, not DELETE (INV/26-27/157)", () => {
    const b: Bill = {
      saleNumber: "INV/26-27/157",
      saleDay: "2026-04-30",
      netDue: 7_972.29,
      tender: 0,
      receipts: [r("RCP/104-4", 7_972, "2026-04-30T13:23", { method: "upi" }), r("RCP/1878", 3_842, "2026-06-18T12:30")],
    };
    expect(walk(b)[1].kind).toBe("NON_ECHO_REDUNDANT");
    expect(customerStatus([b])).toBe("HOLD");
  });

  it("exact double submit — INV/26-27/1089 RCP/2442 twice in the same minute → second leg DELETE", () => {
    const b: Bill = {
      saleNumber: "INV/26-27/1089",
      saleDay: "2026-07-01",
      netDue: 5_250,
      tender: 0,
      receipts: [
        r("RCP/26-27/2442", 5_250, "2026-07-01T21:13:00", { method: "upi" }),
        r("RCP/26-27/2442#d791657cc", 5_250, "2026-07-01T21:13:01", { method: "upi" }),
      ],
    };
    const legs = walk(b);
    expect(legs[0].action).toBe("KEEP");
    expect(legs[1]).toMatchObject({ kind: "DUP_DOUBLE_SUBMIT", action: "DELETE" });
    expect(billStatus(b)).toBe("OK");
    expect(predictedPaid(b)).toBe(5_250);
  });

  it("30 May 17:0x Velvet batch row — JATIN POS/808 second ₹13,700 is a double submit", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/808",
      saleDay: "2026-05-13",
      netDue: 13_699.9,
      tender: 0,
      receipts: [
        r("RCP/26-27/20#da15b3b8d", 13_700, "2026-05-13T12:05", { method: "card" }),
        r("RCP/26-27/1131", 13_700, "2026-05-30T17:04", { method: "card" }),
      ],
    };
    expect(walk(b)[1]).toMatchObject({ kind: "DUP_DOUBLE_SUBMIT", action: "DELETE" });
    expect(billStatus(b)).toBe("OK");
  });
});

describe("tender echo is matched by amount, not by position", () => {
  it("POS/26-27/2442: ₹7,000 (= tender) then ₹5,000 in the same minute → delete the ₹7,000, keep the ₹5,000", () => {
    // v1 deleted RCP/4768 (₹5,000) and held RCP/4767 as PARTIAL — the wrong leg.
    const b: Bill = {
      saleNumber: "POS/26-27/2442",
      saleDay: "2026-09-10",
      netDue: 12_000,
      tender: 7_000,
      receipts: [r("RCP/26-27/4767", 7_000, "2026-09-16T14:19:00"), r("RCP/26-27/4768", 5_000, "2026-09-16T14:19:01")],
    };
    expect(overCredit(b)).toBe(7_000);
    const legs = walk(b);
    expect(legs[0]).toMatchObject({ ref: "RCP/26-27/4767", kind: "DUP_TENDER_REKEYED", action: "DELETE" });
    expect(legs[1]).toMatchObject({ ref: "RCP/26-27/4768", remainingBefore: 5_000, kind: "KEEP" });
    expect(billStatus(b)).toBe("OK");
    // paid_amount after repair follows compute_sale_settlement's GREATEST(receipts, tender):
    // GREATEST(5,000, 7,000) = 7,000 — the ledger says 12,000. That gap IS bucket (g), so
    // this customer gates to Group A upstream (snap_drop_after = 7,000 − 2,000 = 5,000).
    expect(predictedPaid(b)).toBe(7_000);
    expect(12_000 - predictedPaid(b)).toBe(5_000);
  });

  it("if those two receipts were dated the sale day, the bill is a dual-write and never enters the set", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/2442",
      saleDay: "2026-09-16",
      netDue: 12_000,
      tender: 7_000,
      receipts: [r("RCP/26-27/4767", 7_000, "2026-09-16T14:19:00"), r("RCP/26-27/4768", 5_000, "2026-09-16T14:19:01")],
    };
    expect(overCredit(b)).toBe(0);
  });

  it("a receipt equal to tender whose over-credit is smaller than itself is PARTIAL, not an echo (POS/26-27/1753)", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/1753",
      saleDay: "2026-09-01",
      netDue: 1_900,
      tender: 1_200,
      receipts: [r("RCP/26-27/4622", 1_200, "2026-09-08T18:38")],
    };
    expect(overCredit(b)).toBe(500);
    expect(walk(b)[0]).toMatchObject({ kind: "PARTIAL", action: "HOLD_PARTIAL" });
  });
});

describe("holds that stay holds", () => {
  it("1 Jul 2026 15:25 balance_adjustment batch is its own thread — HOLD_BALANCE_ADJUSTMENT", () => {
    const b: Bill = {
      saleNumber: "INV/25-26/443",
      saleDay: "2026-02-28",
      netDue: 3_200,
      tender: 0,
      receipts: [
        r("RCP/25-26/555", 1_300, "2026-02-28T20:13"),
        r("RCP/26-27/2414", 3_200, "2026-07-01T15:25", { method: "balance_adjustment" }),
      ],
    };
    expect(walk(b)[1]).toMatchObject({ kind: "BALANCE_ADJUSTMENT", action: "HOLD_BALANCE_ADJUSTMENT" });
    expect(billStatus(b)).toBe("HOLD_BALANCE_ADJUSTMENT");
  });

  it("INV/25-26/799: 10,000 + 10,000 + 5,000 + 5,000 on ₹20,000 — which pair is spurious is undecidable → HOLD", () => {
    const b: Bill = {
      saleNumber: "INV/25-26/799",
      saleDay: "2026-03-07",
      netDue: 20_000,
      tender: 0,
      receipts: [
        r("RCP/909", 10_000, "2026-03-07T14:57"),
        r("RCP/910", 10_000, "2026-03-07T14:58:00"),
        r("RCP/911", 5_000, "2026-03-07T14:58:01"),
        r("RCP/912", 5_000, "2026-03-07T14:58:02"),
      ],
    };
    const kinds = walk(b).map((l) => l.kind);
    expect(kinds).toEqual(["KEEP", "KEEP", "NON_ECHO_REDUNDANT", "DUP_DOUBLE_SUBMIT"]);
    expect(billStatus(b)).toBe("HOLD_NON_ECHO_REDUNDANT");
  });

  it("instalment overpay inside one leg is PARTIAL (INV/25-26/255 last ₹5,000 vs ₹4,361 remaining)", () => {
    const b: Bill = {
      saleNumber: "INV/25-26/255",
      saleDay: "2026-01-05",
      netDue: 15_563,
      tender: 0,
      receipts: [
        r("a", 3_702, "2026-07-14T13:31"),
        r("b", 1_000, "2026-07-14T13:58"),
        r("c", 2_500, "2026-07-21T20:17"),
        r("d", 2_000, "2026-07-28T16:45"),
        r("e", 2_000, "2026-08-12T15:25"),
        r("f", 5_000, "2026-09-09T21:08"),
      ],
    };
    expect(walk(b)[5]).toMatchObject({ remainingBefore: 4_361, kind: "PARTIAL" });
    expect(overCredit(b)).toBe(639);
  });
});

describe("customer-atomic", () => {
  it("HEENA: 853 is a clean double submit, but 1488/1594/1714 are only deletable if their receipts are dated after the sale day and match the tender", () => {
    const heena: Bill[] = [
      {
        saleNumber: "POS/26-27/853",
        saleDay: "2026-05-28",
        netDue: 2_770,
        tender: 0,
        receipts: [r("RCP/1124", 2_770, "2026-05-28T17:49"), r("RCP/1132", 2_770, "2026-05-30T17:05")],
      },
      { saleNumber: "POS/26-27/1488", saleDay: "2026-06-20", netDue: 6_290, tender: 6_290, receipts: [r("RCP/3263", 6_290, "2026-07-31T13:05")] },
      { saleNumber: "POS/26-27/1594", saleDay: "2026-06-28", netDue: 2_547, tender: 2_547, receipts: [r("RCP/3264", 2_547, "2026-07-31T13:06")] },
      { saleNumber: "POS/26-27/1714", saleDay: "2026-07-08", netDue: 849, tender: 849, receipts: [r("RCP/3265", 849, "2026-07-31T13:06")] },
    ];
    expect(heena.map(billStatus)).toEqual(["OK", "OK", "OK", "OK"]);
    expect(customerStatus(heena)).toBe("READY");
    expect(heena.slice(1).map((b) => walk(b)[0].kind)).toEqual([
      "DUP_TENDER_REKEYED",
      "DUP_TENDER_REKEYED",
      "DUP_TENDER_REKEYED",
    ]);
  });

  it("…and if 1488's receipt were dated the sale day, that bill drops out and HEENA is still READY on the other three", () => {
    const b1488: Bill = {
      saleNumber: "POS/26-27/1488",
      saleDay: "2026-07-31",
      netDue: 6_290,
      tender: 6_290,
      receipts: [r("RCP/3263", 6_290, "2026-07-31T13:05")],
    };
    expect(overCredit(b1488)).toBe(0);
  });

  it("one HOLD bill holds the whole customer", () => {
    const bills: Bill[] = [
      {
        saleNumber: "X/1",
        saleDay: "2025-12-01",
        netDue: 1_000,
        tender: 0,
        receipts: [r("a", 1_000, "2026-01-01T10:00"), r("b", 1_000, "2026-01-02T10:00")],
      },
      {
        saleNumber: "X/2",
        saleDay: "2025-12-01",
        netDue: 500,
        tender: 0,
        receipts: [r("c", 450, "2026-01-01T10:00"), r("d", 100, "2026-01-02T10:00")],
      },
    ];
    expect(billStatus(bills[0])).toBe("OK");
    expect(billStatus(bills[1])).toBe("HOLD_PARTIAL");
    expect(customerStatus(bills)).toBe("HOLD");
  });
});

describe("v1 paste re-scored under the v2 rule (sale days unknown → assumes not same-day)", () => {
  // From docs/ssot-step2-group-b-dry-run-v1-live-2026-09-19-22-01-26.csv: the 32 v1-READY
  // customers split into 19 whose DELETE legs all echo something (₹1,03,770 / 24 bills) and
  // 13 whose only "duplicate" is an unrelated amount on an already-paid bill (₹39,614 / 14 bills).
  // The 19 still need the live sale day to confirm none is a same-day dual-write.
  it("upper bound on what v2 can mark DELETE from the v1 READY set", () => {
    expect(19 + 13).toBe(32);
    expect(103_770 + 39_614).toBe(143_384);
    // v1 said ₹1,53,884 deletable; the 17 v1-HOLD customers carried ₹10,500 of DELETE legs too.
    expect(153_884 - 143_384).toBe(10_500);
  });
});
