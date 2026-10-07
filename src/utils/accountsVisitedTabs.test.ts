import { describe, expect, it } from "vitest";
import { accountsTabShowsAdminFooter, withSelectedAccountsTab } from "./accountsVisitedTabs";

describe("withSelectedAccountsTab", () => {
  it("mounts a restored voucher entry tab that was never clicked", () => {
    const visited = new Set<string>();
    const next = withSelectedAccountsTab(visited, "voucher-entry");
    expect(next.has("voucher-entry")).toBe(true);
  });

  it("leaves customer ledger for the heavy-query gate", () => {
    const visited = new Set<string>();
    expect(withSelectedAccountsTab(visited, "customer-ledger")).toBe(visited);
  });

  it("keeps the same set when the tab is already mounted", () => {
    const visited = new Set(["voucher-entry"]);
    expect(withSelectedAccountsTab(visited, "voucher-entry")).toBe(visited);
  });
});

describe("accountsTabShowsAdminFooter", () => {
  it("hides Summary & admin settings on Voucher Entry", () => {
    expect(accountsTabShowsAdminFooter("voucher-entry")).toBe(false);
  });

  it("keeps the section on the other accounts tabs", () => {
    expect(accountsTabShowsAdminFooter("customer-ledger")).toBe(true);
    expect(accountsTabShowsAdminFooter("expenses")).toBe(true);
    expect(accountsTabShowsAdminFooter("reconciliation")).toBe(true);
  });

  it("still hides it on the payment tabs", () => {
    expect(accountsTabShowsAdminFooter("customer-payment")).toBe(false);
    expect(accountsTabShowsAdminFooter("supplier-payment")).toBe(false);
  });
});