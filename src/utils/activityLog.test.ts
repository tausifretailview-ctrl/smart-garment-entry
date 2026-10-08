import { describe, expect, it } from "vitest";
import {
  activityChangeSummary,
  activityDocumentNumber,
  activityRowsToCsv,
  describeActivity,
  diffActivityValues,
  getActivityCategory,
  isAutoUpdateAfterSave,
  isDiscountChange,
  matchesActivityCategory,
  type ActivityLogRow,
} from "./activityLog";

function row(partial: Partial<ActivityLogRow>): ActivityLogRow {
  return {
    id: "1",
    created_at: "2026-10-08T10:00:00Z",
    user_id: "u1",
    user_email: "cashier@shop.in",
    action: "SALE_UPDATED",
    entity_type: "sale",
    entity_id: "s1",
    old_values: null,
    new_values: null,
    metadata: null,
    ...partial,
  };
}

describe("describeActivity", () => {
  it("names payments by voucher type", () => {
    expect(
      describeActivity(row({ action: "PAYMENT_RECORDED", entity_type: "voucher", metadata: { voucher_type: "receipt" } })).label,
    ).toBe("Receipt recorded");
    expect(
      describeActivity(row({ action: "PAYMENT_DELETED", entity_type: "voucher", old_values: { voucher_type: "expense" } })),
    ).toEqual({ label: "Expense deleted", tone: "delete" });
  });

  it("labels deletes, cancels and discounts", () => {
    expect(describeActivity(row({ action: "SALE_DELETED" })).label).toBe("Invoice deleted");
    expect(describeActivity(row({ action: "SALE_CANCELLED" })).label).toBe("Invoice cancelled");
    expect(describeActivity(row({ action: "DISCOUNT_GIVEN" })).label).toBe("Discount given");
  });

  it("marks updates written right after save as payment updates, not edits", () => {
    const auto = row({ metadata: { seconds_since_created: 2 } });
    expect(isAutoUpdateAfterSave(auto)).toBe(true);
    expect(describeActivity(auto).label).toBe("Invoice saved (payment update)");
    const edit = row({ metadata: { seconds_since_created: 3600 } });
    expect(isAutoUpdateAfterSave(edit)).toBe(false);
    expect(describeActivity(edit).label).toBe("Invoice edited");
    expect(isAutoUpdateAfterSave(row({ metadata: null }))).toBe(false);
  });
});

describe("diffActivityValues", () => {
  it("lists changed fields first with formatted money", () => {
    const diff = diffActivityValues(
      { sale_number: "POS/1", net_amount: "1000", flat_discount_amount: 0 },
      { sale_number: "POS/1", net_amount: 900, flat_discount_amount: 100 },
    );
    expect(diff.map((d) => d.key)).toEqual(["net_amount", "flat_discount_amount", "sale_number"]);
    expect(diff[0]).toMatchObject({ before: "₹1,000.00", after: "₹900.00", changed: true });
    expect(diff[2].changed).toBe(false);
  });

  it("treats 100 and 100.00 as unchanged", () => {
    const diff = diffActivityValues({ net_amount: 100 }, { net_amount: "100.00" });
    expect(diff[0].changed).toBe(false);
  });

  it("shows created rows with only after values", () => {
    const diff = diffActivityValues(null, { total_amount: 500 });
    expect(diff[0]).toMatchObject({ before: "—", after: "₹500.00", changed: false });
  });
});

describe("discount filter", () => {
  it("keeps DISCOUNT_GIVEN and edits that changed a discount", () => {
    expect(isDiscountChange(row({ action: "DISCOUNT_GIVEN" }))).toBe(true);
    expect(
      isDiscountChange(row({ old_values: { discount_amount: 0 }, new_values: { discount_amount: 50 } })),
    ).toBe(true);
    const payOnly = row({ old_values: { paid_amount: 0, discount_amount: 10 }, new_values: { paid_amount: 90, discount_amount: 10 } });
    expect(isDiscountChange(payOnly)).toBe(false);
    expect(matchesActivityCategory(payOnly, "discounts")).toBe(false);
    expect(matchesActivityCategory(payOnly, "invoice_edits")).toBe(true);
  });

  it("falls back to all activity for an unknown category", () => {
    expect(getActivityCategory("nope").id).toBe("all");
  });
});

describe("summary and CSV", () => {
  it("summarises changes and the document number", () => {
    const r = row({
      old_values: { sale_number: "POS/7", net_amount: 500, payment_status: "pending" },
      new_values: { sale_number: "POS/7", net_amount: 450, payment_status: "completed" },
    });
    expect(activityDocumentNumber(r)).toBe("POS/7");
    expect(activityChangeSummary(r)).toBe("Net amount: ₹500.00 → ₹450.00 · Payment status: pending → completed");
  });

  it("quotes CSV cells with commas", () => {
    const csv = activityRowsToCsv(
      [row({ action: "DISCOUNT_GIVEN", new_values: { sale_number: "POS/1", customer_name: "Khan, A", net_amount: 10 } })],
      () => "08/10/2026 15:30",
    );
    const [header, line] = csv.split("\n");
    expect(header).toBe("Date & time,Operator,Activity,Document,Party,Amount,Changes");
    expect(line).toBe('08/10/2026 15:30,cashier@shop.in,Discount given,POS/1,"Khan, A",10.00,');
  });
});
