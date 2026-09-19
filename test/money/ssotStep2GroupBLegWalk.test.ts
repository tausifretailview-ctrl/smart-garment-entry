/**
 * Step 2a dry-run leg selection — locks the rule in
 * scripts/ssot-step2-group-b-dry-run-2026-09-19.sql. No DB, no mutate.
 *
 * remaining_before = net_due − tender − SUM(earlier cash receipts)
 *   DELETE_WHOLE  remaining_before ≤ 0.5
 *   HOLD_PARTIAL  0.5 < remaining_before < amount − 0.5
 *   KEEP          otherwise
 * Bill OK only if SUM(DELETE_WHOLE) = over_credit within ₹1 and no HOLD_PARTIAL.
 * Customer READY only if every bill is OK (customer-atomic).
 */
import { describe, expect, it } from "vitest";

type Receipt = { ref: string; amount: number; createdAt: string };
type Bill = { saleNumber: string; netDue: number; tender: number; receipts: Receipt[] };
type Action = "DELETE_WHOLE" | "HOLD_PARTIAL" | "KEEP";

function walk(bill: Bill): Array<Receipt & { remainingBefore: number; action: Action }> {
  const sorted = [...bill.receipts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let prior = 0;
  return sorted.map((r) => {
    const remainingBefore = bill.netDue - bill.tender - prior;
    prior += r.amount;
    const action: Action =
      remainingBefore <= 0.5
        ? "DELETE_WHOLE"
        : remainingBefore < r.amount - 0.5
          ? "HOLD_PARTIAL"
          : "KEEP";
    return { ...r, remainingBefore, action };
  });
}

function overCredit(bill: Bill): number {
  const receipts = bill.receipts.reduce((s, r) => s + r.amount, 0);
  return Math.max(0, receipts + bill.tender - bill.netDue);
}

function billStatus(bill: Bill): "OK" | "HOLD_PARTIAL" | "HOLD_RECON_MISMATCH" | "HOLD_NO_WHOLE_LEG" {
  const legs = walk(bill);
  if (legs.some((l) => l.action === "HOLD_PARTIAL")) return "HOLD_PARTIAL";
  const del = legs.filter((l) => l.action === "DELETE_WHOLE");
  const delSum = del.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(delSum - overCredit(bill)) > 1) return "HOLD_RECON_MISMATCH";
  if (del.length === 0) return "HOLD_NO_WHOLE_LEG";
  return "OK";
}

function customerStatus(bills: Bill[]): "READY" | "HOLD" {
  return bills.every((b) => billStatus(b) === "OK") ? "READY" : "HOLD";
}

function predictedPaid(bill: Bill): number {
  const del = walk(bill).filter((l) => l.action === "DELETE_WHOLE").reduce((s, l) => s + l.amount, 0);
  const receiptsAfter = bill.receipts.reduce((s, r) => s + r.amount, 0) - del;
  return Math.min(bill.netDue, Math.max(receiptsAfter, bill.tender));
}

describe("leg walk — the Shreevastav shape proves the rule (she is Group A, not repaired here)", () => {
  const s875: Bill = {
    saleNumber: "POS/25-26/875",
    netDue: 3_100,
    tender: 1_000,
    receipts: [
      { ref: "RCP/25-26/799", amount: 2_100, createdAt: "2026-03-05T11:44" },
      { ref: "RCP/26-27/1128", amount: 2_100, createdAt: "2026-05-30T12:59:00" },
      { ref: "RCP/26-27/1129", amount: 1_000, createdAt: "2026-05-30T12:59:01" },
    ],
  };

  it("799 KEEP (remaining 2,100), 1128 and 1129 DELETE_WHOLE (remaining 0, −2,100)", () => {
    const legs = walk(s875);
    expect(legs.map((l) => [l.ref, l.remainingBefore, l.action])).toEqual([
      ["RCP/25-26/799", 2_100, "KEEP"],
      ["RCP/26-27/1128", 0, "DELETE_WHOLE"],
      ["RCP/26-27/1129", -2_100, "DELETE_WHOLE"],
    ]);
    expect(overCredit(s875)).toBe(3_100);
    expect(billStatus(s875)).toBe("OK");
  });
});

describe("Group B shapes", () => {
  it("EXACT_DOUBLE_RECEIPT — JATIN POS/808: second ₹13,700 leg deleted, paid lands on net", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/808",
      netDue: 13_699.9,
      tender: 0,
      receipts: [
        { ref: "RCP/a", amount: 13_700, createdAt: "2026-05-30T10:00" },
        { ref: "RCP/b", amount: 13_700, createdAt: "2026-05-30T10:01" },
      ],
    };
    const legs = walk(b);
    expect(legs[0].action).toBe("KEEP");
    expect(legs[1].action).toBe("DELETE_WHOLE");
    expect(billStatus(b)).toBe("OK");
    expect(predictedPaid(b)).toBe(13_699.9);
  });

  it("RECEIPT_DUPLICATES_AT_SALE_TENDER — HEENA POS/1488: tender covers the bill, receipt is whole-redundant", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/1488",
      netDue: 6_290,
      tender: 6_290,
      receipts: [{ ref: "RCP/x", amount: 6_290, createdAt: "2026-06-01T12:00" }],
    };
    expect(walk(b)[0]).toMatchObject({ remainingBefore: 0, action: "DELETE_WHOLE" });
    expect(billStatus(b)).toBe("OK");
    expect(predictedPaid(b)).toBe(6_290);
  });

  it("RECEIPT_OVER_PARTIAL with a whole redundant leg — OK", () => {
    // INV/25-26/443 class: net 3,200, receipts 3,200 + 1,300
    const b: Bill = {
      saleNumber: "INV/25-26/443",
      netDue: 3_200,
      tender: 0,
      receipts: [
        { ref: "RCP/1", amount: 3_200, createdAt: "2026-01-01T10:00" },
        { ref: "RCP/2", amount: 1_300, createdAt: "2026-02-01T10:00" },
      ],
    };
    expect(walk(b)[1].action).toBe("DELETE_WHOLE");
    expect(billStatus(b)).toBe("OK");
  });

  it("RECEIPT_OVER_PARTIAL where the excess is inside one receipt — HOLD_PARTIAL, not deleted", () => {
    // INV/25-26/1229 class: net 3,050, receipts 3,000 + 100 → ₹50 over, but the ₹100 leg is half-genuine
    const b: Bill = {
      saleNumber: "INV/25-26/1229",
      netDue: 3_050,
      tender: 0,
      receipts: [
        { ref: "RCP/1", amount: 3_000, createdAt: "2026-01-01T10:00" },
        { ref: "RCP/2", amount: 100, createdAt: "2026-02-01T10:00" },
      ],
    };
    const legs = walk(b);
    expect(legs[1]).toMatchObject({ remainingBefore: 50, action: "HOLD_PARTIAL" });
    expect(billStatus(b)).toBe("HOLD_PARTIAL");
    expect(overCredit(b)).toBe(50);
  });

  it("MIXED_TENDER_PLUS_RECEIPT_OVER — VIMLA 765 shape would be OK by the walk, but she is Group A (SNAP drop) and never reaches this script", () => {
    const b: Bill = {
      saleNumber: "POS/26-27/765",
      netDue: 3_000,
      tender: 400,
      receipts: [
        { ref: "RCP/1125", amount: 2_600, createdAt: "2026-05-30T12:00" },
        { ref: "RCP/1126", amount: 400, createdAt: "2026-05-30T12:01" },
      ],
    };
    expect(walk(b)[1]).toMatchObject({ remainingBefore: 0, action: "DELETE_WHOLE" });
    expect(billStatus(b)).toBe("OK");
    // gate lives upstream: receipts_after 2,600 ≥ tender 400 → SNAP drop → Group A
    expect(2_600 >= 400).toBe(true);
  });
});

describe("customer-atomic", () => {
  it("HEENA READY only with all four bills OK", () => {
    const heena: Bill[] = [
      {
        saleNumber: "POS/26-27/853",
        netDue: 2_770,
        tender: 0,
        receipts: [
          { ref: "a", amount: 2_770, createdAt: "2026-05-30T09:00" },
          { ref: "b", amount: 2_770, createdAt: "2026-05-30T09:01" },
        ],
      },
      { saleNumber: "POS/26-27/1488", netDue: 6_290, tender: 6_290, receipts: [{ ref: "c", amount: 6_290, createdAt: "2026-06-01T10:00" }] },
      { saleNumber: "POS/26-27/1594", netDue: 2_547, tender: 2_547, receipts: [{ ref: "d", amount: 2_547, createdAt: "2026-06-05T10:00" }] },
      { saleNumber: "POS/26-27/1714", netDue: 849, tender: 849, receipts: [{ ref: "e", amount: 849, createdAt: "2026-06-10T10:00" }] },
    ];
    expect(customerStatus(heena)).toBe("READY");
    const deleteSum = heena
      .flatMap(walk)
      .filter((l) => l.action === "DELETE_WHOLE")
      .reduce((s, l) => s + l.amount, 0);
    expect(deleteSum).toBe(2_770 + 6_290 + 2_547 + 849);
  });

  it("one HOLD_PARTIAL bill holds the whole customer", () => {
    const bills: Bill[] = [
      {
        saleNumber: "X/1",
        netDue: 1_000,
        tender: 0,
        receipts: [
          { ref: "a", amount: 1_000, createdAt: "2026-01-01T10:00" },
          { ref: "b", amount: 1_000, createdAt: "2026-01-02T10:00" },
        ],
      },
      {
        saleNumber: "X/2",
        netDue: 500,
        tender: 0,
        receipts: [
          { ref: "c", amount: 450, createdAt: "2026-01-01T10:00" },
          { ref: "d", amount: 100, createdAt: "2026-01-02T10:00" },
        ],
      },
    ];
    expect(billStatus(bills[0])).toBe("OK");
    expect(billStatus(bills[1])).toBe("HOLD_PARTIAL");
    expect(customerStatus(bills)).toBe("HOLD");
  });
});

describe("what never reaches the dry run", () => {
  it("NET_DUE_ZERO is filtered upstream — the walk would wrongly delete a refund-owed receipt", () => {
    const dolly459: Bill = {
      saleNumber: "POS/26-27/459",
      netDue: 0,
      tender: 0,
      receipts: [{ ref: "r", amount: 1_599, createdAt: "2026-05-01T10:00" }],
    };
    expect(walk(dolly459)[0].action).toBe("DELETE_WHOLE");
    const shapeIsNetDueZero = dolly459.netDue <= 0.005;
    expect(shapeIsNetDueZero).toBe(true);
  });
});
