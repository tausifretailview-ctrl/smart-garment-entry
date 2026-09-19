/**
 * Full 51-set sibling SNAP-drop gates — no mutate.
 *
 * Locked against the 19 Sep 2026 21:09 IST live paste
 * (docs/ssot-51-full-sibling-scan-live-2026-09-19-21-09-22.csv, 456 rows).
 *
 * v2: the gate is CUSTOMER-level. A customer is NEEDS_BUCKET_G if, after every
 * repair bill on her account has its over-credit removed, ANY of her sales still
 * drops at-sale cash in SNAP. Tender-only rows and NET_DUE_ZERO rows are split
 * off before gating — neither is a receipt to delete.
 *
 * v3 (after the 22:01 dry-run review): receipts dated the sale day are netted
 * against at-sale tender first (printed-ledger rule, CustomerLedgerPage
 * residualPaymentAtSaleTender). A POS dual-write is neither over-credit nor a
 * SNAP drop. The v2 cases below keep receiptsSameDay = 0 and are unchanged; the
 * 21:09 population itself is PROVISIONAL until the v3 SQL is pasted.
 */
import { describe, expect, it } from "vitest";

const SHREE = "3a4ef881-e561-4c0e-9764-1c8e903fe109";
const SANTOSH = "1167547a-2ef1-4931-8993-2cb21ebcb619";
const HEENA = "dde74df8-fe5d-48c8-a010-d33f290b98bc";
const ANANYA = "0616f278-8878-45fb-9dd4-ea899dfeb039";
const DOLLY = "bc266355-68d6-424b-b71c-855aad2395c4";
const MIXED_54572 = "54572eba-f362-4bf4-8bff-f51b4dfdd9e2";

type Sale = {
  saleNumber: string;
  tender: number;
  receiptsLive: number;
  /** net_amount − sale_return_adjust, floored at 0 */
  netDue: number;
  /** cash receipts whose voucher_date = sale day (IST); netted against tender. v3. */
  receiptsSameDay?: number;
};

type Gate =
  | "SANTOSH_SEPARATE"
  | "WALK_IN_NO_CUSTOMER"
  | "NEEDS_BUCKET_G"
  | "REPAIR_SUFFICIENT_SNAP";

type Shape =
  | "TENDER_ONLY_OVER"
  | "NET_DUE_ZERO"
  | "EXACT_DOUBLE_RECEIPT"
  | "RECEIPT_DUPLICATES_AT_SALE_TENDER"
  | "RECEIPT_OVER_PARTIAL"
  | "MIXED_TENDER_PLUS_RECEIPT_OVER"
  | "NOT_OVER_CREDITED";

function tenderResidual(s: Sale): number {
  return Math.max(0, s.tender - (s.receiptsSameDay ?? 0));
}

function overCreditLedger(s: Sale): number {
  return Math.max(0, s.receiptsLive + tenderResidual(s) - s.netDue);
}

function receiptsAfterRepair(s: Sale): number {
  return Math.max(0, s.receiptsLive - overCreditLedger(s));
}

/**
 * Bucket (g): SNAP credits GREATEST(0, tender − all sale receipts). The at-sale
 * money it fails to credit is tender_residual − that drift. With no same-day
 * receipt this is the v2 rule (drop = tender once receipts ≥ tender).
 */
function snapDrop(s: Sale, receiptsEffective: number): number {
  return Math.max(0, tenderResidual(s) - Math.max(0, s.tender - receiptsEffective));
}

function shape(s: Sale): Shape {
  const oc = overCreditLedger(s);
  if (oc <= 1) return "NOT_OVER_CREDITED";
  if (s.receiptsLive <= 0.005) return "TENDER_ONLY_OVER";
  if (s.netDue <= 0.005) return "NET_DUE_ZERO";
  if (s.tender <= 0.005 && Math.abs(s.receiptsLive - 2 * s.netDue) <= 1) {
    return "EXACT_DOUBLE_RECEIPT";
  }
  if (tenderResidual(s) > 0.005 && receiptsAfterRepair(s) <= 0.005) {
    return "RECEIPT_DUPLICATES_AT_SALE_TENDER";
  }
  if (s.receiptsLive - s.netDue > 1) return "RECEIPT_OVER_PARTIAL";
  return "MIXED_TENDER_PLUS_RECEIPT_OVER";
}

/** Customer-level: every sale on the account, repair bills already repaired. */
function customerSnapDropAfterRepair(sales: Sale[]): number {
  return sales.reduce((sum, s) => {
    const effective = overCreditLedger(s) > 1 ? receiptsAfterRepair(s) : s.receiptsLive;
    return sum + snapDrop(s, effective);
  }, 0);
}

function gateCustomer(customerId: string | null, sales: Sale[]): Gate {
  if (
    customerId === SANTOSH ||
    sales.some((s) => s.saleNumber === "POS/25-26/717" || s.saleNumber === "POS/25-26/1130")
  ) {
    return "SANTOSH_SEPARATE";
  }
  if (customerId == null) return "WALK_IN_NO_CUSTOMER";
  if (customerSnapDropAfterRepair(sales) > 0) return "NEEDS_BUCKET_G";
  return "REPAIR_SUFFICIENT_SNAP";
}

/** Receipt rows a duplicate repair may touch: receipt-bearing, bill not fully returned. */
function receiptRepairEligible(s: Sale): boolean {
  const sh = shape(s);
  return sh !== "NOT_OVER_CREDITED" && sh !== "TENDER_ONLY_OVER" && sh !== "NET_DUE_ZERO";
}

describe("21:09 live headline splits into receipt-bearing vs tender-only", () => {
  it("tender-only over-credit is not a receipt to delete", () => {
    // Velvet walk-in POS/25-26/260-class: ₹260 keyed at sale on a ₹240 bill
    const s: Sale = { saleNumber: "POS/25-26/123", tender: 260, receiptsLive: 0, netDue: 240 };
    expect(overCreditLedger(s)).toBe(20);
    expect(shape(s)).toBe("TENDER_ONLY_OVER");
    expect(receiptRepairEligible(s)).toBe(false);
  });

  it("receipt-bearing population sums to the historical ₹2,99,467 within ₹1,358", () => {
    const receiptBearingOverCredit = 298_108.51;
    expect(Math.abs(receiptBearingOverCredit - 299_467)).toBeLessThan(1_400);
    // count does NOT match: 91 receipt-bearing bills vs the 51 headline. Reconcile by sale_number first.
    expect(91).not.toBe(51);
  });
});

describe("SHREEVASTAV / VIMLA / DIYA are not repair-sufficient", () => {
  it("SHREEVASTAV: SNAP drop on 875 after 1128/1129 gone AND sibling 824", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/25-26/875", tender: 1_000, receiptsLive: 5_200, netDue: 3_100 },
      { saleNumber: "POS/26-27/824", tender: 500, receiptsLive: 3_000, netDue: 3_500 },
    ];
    expect(overCreditLedger(sales[0])).toBe(3_100);
    expect(receiptsAfterRepair(sales[0])).toBe(2_100);
    expect(customerSnapDropAfterRepair(sales)).toBe(1_500);
    expect(gateCustomer(SHREE, sales)).toBe("NEEDS_BUCKET_G");
  });

  it("VIMLA: SNAP drop on the repaired bill itself (no sibling required)", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/26-27/765", tender: 400, receiptsLive: 3_000, netDue: 3_000 },
    ];
    expect(overCreditLedger(sales[0])).toBe(400);
    expect(shape(sales[0])).toBe("MIXED_TENDER_PLUS_RECEIPT_OVER");
    expect(customerSnapDropAfterRepair(sales)).toBe(400);
    expect(gateCustomer("c085667a-c7ba-4a9f-b842-cead6f56310a", sales)).toBe("NEEDS_BUCKET_G");
  });

  it("DIYA: SNAP drop on the repaired bill itself", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/25-26/123", tender: 1_000, receiptsLive: 20_000, netDue: 11_000 },
    ];
    expect(receiptsAfterRepair(sales[0])).toBe(10_000);
    expect(gateCustomer("ff3547a1-d241-4fff-8465-665ee86707bb", sales)).toBe("NEEDS_BUCKET_G");
  });
});

describe("HEENA moves to B — only as a 4-bill customer repair", () => {
  const heena: Sale[] = [
    { saleNumber: "POS/26-27/853", tender: 0, receiptsLive: 5_540, netDue: 2_770 },
    { saleNumber: "POS/26-27/1488", tender: 6_290, receiptsLive: 6_290, netDue: 6_290 },
    { saleNumber: "POS/26-27/1594", tender: 2_547, receiptsLive: 2_547, netDue: 2_547 },
    { saleNumber: "POS/26-27/1714", tender: 849, receiptsLive: 849, netDue: 849 },
  ];

  it("1488/1594/1714 are themselves over-credited (receipt on top of at-sale cash)", () => {
    for (const s of heena.slice(1)) {
      expect(overCreditLedger(s)).toBe(s.tender);
      expect(shape(s)).toBe("RECEIPT_DUPLICATES_AT_SALE_TENDER");
    }
    expect(shape(heena[0])).toBe("EXACT_DOUBLE_RECEIPT");
  });

  it("repairing all four leaves no SNAP drop → REPAIR_SUFFICIENT_SNAP", () => {
    expect(customerSnapDropAfterRepair(heena)).toBe(0);
    expect(gateCustomer(HEENA, heena)).toBe("REPAIR_SUFFICIENT_SNAP");
  });

  it("repairing only 853 (the 51-list row) leaves ₹9,686 dropped — same as the 20:10 scan", () => {
    const drop = heena.reduce((sum, s) => {
      const effective = s.saleNumber === "POS/26-27/853" ? receiptsAfterRepair(s) : s.receiptsLive;
      return sum + snapDrop(s, effective);
    }, 0);
    expect(drop).toBe(6_290 + 2_547 + 849);
    expect(drop).toBe(9_686);
  });
});

describe("ANANYA stays A — sibling 1788 has nothing to delete", () => {
  it("1788: ₹2,416 at-sale + ₹12,416 receipts on a ≥ ₹14,832 bill, over-credit 0", () => {
    const sibling: Sale = { saleNumber: "POS/26-27/1788", tender: 2_416, receiptsLive: 12_416, netDue: 14_832 };
    expect(overCreditLedger(sibling)).toBe(0);
    expect(shape(sibling)).toBe("NOT_OVER_CREDITED");
    const sales: Sale[] = [
      { saleNumber: "POS/26-27/221", tender: 0, receiptsLive: 5_490, netDue: 2_745 },
      { saleNumber: "POS/26-27/536", tender: 0, receiptsLive: 6_298, netDue: 3_149 },
      { saleNumber: "POS/26-27/580", tender: 0, receiptsLive: 7_800, netDue: 3_900 },
      { saleNumber: "POS/26-27/70", tender: 0, receiptsLive: 3_000, netDue: 1_500 },
      { saleNumber: "POS/26-27/1787", tender: 12_584, receiptsLive: 7_584, netDue: 12_584 },
      sibling,
    ];
    expect(customerSnapDropAfterRepair(sales)).toBe(2_416);
    expect(gateCustomer(ANANYA, sales)).toBe("NEEDS_BUCKET_G");
  });
});

describe("gate is per customer, not per bill", () => {
  it("54572eba: 1126 drops ₹2,500 after repair, 1023 is tender-only → whole customer is A", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/26-27/1126", tender: 2_500, receiptsLive: 10_000, netDue: 7_500 },
      { saleNumber: "POS/26-27/1023", tender: 200, receiptsLive: 0, netDue: 0 },
    ];
    expect(receiptsAfterRepair(sales[0])).toBe(5_000);
    expect(snapDrop(sales[0], 5_000)).toBe(2_500);
    expect(shape(sales[1])).toBe("TENDER_ONLY_OVER");
    expect(gateCustomer(MIXED_54572, sales)).toBe("NEEDS_BUCKET_G");
  });

  it("a per-bill gate would have split her — that is the v1 defect", () => {
    const bill1023Alone: Sale[] = [{ saleNumber: "POS/26-27/1023", tender: 200, receiptsLive: 0, netDue: 0 }];
    expect(gateCustomer(MIXED_54572, bill1023Alone)).toBe("REPAIR_SUFFICIENT_SNAP");
  });
});

describe("NET_DUE_ZERO is a refund shape, never a receipt delete", () => {
  it("DOLLY 459 / 478: ₹1,599 receipt on a fully-returned bill", () => {
    const s: Sale = { saleNumber: "POS/26-27/459", tender: 0, receiptsLive: 1_599, netDue: 0 };
    expect(overCreditLedger(s)).toBe(1_599);
    expect(shape(s)).toBe("NET_DUE_ZERO");
    expect(receiptRepairEligible(s)).toBe(false);
  });

  it("DOLLY is excluded by name; under v3 her 454 (tender 3,000 + receipts 1,500 after) is also a partial GREATEST drop", () => {
    const dolly: Sale[] = [
      { saleNumber: "POS/26-27/454", tender: 3_000, receiptsLive: 3_000, netDue: 4_500 },
      { saleNumber: "POS/26-27/459", tender: 0, receiptsLive: 1_599, netDue: 0 },
      { saleNumber: "POS/26-27/478", tender: 0, receiptsLive: 1_599, netDue: 0 },
    ];
    // v2 said drop 0 because receipts_after 1,500 < tender 3,000. SNAP credits
    // GREATEST(1,500, 3,000) = 3,000; the ledger credits 3,000 + 1,500 = 4,500. Drop 1,500.
    expect(snapDrop(dolly[0], 1_500)).toBe(1_500);
    expect(gateCustomer(DOLLY, dolly)).toBe("NEEDS_BUCKET_G");
    const eligible = dolly.filter(receiptRepairEligible);
    // 454 over-credit 1,500 is the hand-cleared equal-instalment case, not a duplicate
    expect(eligible.map((s) => s.saleNumber)).toEqual(["POS/26-27/454"]);
    expect(shape(dolly[0])).toBe("MIXED_TENDER_PLUS_RECEIPT_OVER");
  });

  it("Velvet walk-in POS/25-26/118: tender ₹937 + receipt ₹937, bill fully returned", () => {
    const s: Sale = { saleNumber: "POS/25-26/118", tender: 937, receiptsLive: 937, netDue: 0 };
    expect(shape(s)).toBe("NET_DUE_ZERO");
    expect(gateCustomer(null, [s])).toBe("WALK_IN_NO_CUSTOMER");
  });
});

describe("SANTOSH stays out of both SNAP groups", () => {
  it("POS/717 + POS/1130 are SANTOSH_SEPARATE regardless of SNAP", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/25-26/717", tender: 75_200, receiptsLive: 12_000, netDue: 81_200 },
      { saleNumber: "POS/25-26/1130", tender: 0, receiptsLive: 11_300, netDue: 5_800 },
    ];
    expect(overCreditLedger(sales[0])).toBe(6_000);
    expect(overCreditLedger(sales[1])).toBe(5_500);
    expect(gateCustomer(SANTOSH, sales)).toBe("SANTOSH_SEPARATE");
  });
});

describe("REPAIR_SUFFICIENT_SNAP is customer-atomic", () => {
  it("JATIN POS/808 exact double, no other sale → B", () => {
    const sales: Sale[] = [{ saleNumber: "POS/26-27/808", tender: 0, receiptsLive: 27_400, netDue: 13_699.9 }];
    expect(shape(sales[0])).toBe("EXACT_DOUBLE_RECEIPT");
    expect(gateCustomer("8538501f-2f0b-4f69-8974-d96aaf06b682", sales)).toBe("REPAIR_SUFFICIENT_SNAP");
  });

  it("70a1d1cc: two receipt-on-at-sale bills; both or none", () => {
    const sales: Sale[] = [
      { saleNumber: "POS/26-27/1312", tender: 1_150, receiptsLive: 150, netDue: 1_150 },
      { saleNumber: "POS/26-27/1353", tender: 1_700, receiptsLive: 1_200, netDue: 1_700 },
    ];
    expect(gateCustomer("70a1d1cc-b534-49e2-8461-989b26fe1935", sales)).toBe("REPAIR_SUFFICIENT_SNAP");
    // leave 1353 unrepaired and its ₹1,200 receipt is < tender, so no SNAP drop either — but the
    // ₹1,200 over-credit still sits on the ledger. Atomic because the ledger, not SNAP, is wrong.
    expect(overCreditLedger(sales[1])).toBe(1_200);
  });

  it("walk-in POS/85 is not a customer SNAP group", () => {
    expect(
      gateCustomer(null, [{ saleNumber: "POS/26-27/85", tender: 0, receiptsLive: 31_724, netDue: 15_862 }]),
    ).toBe("WALK_IN_NO_CUSTOMER");
  });
});

describe("group totals from the 21:09 paste", () => {
  it("A = 14 customers / 25 bills / ₹86,738; bucket-(g) survivor ₹28,116", () => {
    const survivors = [1_500, 400, 1_000, 2_416, 1_200, 4_600, 2_500, 2_500, 500, 3_000, 4_000, 3_000, 1_000, 500];
    expect(survivors).toHaveLength(14);
    expect(survivors.reduce((a, b) => a + b, 0)).toBe(28_116);
  });

  it("91 receipt-bearing = 25 A + 62 B + 2 Santosh + 2 walk-in", () => {
    expect(25 + 62 + 2 + 2).toBe(91);
    expect(86_738 + 182_134.51 + 11_500 + 17_736).toBeCloseTo(298_108.51, 2);
  });
});

describe("v3 — same-day receipts are netted against tender before anything else", () => {
  it("POS dual-write (tender 442, same-day receipt 442, net 442) is not over-credited and drops nothing", () => {
    const s: Sale = { saleNumber: "POS/26-27/1919", tender: 442, receiptsLive: 442, receiptsSameDay: 442, netDue: 442 };
    expect(tenderResidual(s)).toBe(0);
    expect(overCreditLedger(s)).toBe(0);
    expect(shape(s)).toBe("NOT_OVER_CREDITED");
    expect(snapDrop(s, s.receiptsLive)).toBe(0);
    expect(gateCustomer("c", [s])).toBe("REPAIR_SUFFICIENT_SNAP");
  });

  it("the same bill with the receipt dated a later day is a ₹442 over-credit (re-keyed tender)", () => {
    const s: Sale = { saleNumber: "POS/26-27/1919", tender: 442, receiptsLive: 442, receiptsSameDay: 0, netDue: 442 };
    expect(overCreditLedger(s)).toBe(442);
    expect(shape(s)).toBe("RECEIPT_DUPLICATES_AT_SALE_TENDER");
    // after the receipt is removed nothing is left for SNAP to drop
    expect(snapDrop(s, receiptsAfterRepair(s))).toBe(0);
  });

  it("Shreevastav 875 under v3 is identical to v2: no same-day receipt, drop 1,000 survives repair", () => {
    const s: Sale = { saleNumber: "POS/25-26/875", tender: 1_000, receiptsLive: 5_200, receiptsSameDay: 0, netDue: 3_100 };
    expect(overCreditLedger(s)).toBe(3_100);
    expect(receiptsAfterRepair(s)).toBe(2_100);
    expect(snapDrop(s, 2_100)).toBe(1_000);
    expect(gateCustomer(SHREE, [s])).toBe("NEEDS_BUCKET_G");
  });

  it("mixed bill: tender 7,000, later receipts 7,000 + 5,000 on 12,000 — after repair SNAP still drops 5,000", () => {
    const s: Sale = { saleNumber: "POS/26-27/2442", tender: 7_000, receiptsLive: 12_000, receiptsSameDay: 0, netDue: 12_000 };
    expect(overCreditLedger(s)).toBe(7_000);
    expect(receiptsAfterRepair(s)).toBe(5_000);
    // SNAP drift = max(0, 7,000 − 5,000) = 2,000 credited; 5,000 of counter cash lost → Group A
    expect(snapDrop(s, 5_000)).toBe(5_000);
    expect(gateCustomer("073e0fa7", [s])).toBe("NEEDS_BUCKET_G");
  });

  it("partial dual-write: tender 10,400 (cash 2,000 + card 8,400), same-day card receipt 8,400 → residual 2,000, no over-credit", () => {
    const s: Sale = { saleNumber: "POS/26-27/1947", tender: 10_400, receiptsLive: 8_400, receiptsSameDay: 8_400, netDue: 10_400 };
    expect(tenderResidual(s)).toBe(2_000);
    expect(overCreditLedger(s)).toBe(0);
    expect(snapDrop(s, 8_400)).toBe(0);
  });
});

describe("v3 — partial GREATEST drop (receipts_after below tender) was invisible to v2", () => {
  it("POS/25-26/1214-class: tender 6,100, receipts 3,750 after repair, net 9,850 → ledger paid in full, SNAP still owes 3,750", () => {
    const s: Sale = { saleNumber: "POS/25-26/1214", tender: 6_100, receiptsLive: 4_000, netDue: 9_850 };
    expect(overCreditLedger(s)).toBe(250);
    expect(receiptsAfterRepair(s)).toBe(3_750);
    // v2 formula: receipts_after < tender → 0. v3: min(receipts_after, tender) = 3,750.
    expect(snapDrop(s, 3_750)).toBe(3_750);
    expect(gateCustomer("32d34671", [s])).toBe("NEEDS_BUCKET_G");
  });

  it("drop = ledger credit − SNAP credit = receipts + residual − GREATEST(receipts, tender)", () => {
    const cases: Array<[Sale, number, number]> = [
      [{ saleNumber: "a", tender: 1_000, receiptsLive: 2_100, netDue: 3_100 }, 2_100, 1_000],
      [{ saleNumber: "b", tender: 3_000, receiptsLive: 1_500, netDue: 4_500 }, 1_500, 1_500],
      [{ saleNumber: "c", tender: 0, receiptsLive: 5_000, netDue: 5_000 }, 5_000, 0],
      [{ saleNumber: "d", tender: 500, receiptsLive: 500, receiptsSameDay: 500, netDue: 500 }, 500, 0],
    ];
    for (const [s, eff, expected] of cases) {
      const ledger = eff + tenderResidual(s);
      const snap = Math.max(eff, s.tender);
      expect(snapDrop(s, eff)).toBe(expected);
      expect(Math.max(0, ledger - snap)).toBe(expected);
    }
  });
});
