import { describe, expect, it } from "vitest";
import {
  filterCashBankAccounts,
  filterThirdPartyMasters,
  isCashOrBankLedger,
  isThirdPartyMasterAccount,
  TALLY_GROUPS_BY_ACCOUNT_TYPE,
} from "./thirdPartyAccounts";
import type { SeededAccount } from "./seedDefaultAccounts";

const acc = (partial: Partial<SeededAccount> & Pick<SeededAccount, "account_code" | "account_name">): SeededAccount => ({
  id: partial.id || partial.account_code,
  organization_id: "org",
  account_type: partial.account_type || "Asset",
  account_group: partial.account_group ?? null,
  parent_account_id: null,
  is_system_account: partial.is_system_account ?? false,
  ...partial,
});

describe("thirdPartyAccounts", () => {
  it("includes Sundry Debtors/Creditors in create-master group lists", () => {
    expect(TALLY_GROUPS_BY_ACCOUNT_TYPE.Asset).toContain("Sundry Debtors");
    expect(TALLY_GROUPS_BY_ACCOUNT_TYPE.Liability).toContain("Sundry Creditors");
  });

  it("treats 1000/1010 as cash/bank and excludes them from party masters", () => {
    const cash = acc({
      account_code: "1000",
      account_name: "Cash in Hand",
      account_group: "Current Assets",
      is_system_account: true,
    });
    const landlord = acc({
      account_code: "9101",
      account_name: "Landlord Deposit",
      account_type: "Asset",
      account_group: "Sundry Debtors",
      is_system_account: false,
    });
    expect(isCashOrBankLedger(cash)).toBe(true);
    expect(isThirdPartyMasterAccount(cash)).toBe(false);
    expect(isThirdPartyMasterAccount(landlord)).toBe(true);
  });

  it("filters party vs cash/bank lists", () => {
    const accounts = [
      acc({
        account_code: "1000",
        account_name: "Cash in Hand",
        account_group: "Current Assets",
        is_system_account: true,
      }),
      acc({
        account_code: "1200",
        account_name: "Accounts Receivable",
        account_group: "Sundry Debtors",
        is_system_account: true,
      }),
      acc({
        account_code: "9102",
        account_name: "Loan from Uncle",
        account_type: "Liability",
        account_group: "Sundry Creditors",
      }),
      acc({
        account_code: "9105",
        account_name: "Investment Party",
        account_type: "Asset",
        account_group: "Investments",
        is_system_account: false,
      }),
    ];
    expect(filterCashBankAccounts(accounts).map((a) => a.account_code)).toEqual(["1000"]);
    expect(filterThirdPartyMasters(accounts).map((a) => a.account_code)).toEqual(["9102", "9105"]);
  });
});
