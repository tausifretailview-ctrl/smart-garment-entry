import { describe, expect, it } from "vitest";
import {
  checkCreditLimit,
  dueDateFromCreditDays,
  parseCustomerCreditTermsInput,
  resolveIndustrialMode,
} from "./industrialMode";

describe("resolveIndustrialMode", () => {
  it("stays off unless both the platform feature and the shop switch are on", () => {
    expect(resolveIndustrialMode(false, { enabled: true }).enabled).toBe(false);
    expect(resolveIndustrialMode(true, { enabled: false }).enabled).toBe(false);
    expect(resolveIndustrialMode(true, undefined).enabled).toBe(false);
    expect(resolveIndustrialMode(true, { enabled: true })).toEqual({
      enabled: true,
      credit_limit_action: "warn",
      auto_due_date: true,
    });
  });

  it("reads block and auto due date off", () => {
    expect(
      resolveIndustrialMode(true, { enabled: true, credit_limit_action: "block", auto_due_date: false }),
    ).toEqual({ enabled: true, credit_limit_action: "block", auto_due_date: false });
  });
});

describe("parseCustomerCreditTermsInput", () => {
  it("turns blanks into nulls", () => {
    expect(
      parseCustomerCreditTermsInput({ credit_limit: "", credit_days: " ", contact_person: "", pan_number: "" }),
    ).toEqual({ credit_limit: null, credit_days: null, contact_person: null, pan_number: null });
  });

  it("parses amounts with commas, days and PAN", () => {
    expect(
      parseCustomerCreditTermsInput({
        credit_limit: "5,00,000",
        credit_days: "30",
        contact_person: " Mr Desai ",
        pan_number: "abcde1234f",
      }),
    ).toEqual({ credit_limit: 500000, credit_days: 30, contact_person: "Mr Desai", pan_number: "ABCDE1234F" });
  });

  it("rejects bad values", () => {
    const base = { credit_limit: "", credit_days: "", contact_person: "", pan_number: "" };
    expect(() => parseCustomerCreditTermsInput({ ...base, credit_limit: "-5" })).toThrow();
    expect(() => parseCustomerCreditTermsInput({ ...base, credit_days: "12.5" })).toThrow();
    expect(() => parseCustomerCreditTermsInput({ ...base, credit_days: "400" })).toThrow();
    expect(() => parseCustomerCreditTermsInput({ ...base, pan_number: "1234" })).toThrow();
  });
});

describe("dueDateFromCreditDays", () => {
  it("adds credit days across a month end", () => {
    const d = dueDateFromCreditDays(new Date(2026, 9, 20), 30);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 19]);
  });

  it("keeps the bill date when no credit days", () => {
    const d = dueDateFromCreditDays(new Date(2026, 10, 1, 15, 30), null);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 1]);
  });
});

describe("checkCreditLimit", () => {
  it("never flags a party without a limit", () => {
    const r = checkCreditLimit({ creditLimit: null, currentBalance: 900000, billAmount: 100000 });
    expect(r.exceeded).toBe(false);
    expect(r.hasLimit).toBe(false);
    expect(r.balanceAfter).toBe(1000000);
  });

  it("flags a credit bill that crosses the limit", () => {
    const r = checkCreditLimit({ creditLimit: 500000, currentBalance: 462000, billAmount: 94362 });
    expect(r).toMatchObject({ hasLimit: true, exceeded: true, overBy: 56362, availableBefore: 38000, balanceAfter: 556362 });
  });

  it("counts only the unpaid part of the bill", () => {
    const r = checkCreditLimit({ creditLimit: 500000, currentBalance: 462000, billAmount: 94362, paidNow: 94362 });
    expect(r.exceeded).toBe(false);
    expect(r.balanceAfter).toBe(462000);
  });

  it("does not double count the bill being edited", () => {
    // Balance 4,90,000 already holds this bill's saved ₹40,000; new amount ₹45,000.
    const r = checkCreditLimit({ creditLimit: 500000, currentBalance: 490000, billAmount: 45000, originalBillAmount: 40000 });
    expect(r.balanceAfter).toBe(495000);
    expect(r.exceeded).toBe(false);
  });

  it("ignores paise noise", () => {
    expect(checkCreditLimit({ creditLimit: 1000, currentBalance: 0, billAmount: 1000.4 }).exceeded).toBe(false);
  });
});
