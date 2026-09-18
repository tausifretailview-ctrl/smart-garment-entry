/**
 * Live 3a undercount group (18 Sep 2026 population paste).
 * Same last-write / full-SRA remaining bug as MASEERA INV/3123.
 * Per-SR nets were not in the paste — lock the pool leftover and the helper,
 * not invented line splits.
 */
import { describe, expect, it } from "vitest";
import {
  allocateCnAdjustmentsToSaleReturns,
  saleReturnConsumedForRemaining,
  saleReturnRemainingCredit,
} from "@/utils/customerLedgerSaleReturnBalance";
import { fetchSharedSraLaterLeftoverLedger } from "../helpers/maseeraLedgerFixture";

const UNDERCOUNT = [
  {
    customer: "MASEERA",
    saleNumber: "INV/26-27/3123",
    sra: 10_700,
    srNetSum: 23_250,
    voucherSum: 10_700, // RCP/4838 1000 + RCP/4839 9700
    laterNetKnown: 13_850,
    allocatedToLaterKnown: 9_700,
  },
  {
    customer: "DR.SADAF GODIL",
    saleNumber: "INV/26-27/2988",
    sra: 3_800,
    srNetSum: 6_500,
    voucherSum: 1_100 + 2_700, // RCP/4562 + RCP/4563
  },
  {
    customer: "AMRIN BAIG",
    saleNumber: "INV/26-27/1324",
    sra: 3_450,
    srNetSum: 5_400,
    voucherSum: 1_500 + 1_950, // RCP/2401 + RCP/2402
  },
  {
    customer: "Shaista Arif Reshmawala",
    saleNumber: "INV/26-27/2676",
    sra: 12_750,
    srNetSum: 13_000,
    voucherSum: null as number | null, // not in 2b (same-calendar-day apply)
  },
] as const;

function poolLeftover(sra: number, srNetSum: number): number {
  return srNetSum - sra;
}

function remainingIfLaterChargedFullSra(laterNet: number, sra: number): number {
  return saleReturnRemainingCredit({
    grossNetAmount: laterNet,
    consumedAmount: saleReturnConsumedForRemaining({
      allocatedAmount: 0,
      absorbedOnLinkedInvoice: sra,
    }),
  });
}

function remainingIfLaterUsesAllocated(
  laterNet: number,
  allocatedToLater: number,
  sra: number,
): number {
  return saleReturnRemainingCredit({
    grossNetAmount: laterNet,
    consumedAmount: saleReturnConsumedForRemaining({
      allocatedAmount: allocatedToLater,
      absorbedOnLinkedInvoice: sra,
      linkedSaleCnVoucherTotal: sra,
    }),
  });
}

describe("undercount group — 3a live invariants", () => {
  it("CN vouchers on the shared invoice sum to SRA (where 2b listed them)", () => {
    for (const row of UNDERCOUNT) {
      if (row.voucherSum == null) continue;
      expect(row.voucherSum, row.customer).toBe(row.sra);
    }
  });

  it("pool leftover is sr_net_sum − SRA", () => {
    expect(poolLeftover(10_700, 23_250)).toBe(12_550);
    expect(poolLeftover(3_800, 6_500)).toBe(2_700);
    expect(poolLeftover(3_450, 5_400)).toBe(1_950);
    expect(poolLeftover(12_750, 13_000)).toBe(250);
  });
});

describe("undercount group — allocated remaining, not full linked SRA", () => {
  it("MASEERA later row: allocated leftover ₹4,150, full-SRA leftover ₹3,150", () => {
    const m = UNDERCOUNT[0];
    expect(
      remainingIfLaterUsesAllocated(m.laterNetKnown, m.allocatedToLaterKnown, m.sra),
    ).toBe(4_150);
    expect(remainingIfLaterChargedFullSra(m.laterNetKnown, m.sra)).toBe(3_150);
  });

  it.each(
    UNDERCOUNT.filter((r) => r.customer !== "MASEERA").map((row) => [
      row.customer,
      row.sra,
      row.srNetSum,
    ]),
  )(
    "%s: any FIFO split, charging the later SR the full SRA undercounts by the earlier slice",
    (customer, sra, srNetSum) => {
      const splits = [
        [Math.min(sra, 1_000), srNetSum - Math.min(sra, 1_000)],
        [Math.min(sra, Math.floor(srNetSum / 2)), srNetSum - Math.min(sra, Math.floor(srNetSum / 2))],
        [sra, srNetSum - sra],
      ].filter(([, later]) => later > 0);

      expect(splits.length, String(customer)).toBeGreaterThan(0);

      for (const [earlierNet, laterNet] of splits) {
        const map = allocateCnAdjustmentsToSaleReturns(
          [
            {
              id: "sr-earlier",
              net_amount: earlierNet,
              linked_sale_id: "inv-shared",
              return_date: "2026-01-01",
            },
            {
              id: "sr-later",
              net_amount: laterNet,
              linked_sale_id: "inv-shared",
              return_date: "2026-01-02",
            },
          ],
          { "inv-shared": sra },
        );
        const allocatedLater = map["sr-later"]?.applied || 0;
        const allocatedEarlier = map["sr-earlier"]?.applied || 0;
        expect(allocatedEarlier + allocatedLater).toBe(sra);

        const correctLater = remainingIfLaterUsesAllocated(laterNet, allocatedLater, sra);
        const buggyLater = remainingIfLaterChargedFullSra(laterNet, sra);
        const earlierRemaining = saleReturnRemainingCredit({
          grossNetAmount: earlierNet,
          consumedAmount: allocatedEarlier,
        });

        expect(correctLater + earlierRemaining).toBe(poolLeftover(sra, srNetSum));
        if (allocatedEarlier > 0.005 && laterNet <= sra) {
          expect(buggyLater).toBeLessThan(correctLater);
        }
      }
    },
  );
});

describe("undercount group — ledger fetch (worst-case split, live nets unknown)", () => {
  const cases = [
    {
      customer: "c-sadaf-undercount",
      label: "DR.SADAF GODIL",
      saleId: "inv-2988-uc",
      saleNumber: "INV/26-27/2988",
      sra: 3_800,
      laterNet: 2_700,
    },
    {
      customer: "c-amrin-undercount",
      label: "AMRIN BAIG",
      saleId: "inv-1324-uc",
      saleNumber: "INV/26-27/1324",
      sra: 3_450,
      laterNet: 1_950,
    },
    {
      customer: "c-shaista-undercount",
      label: "Shaista Arif Reshmawala",
      saleId: "inv-2676-uc",
      saleNumber: "INV/26-27/2676",
      sra: 12_750,
      laterNet: 250,
    },
  ] as const;

  it.each(cases)(
    "$label later SR keeps pool leftover, not full-SRA remaining 0",
    async (row) => {
      const rows = await fetchSharedSraLaterLeftoverLedger({
        org: `org-${row.customer}`,
        customer: row.customer,
        saleId: row.saleId,
        saleNumber: row.saleNumber,
        sra: row.sra,
        earlierNet: row.sra,
        laterNet: row.laterNet,
      });
      const later = rows.find(
        (r) => r.reference === `SR-LATER-${row.saleNumber}` && r.type === "return",
      );
      const earlier = rows.find(
        (r) => r.reference === `SR-EARLIER-${row.saleNumber}` && r.type === "return",
      );
      expect(earlier?.informational).toBe(true);
      expect(earlier?.credit).toBe(0);
      expect(later?.informational).not.toBe(true);
      expect(later?.credit).toBe(row.laterNet);
      const cnAdj = rows.find((r) => r.type === "cn_adjusted");
      expect(cnAdj?.date).toBe("2026-09-06");
      expect(cnAdj?.date).not.toBe("2026-09-01");
    },
  );
});
