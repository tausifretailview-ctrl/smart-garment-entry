import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Third-party Pay/Receive history + edit", () => {
  it("exposes a transaction history tab with edit and delete", () => {
    const src = readFileSync(join(here, "ThirdPartyVoucherEntry.tsx"), "utf8");
    expect(src).toContain("Transaction history");
    expect(src).toContain("Update voucher");
    expect(src).toContain("startEdit");
    expect(src).toContain("deleteJournalEntryByReference");
    expect(src).toContain("recordThirdPartyVoucherJournalEntry");
    expect(src).toContain("loadThirdPartyVoucherHistory");
    expect(src).toContain("THIRD_PARTY_JOURNAL_REFERENCE_TYPE");
    expect(src).toContain("deleted_at");
    expect(src).not.toContain("recomputeSalePaymentState");
    expect(src).not.toContain("computeCustomerOutstanding");
  });
});
