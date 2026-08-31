import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

function extractUtilRetailBody(utilSrc: string): string {
  const startMarker = "  // First, get ALL sales for this customer (without date filter) to get all possible reference_ids\n";
  const start = utilSrc.indexOf(startMarker);
  if (start < 0) throw new Error("extracted module is missing the retail body start marker");
  const endMarker = "  return cleanedTransactions;\n";
  const end = utilSrc.indexOf(endMarker, start);
  if (end < 0) throw new Error("extracted module is missing return cleanedTransactions");
  return utilSrc.slice(start, end + endMarker.length);
}

function reverseExtractSubstitutions(body: string): string {
  return body
    .replaceAll("CustomerLedgerTransaction[]", "Transaction[]")
    .replaceAll("customerOpeningBalance", "selectedCustomer.opening_balance")
    .replaceAll("customerId", "selectedCustomer.id");
}

function indent4(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.length ? `    ${line}` : line))
    .join("\n");
}

describe("customer ledger retail extract — source identity", () => {
  it("extracted body is a mechanical identifier swap of the frozen golden queryFn", () => {
    const golden = readFileSync(
      resolve(ROOT, "test/fixtures/customer-ledger-retail-queryfn.golden.txt"),
      "utf8",
    );
    const utilSrc = readFileSync(
      resolve(ROOT, "src/utils/customerLedgerTransactions.ts"),
      "utf8",
    );
    const restored = indent4(reverseExtractSubstitutions(extractUtilRetailBody(utilSrc)));
    expect(restored).toBe(golden);
  });

  it("CustomerLedger retail branch calls the extracted function and no longer inlines allCustomerSales", () => {
    const src = readFileSync(resolve(ROOT, "src/components/CustomerLedger.tsx"), "utf8");
    expect(src).toContain("fetchCustomerLedgerTransactions(");
    expect(src).toContain("if (isSchool && selectedCustomer.studentId)");
    expect(src).not.toContain("get ALL sales for this customer (without date filter)");
  });

  it("frozen dual-run inline still uses selectedCustomer.id (desktop shape)", () => {
    const src = readFileSync(
      resolve(ROOT, "scripts/lib/customerLedgerRetailInline.generated.ts"),
      "utf8",
    );
    expect(src).toContain("selectedCustomer.id");
    expect(src).toContain("selectedCustomer.opening_balance");
    expect(src).not.toContain("customerOpeningBalance");
  });
});
