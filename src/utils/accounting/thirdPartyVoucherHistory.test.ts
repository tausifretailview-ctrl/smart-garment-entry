import { describe, expect, it, vi } from "vitest";
import {
  buildThirdPartyVoucherDescription,
  directionFromVoucherType,
  formatThirdPartyPaymentMethod,
  inferCashBankAccountIdFromJournalLines,
  loadThirdPartyJournalCashBankAccountId,
  loadThirdPartyVoucherHistory,
  parseThirdPartyNarration,
} from "./thirdPartyVoucherHistory";
import { THIRD_PARTY_JOURNAL_REFERENCE_TYPE, THIRD_PARTY_VOUCHER_REFERENCE_TYPE } from "./thirdPartyVoucherCash";

describe("thirdPartyVoucherHistory", () => {
  it("maps voucher_type to direction", () => {
    expect(directionFromVoucherType("receipt")).toBe("received");
    expect(directionFromVoucherType("RECEIPT")).toBe("received");
    expect(directionFromVoucherType("payment")).toBe("paid_out");
    expect(directionFromVoucherType("")).toBe("paid_out");
    expect(directionFromVoucherType(null)).toBe("paid_out");
  });

  it("round-trips description / narration", () => {
    const paid = buildThirdPartyVoucherDescription("paid_out", "Landlord", "Sept rent");
    expect(paid).toBe("Third-party Paid: Landlord — Sept rent");
    expect(parseThirdPartyNarration(paid)).toBe("Sept rent");

    const received = buildThirdPartyVoucherDescription("received", "Deposit A/c", "refund");
    expect(received).toBe("Third-party Received: Deposit A/c — refund");
    expect(parseThirdPartyNarration(received)).toBe("refund");
  });

  it("keeps full description when it is not the post template", () => {
    expect(parseThirdPartyNarration("Manual note")).toBe("Manual note");
    expect(parseThirdPartyNarration("")).toBe("");
    expect(parseThirdPartyNarration(null)).toBe("");
  });

  it("caps description at 500 characters", () => {
    const long = "x".repeat(600);
    expect(buildThirdPartyVoucherDescription("paid_out", "Party", long).length).toBe(500);
  });

  it("picks the non-party journal line as cash/bank", () => {
    expect(
      inferCashBankAccountIdFromJournalLines(
        [{ account_id: "party-1" }, { account_id: "cash-1000" }],
        "party-1",
      ),
    ).toBe("cash-1000");
    expect(inferCashBankAccountIdFromJournalLines([{ account_id: "party-1" }], "party-1")).toBe(null);
    expect(inferCashBankAccountIdFromJournalLines([], "party-1")).toBe(null);
  });

  it("formats payment_method for history display", () => {
    expect(formatThirdPartyPaymentMethod("cash")).toBe("Cash");
    expect(formatThirdPartyPaymentMethod("bank_transfer")).toBe("Bank");
    expect(formatThirdPartyPaymentMethod("upi")).toBe("UPI");
    expect(formatThirdPartyPaymentMethod(null)).toBe("Cash");
  });
});

describe("loadThirdPartyVoucherHistory", () => {
  it("scopes voucher_entries by org, third_party reference, and deleted_at", async () => {
    const chain: Record<string, any> = {};
    const terminal = Promise.resolve({
      data: [
        {
          id: "v1",
          voucher_number: "PAY/26-27/1",
          voucher_date: "2026-09-09",
          voucher_type: "payment",
          total_amount: 100,
          payment_method: "cash",
          description: "Third-party Paid: Landlord — rent",
          reference_id: "party-1",
        },
      ],
      error: null,
    });
    for (const name of [
      "select",
      "eq",
      "is",
      "order",
      "range",
    ]) {
      chain[name] = vi.fn(() => chain);
    }
    chain.range = vi.fn(() => terminal);

    const client = { from: vi.fn(() => chain) };
    const rows = await loadThirdPartyVoucherHistory("org-1", client);

    expect(client.from).toHaveBeenCalledWith("voucher_entries");
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(chain.eq).toHaveBeenCalledWith("reference_type", THIRD_PARTY_VOUCHER_REFERENCE_TYPE);
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(rows).toHaveLength(1);
    expect(rows[0].voucher_number).toBe("PAY/26-27/1");
  });
});

describe("loadThirdPartyJournalCashBankAccountId", () => {
  it("loads journal by org + ThirdPartyVoucher + voucher id, then non-party line", async () => {
    const jeChain: Record<string, any> = {};
    jeChain.select = vi.fn(() => jeChain);
    jeChain.eq = vi.fn(() => jeChain);
    jeChain.maybeSingle = vi.fn(async () => ({ data: { id: "je-1" }, error: null }));

    const lineChain: Record<string, any> = {};
    lineChain.select = vi.fn(() => lineChain);
    lineChain.eq = vi.fn(async () => ({
      data: [{ account_id: "party-1" }, { account_id: "bank-1010" }],
      error: null,
    }));

    const client = {
      from: vi.fn((table: string) => (table === "journal_entries" ? jeChain : lineChain)),
    };

    const cashId = await loadThirdPartyJournalCashBankAccountId("org-1", "voucher-9", "party-1", client);
    expect(client.from).toHaveBeenCalledWith("journal_entries");
    expect(jeChain.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(jeChain.eq).toHaveBeenCalledWith("reference_type", THIRD_PARTY_JOURNAL_REFERENCE_TYPE);
    expect(jeChain.eq).toHaveBeenCalledWith("reference_id", "voucher-9");
    expect(cashId).toBe("bank-1010");
  });
});
