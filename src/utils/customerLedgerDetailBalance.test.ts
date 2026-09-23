import { describe, expect, it } from "vitest";
import {
  customerLedgerDetailNetPosition,
  customerLedgerDetailUnusedAdvance,
} from "@/utils/customerLedgerDetailBalance";

describe("customerLedgerDetailUnusedAdvance", () => {
  it("uses hook advance for retail when loaded (ignores stale list CN-memo phantom)", () => {
    expect(
      customerLedgerDetailUnusedAdvance({
        isSchool: false,
        balanceHookLoading: false,
        hookUnusedAdvance: 0,
        listUnusedAdvance: 2000,
      }),
    ).toBe(0);
  });

  it("does not trust list advance while hook is loading", () => {
    expect(
      customerLedgerDetailUnusedAdvance({
        isSchool: false,
        balanceHookLoading: true,
        hookUnusedAdvance: 2000,
        listUnusedAdvance: 2000,
      }),
    ).toBe(0);
  });

  it("keeps school list advance", () => {
    expect(
      customerLedgerDetailUnusedAdvance({
        isSchool: true,
        balanceHookLoading: false,
        hookUnusedAdvance: 0,
        listUnusedAdvance: 500,
      }),
    ).toBe(500);
  });
});

describe("customerLedgerDetailNetPosition", () => {
  it("uses hook net for retail when loaded (ZIBA: −700 Cr, not list-derived −2000)", () => {
    expect(
      customerLedgerDetailNetPosition({
        isSchool: false,
        balanceHookLoading: false,
        hookNetPosition: -700,
        invoiceOutstanding: 0,
        detailUnusedAdvance: 0,
      }),
    ).toBe(-700);
  });
});
