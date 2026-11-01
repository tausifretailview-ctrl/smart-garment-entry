import { describe, expect, it } from "vitest";
import {
  EMPTY_SALE_B2B_FORM,
  buildB2BInvoiceRows,
  checkCreditLimit,
  dueDateFromCreditDays,
  formatCustomerPoRef,
  buildQuotationLostReason,
  formatAltUnitQty,
  formatFollowUpChip,
  industrialItemToForm,
  parseIndustrialItemForm,
  reorderState,
  formatSaleTransportLine,
  fromIsoDay,
  quotationDisplayNumber,
  quotationFollowUpState,
  toIsoDay,
  parseCustomerCreditTermsInput,
  parseSaleB2BForm,
  resolveIndustrialMode,
  saleB2BToForm,
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

  it("returns local noon so the saved ISO date is the same calendar day", () => {
    const d = dueDateFromCreditDays(new Date(2026, 10, 1, 0, 5), 30);
    expect(d.getHours()).toBe(12);
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

describe("sale B2B details", () => {
  it("saves NULL for an empty form", () => {
    expect(parseSaleB2BForm(EMPTY_SALE_B2B_FORM)).toBeNull();
  });

  it("normalises vehicle and transporter id and keeps mode only with transport", () => {
    expect(
      parseSaleB2BForm({
        ...EMPTY_SALE_B2B_FORM,
        customer_po_no: " PO-7781 ",
        customer_po_date: "2026-10-28",
        transporter_name: "VRL Logistics",
        transporter_id: "29aabcv1234f1z5",
        vehicle_no: "mh 04-ab 1234",
        lr_no: "55821",
        lr_date: "2026-11-01",
        distance_km: "142",
      }),
    ).toEqual({
      customer_po_no: "PO-7781",
      customer_po_date: "2026-10-28",
      transporter_name: "VRL Logistics",
      transporter_id: "29AABCV1234F1Z5",
      vehicle_no: "MH04AB1234",
      lr_no: "55821",
      lr_date: "2026-11-01",
      distance_km: 142,
      transport_mode: "road",
    });
    expect(parseSaleB2BForm({ ...EMPTY_SALE_B2B_FORM, customer_po_no: "A1" })).toEqual({ customer_po_no: "A1" });
  });

  it("rejects bad values", () => {
    expect(() => parseSaleB2BForm({ ...EMPTY_SALE_B2B_FORM, transporter_id: "12345" })).toThrow();
    expect(() => parseSaleB2BForm({ ...EMPTY_SALE_B2B_FORM, vehicle_no: "MH" })).toThrow();
    expect(() => parseSaleB2BForm({ ...EMPTY_SALE_B2B_FORM, distance_km: "12.5" })).toThrow();
  });

  it("round-trips through the form", () => {
    const saved = { customer_po_no: "PO-1", vehicle_no: "MH04AB1234", distance_km: 20, transport_mode: "rail" };
    const form = saleB2BToForm(saved);
    expect(form.distance_km).toBe("20");
    expect(form.transport_mode).toBe("rail");
    expect(parseSaleB2BForm(form)).toEqual(saved);
    expect(saleB2BToForm(null)).toEqual(EMPTY_SALE_B2B_FORM);
  });

  it("formats print lines", () => {
    const d = {
      customer_po_no: "PO-7781",
      customer_po_date: "2026-10-28",
      transporter_name: "VRL",
      vehicle_no: "MH04AB1234",
      lr_no: "55821",
      lr_date: "2026-11-01",
      distance_km: 142,
      transport_mode: "road" as const,
    };
    expect(formatSaleTransportLine(d)).toBe("VRL · Vehicle MH04AB1234 · LR 55821 dt 01/11/2026 · 142 km");
    expect(formatCustomerPoRef(d)).toBe("PO-7781 dt 28/10/2026");
    expect(formatSaleTransportLine(null, "VRL")).toBe("VRL");
    expect(formatSaleTransportLine({ vehicle_no: "MH04AB1234" }, "VRL")).toBe("VRL · Vehicle MH04AB1234");
  });
});

describe("buildB2BInvoiceRows", () => {
  it("adds nothing for retail bills", () => {
    expect(buildB2BInvoiceRows(null, { invoiceDate: new Date(2026, 10, 1), dueDate: "2026-12-01" })).toEqual([]);
  });

  it("lists only filled rows and the due date when it differs", () => {
    expect(
      buildB2BInvoiceRows(
        { customer_po_no: "PO-7781", customer_po_date: "2026-10-28", transporter_name: "VRL", transport_mode: "rail", vehicle_no: "MH04AB1234", lr_no: "55821", lr_date: "2026-11-01", distance_km: 142 },
        { invoiceDate: new Date(2026, 10, 1, 10), dueDate: "2026-12-01" },
      ),
    ).toEqual([
      ["Buyer's Order No.", "PO-7781 dt 28/10/2026"],
      ["Dispatched through", "VRL by Rail"],
      ["Vehicle No.", "MH04AB1234"],
      ["LR / RR No.", "55821 dt 01/11/2026"],
      ["Distance", "142 km"],
      ["Due Date", "01-12-2026"],
    ]);
    expect(buildB2BInvoiceRows({ customer_po_no: "A1" }, { invoiceDate: new Date(2026, 10, 1), dueDate: "2026-11-01" })).toEqual([
      ["Buyer's Order No.", "A1"],
    ]);
  });
});

describe("quotation follow-up and revision", () => {
  it("shows Rev only after the first edit", () => {
    expect(quotationDisplayNumber("QT/26-27/0042", null)).toBe("QT/26-27/0042");
    expect(quotationDisplayNumber("QT/26-27/0042", 0)).toBe("QT/26-27/0042");
    expect(quotationDisplayNumber("QT/26-27/0042", 2)).toBe("QT/26-27/0042 Rev 2");
  });

  it("works out the follow-up chip", () => {
    const today = new Date(2026, 10, 5, 9);
    expect(quotationFollowUpState("2026-11-04", "sent", today)).toBe("overdue");
    expect(quotationFollowUpState("2026-11-05", "draft", today)).toBe("today");
    expect(quotationFollowUpState("2026-11-09", "hold", today)).toBe("upcoming");
    expect(quotationFollowUpState("2026-11-04", "confirmed", today)).toBeNull();
    expect(quotationFollowUpState(null, "sent", today)).toBeNull();
  });

  it("converts calendar days without a UTC shift", () => {
    const d = fromIsoDay("2026-11-05");
    expect(d && toIsoDay(d)).toBe("2026-11-05");
    expect(toIsoDay(new Date(2026, 10, 5, 0, 10))).toBe("2026-11-05");
    expect(fromIsoDay("bad")).toBeNull();
  });

  it("labels the follow-up chip", () => {
    const today = new Date(2026, 10, 1, 18);
    expect(formatFollowUpChip("2026-10-28", "overdue", today)).toBe("Follow up 28/10 · 4d late");
    expect(formatFollowUpChip("2026-11-01", "today", today)).toBe("Follow up today");
    expect(formatFollowUpChip("2026-11-05", "upcoming", today)).toBe("Follow up 05/11");
  });

  it("joins the lost reason and note", () => {
    expect(buildQuotationLostReason("Price too high", " we quoted 455 ")).toBe("Price too high: we quoted 455");
    expect(buildQuotationLostReason("", "Owner changed")).toBe("Owner changed");
    expect(buildQuotationLostReason(" ", " ")).toBeNull();
  });
});

describe("item alternate unit and reorder level", () => {
  it("parses the item form", () => {
    expect(parseIndustrialItemForm({ alt_uom: "box", alt_uom_factor: "12", reorder_level: "1,200" }, "NOS")).toEqual({
      alt_uom: "BOX",
      alt_uom_factor: 12,
      reorder_level: 1200,
    });
    expect(parseIndustrialItemForm({ alt_uom: "", alt_uom_factor: "12", reorder_level: "" }, "NOS")).toEqual({
      alt_uom: null,
      alt_uom_factor: null,
      reorder_level: null,
    });
  });

  it("rejects bad values", () => {
    expect(() => parseIndustrialItemForm({ alt_uom: "NOS", alt_uom_factor: "12", reorder_level: "" }, "NOS")).toThrow();
    expect(() => parseIndustrialItemForm({ alt_uom: "BOX", alt_uom_factor: "", reorder_level: "" }, "NOS")).toThrow();
    expect(() => parseIndustrialItemForm({ alt_uom: "BOX", alt_uom_factor: "0", reorder_level: "" }, "NOS")).toThrow();
    expect(() => parseIndustrialItemForm({ alt_uom: "", alt_uom_factor: "", reorder_level: "-1" }, "NOS")).toThrow();
  });

  it("round-trips through the form", () => {
    expect(industrialItemToForm({ alt_uom: "BOX", alt_uom_factor: 12, reorder_level: 50 })).toEqual({
      alt_uom: "BOX",
      alt_uom_factor: "12",
      reorder_level: "50",
    });
    expect(industrialItemToForm(null)).toEqual({ alt_uom: "", alt_uom_factor: "", reorder_level: "" });
  });

  it("shows qty in the alternate unit", () => {
    expect(formatAltUnitQty(36, "NOS", "BOX", 12)).toBe("3 BOX");
    expect(formatAltUnitQty(40, "NOS", "BOX", 12)).toBe("3 BOX + 4 NOS");
    expect(formatAltUnitQty(5, "NOS", "BOX", 12)).toBe("");
    expect(formatAltUnitQty(25.5, "KG", "BAG", 25)).toBe("1 BAG + 0.5 KG");
    expect(formatAltUnitQty(40, "NOS", null, 12)).toBe("");
  });

  it("works out the reorder state", () => {
    expect(reorderState(4, 10)).toBe("below");
    expect(reorderState(10, 10)).toBe("at");
    expect(reorderState(11, 10)).toBe("ok");
    expect(reorderState(0, null)).toBeNull();
  });
});
