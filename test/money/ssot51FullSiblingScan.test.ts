/**
 * Full 51-set sibling SNAP-drop gates — no mutate.
 *
 * SHREEVASTAV / VIMLA / DIYA are NEEDS_BUCKET_G (drop on the repaired bill),
 * not “duplicate delete is enough.” SANTOSH stays out of both SNAP groups.
 */
import { describe, expect, it } from "vitest";

const SHREE = "3a4ef881-e561-4c0e-9764-1c8e903fe109";
const SANTOSH = "1167547a-2ef1-4931-8993-2cb21ebcb619";

function snapDrop(tender: number, receiptsEffective: number): number {
  return tender > 0.005 && receiptsEffective >= tender ? tender : 0;
}

function gate(opts: {
  customerId: string | null;
  saleNumber: string;
  snapDropSelf: number;
  siblingSnapDrop: number;
}): "SANTOSH_SEPARATE" | "WALK_IN_NO_CUSTOMER" | "NEEDS_BUCKET_G" | "REPAIR_SUFFICIENT_SNAP" {
  if (
    opts.customerId === SANTOSH ||
    opts.saleNumber === "POS/25-26/717" ||
    opts.saleNumber === "POS/25-26/1130"
  ) {
    return "SANTOSH_SEPARATE";
  }
  if (opts.customerId == null) return "WALK_IN_NO_CUSTOMER";
  if (opts.snapDropSelf > 0 || opts.siblingSnapDrop > 0) return "NEEDS_BUCKET_G";
  return "REPAIR_SUFFICIENT_SNAP";
}

describe("SHREEVASTAV / VIMLA / DIYA are not repair-sufficient", () => {
  it("SHREEVASTAV: SNAP drop on 875 after 1128/1129 gone AND sibling 824", () => {
    const self = snapDrop(1_000, 2_100);
    const sibling = snapDrop(500, 3_000);
    expect(self).toBe(1_000);
    expect(sibling).toBe(500);
    expect(
      gate({
        customerId: SHREE,
        saleNumber: "POS/25-26/875",
        snapDropSelf: self,
        siblingSnapDrop: sibling,
      }),
    ).toBe("NEEDS_BUCKET_G");
  });

  it("VIMLA: SNAP drop on the repaired bill itself (no sibling required)", () => {
    const self = snapDrop(400, 2_600);
    expect(self).toBe(400);
    expect(
      gate({
        customerId: "c085667a-c7ba-4a9f-b842-cead6f56310a",
        saleNumber: "POS/26-27/765",
        snapDropSelf: self,
        siblingSnapDrop: 0,
      }),
    ).toBe("NEEDS_BUCKET_G");
  });

  it("DIYA: SNAP drop on the repaired bill itself", () => {
    expect(
      gate({
        customerId: "ff3547a1-d241-4fff-8465-665ee86707bb",
        saleNumber: "POS/25-26/123",
        snapDropSelf: snapDrop(1_000, 10_000),
        siblingSnapDrop: 0,
      }),
    ).toBe("NEEDS_BUCKET_G");
  });
});

describe("HEENA / ANANYA — tender-0 repair bill, sibling SNAP-drop", () => {
  it("HEENA 853 self drop 0; siblings 1488+1594+1714 = ₹9,686", () => {
    expect(snapDrop(0, 2_770)).toBe(0);
    const siblings = 6_290 + 2_547 + 849;
    expect(siblings).toBe(9_686);
    expect(
      gate({
        customerId: "dde74df8-fe5d-48c8-a010-d33f290b98bc",
        saleNumber: "POS/26-27/853",
        snapDropSelf: 0,
        siblingSnapDrop: siblings,
      }),
    ).toBe("NEEDS_BUCKET_G");
  });

  it("ANANYA four tender-0 dups; sibling 1788 ₹2,416", () => {
    expect(
      gate({
        customerId: "0616f278-8878-45fb-9dd4-ea899dfeb039",
        saleNumber: "POS/26-27/221",
        snapDropSelf: 0,
        siblingSnapDrop: 2_416,
      }),
    ).toBe("NEEDS_BUCKET_G");
  });
});

describe("SANTOSH stays out of both SNAP groups", () => {
  it("POS/717 is SANTOSH_SEPARATE even if SNAP captures at-sale on that bill", () => {
    expect(snapDrop(75_200, 6_000)).toBe(0);
    expect(
      gate({
        customerId: SANTOSH,
        saleNumber: "POS/25-26/717",
        snapDropSelf: 0,
        siblingSnapDrop: 0,
      }),
    ).toBe("SANTOSH_SEPARATE");
  });

  it("POS/1130 1131-1 leftover-overpay is SANTOSH_SEPARATE, not NEEDS_BUCKET_G", () => {
    expect(
      gate({
        customerId: SANTOSH,
        saleNumber: "POS/25-26/1130",
        snapDropSelf: 0,
        siblingSnapDrop: 9_999,
      }),
    ).toBe("SANTOSH_SEPARATE");
  });
});

describe("REPAIR_SUFFICIENT_SNAP is only no-self and no-sibling drop", () => {
  it("JATIN tender-0 full-net dup with no sibling SNAP-drop", () => {
    expect(
      gate({
        customerId: "8538501f-2f0b-4f69-8974-d96aaf06b682",
        saleNumber: "POS/26-27/808",
        snapDropSelf: 0,
        siblingSnapDrop: 0,
      }),
    ).toBe("REPAIR_SUFFICIENT_SNAP");
  });

  it("walk-in POS/85 is not a customer SNAP group", () => {
    expect(
      gate({
        customerId: null,
        saleNumber: "POS/26-27/85",
        snapDropSelf: 0,
        siblingSnapDrop: 0,
      }),
    ).toBe("WALK_IN_NO_CUSTOMER");
  });
});
