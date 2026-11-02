import { describe, expect, it } from "vitest";
import {
  buildNoteEInvoicePayload,
  debitNoteToNoteInput,
  duplicateIrnInfo,
  irnCancelHoursLeft,
  irnReportingWindow,
  IRP_DOC_NO_PATTERN,
  noteEInvoiceProblem,
  parseIrpDateTime,
  perioneErrorText,
  saleReturnTaxInclusive,
  saleReturnToNoteInput,
  saleBillToIrnInput,
  irpSupplyTypeOf,
  type NoteInput,
  type NoteParty,
} from "../../supabase/functions/_shared/einvoiceNote";

const seller: NoteParty = {
  gstin: "27AAAAA0000A1Z5",
  name: "Demo Industries",
  address: "Plot 4, MIDC Andheri East, Mumbai 400093",
  phone: "+91 98200 00000",
  email: "accounts@demo.in",
};
const buyerMh: NoteParty = {
  gstin: "27BBBBB1111B1Z6",
  name: "Shree Traders",
  address: "12 Market Road, Pune 411001",
  phone: "9822000000",
};
const buyerGj: NoteParty = { ...buyerMh, gstin: "24CCCCC2222C1Z7", address: "Ring Road, Surat 395002" };

const freightNote = (patch: Partial<NoteInput> = {}): NoteInput => ({
  docType: "DBN",
  number: "DN/26-27/7",
  date: "2026-11-02",
  interState: false,
  netAmount: 1180,
  lines: [{ description: "Freight charges", hsn: "996511", qty: 1, rate: 1000, taxable: 1000, gstPercent: 18, gstAmount: 180 }],
  remarks: "Freight / packing charged later",
  againstInvoice: { number: "INV/26-27/538", date: "2026-10-28" },
  ...patch,
});

describe("buildNoteEInvoicePayload", () => {
  it("builds a same-state debit note with CGST + SGST and the original invoice", () => {
    const r = buildNoteEInvoicePayload(freightNote(), seller, buyerMh);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.payload;
    expect(p.DocDtls).toEqual({ Typ: "DBN", No: "DN/26-27/7", Dt: "02/11/2026" });
    expect(p.TranDtls.SupTyp).toBe("B2B");
    expect(p.BuyerDtls.Pos).toBe("27");
    expect(p.SellerDtls.Pin).toBe(400093);
    expect(p.BuyerDtls.Pin).toBe(411001);
    expect(p.SellerDtls.Ph).toBe("919820000000");
    const item = p.ItemList[0];
    expect(item.IsServc).toBe("Y");
    expect(item.Unit).toBe("OTH");
    expect(item.AssAmt).toBe(1000);
    expect(item.CgstAmt).toBe(90);
    expect(item.SgstAmt).toBe(90);
    expect(item.IgstAmt).toBe(0);
    expect(item.TotItemVal).toBe(1180);
    expect(p.ValDtls).toMatchObject({ AssVal: 1000, CgstVal: 90, SgstVal: 90, IgstVal: 0, RndOffAmt: 0, TotInvVal: 1180 });
    expect(p.RefDtls?.PrecDocDtls).toEqual([{ InvNo: "INV/26-27/538", InvDt: "28/10/2026" }]);
    expect(p.RefDtls?.InvRm).toBe("Freight / packing charged later");
  });

  it("charges IGST when the buyer is in another state", () => {
    const r = buildNoteEInvoicePayload(freightNote({ interState: true }), seller, buyerGj);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.BuyerDtls.Pos).toBe("24");
    expect(r.payload.ValDtls).toMatchObject({ CgstVal: 0, SgstVal: 0, IgstVal: 180, TotInvVal: 1180 });
  });

  it("stops when the inter-state switch disagrees with the GSTINs", () => {
    const r = buildNoteEInvoicePayload(freightNote({ interState: false }), seller, buyerGj);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INTER_STATE");
    expect(r.error).toContain("turn on Inter-state");
  });

  it("needs an HSN / SAC on every line", () => {
    const r = buildNoteEInvoicePayload(
      freightNote({ lines: [{ description: "Rate difference", hsn: "", qty: 10, rate: 5, taxable: 50, gstPercent: 5, gstAmount: 2.5 }] }),
      seller,
      buyerMh,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("HSN");
  });

  it("needs a buyer GSTIN and PIN codes", () => {
    const noGstin = buildNoteEInvoicePayload(freightNote(), seller, { ...buyerMh, gstin: "" });
    expect(noGstin.ok ? "" : noGstin.code).toBe("BUYER_GSTIN");
    const noPin = buildNoteEInvoicePayload(freightNote(), seller, { ...buyerMh, address: "Market Road, Pune" });
    expect(noPin.ok ? "" : noPin.code).toBe("BUYER_PIN");
    const shopNoPin = buildNoteEInvoicePayload(freightNote(), { ...seller, address: "Andheri" }, buyerMh);
    expect(shopNoPin.ok ? "" : shopNoPin.code).toBe("SELLER_PIN");
  });

  it("refuses a number the IRP can't take", () => {
    const r = buildNoteEInvoicePayload(freightNote({ number: "DEBIT NOTE 7" }), seller, buyerMh);
    expect(r.ok ? "" : r.code).toBe("DOC_NO");
  });

  it("puts the whole-rupee rounding in RndOffAmt so the totals add up", () => {
    const r = buildNoteEInvoicePayload(
      freightNote({
        netAmount: 117,
        lines: [{ description: "Rate difference", hsn: "62034200", qty: 1, rate: 99.5, taxable: 99.5, gstPercent: 18, gstAmount: 17.91 }],
      }),
      seller,
      buyerMh,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.payload.ValDtls;
    expect(v.CgstVal).toBe(8.96);
    expect(v.SgstVal).toBe(8.96);
    expect(v.RndOffAmt).toBe(-0.42);
    expect(Math.round((v.AssVal + v.CgstVal + v.SgstVal + v.IgstVal + v.RndOffAmt) * 100) / 100).toBe(v.TotInvVal);
    expect(r.payload.ItemList[0].IsServc).toBe("N");
  });

  it("leaves out the original invoice when its date is unknown", () => {
    const r = buildNoteEInvoicePayload(freightNote({ againstInvoice: { number: "INV/1", date: null }, remarks: "" }), seller, buyerMh);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.RefDtls).toBeUndefined();
  });
});

describe("debitNoteToNoteInput", () => {
  it("reads the stored debit note details", () => {
    const input = debitNoteToNoteInput(
      { sale_number: "DN/26-27/3", sale_date: "2026-11-01T00:00:00", net_amount: 236 },
      {
        v: 1,
        against_sale_number: "INV/26-27/9",
        against_sale_date: "2026-10-20",
        reason: "short_billed",
        reason_note: "2 pcs missed",
        inter_state: true,
        lines: [
          { description: "Shirt", hsn: "6205", qty: 2, rate: 100, taxable: 200, gst_percent: 18, gst_amount: 36 },
          { description: "Freight", hsn: "9965", qty: 1, rate: 0, taxable: 0, gst_percent: 18, gst_amount: 0 },
        ],
      },
    );
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.docType).toBe("DBN");
    expect(input.date).toBe("2026-11-01");
    expect(input.interState).toBe(true);
    expect(input.lines[0].unit).toBe("NOS");
    expect(input.lines[1].unit).toBe("OTH");
    expect(input.remarks).toBe("Quantity short billed: 2 pcs missed");
    expect(input.againstInvoice).toEqual({ number: "INV/26-27/9", date: "2026-10-20" });
  });

  it("is null without stored lines", () => {
    expect(debitNoteToNoteInput({ sale_number: "DN/1", sale_date: "2026-11-01", net_amount: 0 }, null)).toBeNull();
  });
});

describe("time limits", () => {
  it("counts the 30-day IRN window in India time", () => {
    expect(irnReportingWindow("2026-11-01", new Date("2026-11-02T06:00:00Z"))).toEqual({
      lastDay: "2026-11-30",
      daysLeft: 28,
      late: false,
    });
    expect(irnReportingWindow("2026-11-01", new Date("2026-11-30T10:00:00Z"))?.daysLeft).toBe(0);
    // 20:00 UTC on the 30th is already 1 December in India.
    expect(irnReportingWindow("2026-11-01", new Date("2026-11-30T20:00:00Z"))?.late).toBe(true);
    expect(irnReportingWindow("", new Date())).toBeNull();
  });

  it("gives 24 hours to cancel", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(irnCancelHoursLeft("2026-11-02T02:00:00Z", now)).toBe(14);
    expect(irnCancelHoursLeft("2026-11-01T11:00:00Z", now)).toBe(0);
    expect(irnCancelHoursLeft(null, now)).toBe(0);
  });

  it("reads IRP acknowledgement times as India time", () => {
    expect(parseIrpDateTime("2026-11-02 10:15:00")).toBe("2026-11-02T04:45:00.000Z");
    expect(parseIrpDateTime("02/11/2026 10:15:00")).toBe("2026-11-02T04:45:00.000Z");
    expect(parseIrpDateTime("soon")).toBeNull();
  });
});

describe("PeriOne replies", () => {
  it("reads error lists with their codes", () => {
    expect(
      perioneErrorText({ status_cd: "0", ErrorDetails: [{ ErrorCode: "2172", ErrorMessage: "IGST should be zero" }] }),
    ).toBe("2172: IGST should be zero");
    expect(perioneErrorText({ status_cd: "0", status_desc: "Invalid token" })).toBe("Invalid token");
    expect(perioneErrorText({})).toBe("The IRP did not accept it");
  });

  it("finds the IRN of a duplicate", () => {
    const dup = duplicateIrnInfo({
      status_cd: "0",
      ErrorDetails: [{ ErrorCode: "2150", ErrorMessage: "Duplicate IRN" }],
      InfoDtls: [{ InfCd: "DUPIRN", Desc: { AckNo: 112010000000001, AckDt: "2026-11-02 10:15:00", Irn: "abc123" } }],
    });
    expect(dup).toEqual({ irn: "abc123", ackNo: "112010000000001", ackDt: "2026-11-02 10:15:00" });
    expect(duplicateIrnInfo({ status_cd: "0" })).toBeNull();
  });

  it("checks IRP document numbers", () => {
    expect(IRP_DOC_NO_PATTERN.test("DN/26-27/1")).toBe(true);
    expect(IRP_DOC_NO_PATTERN.test("0DN/1")).toBe(false);
    expect(IRP_DOC_NO_PATTERN.test("DN/2026-2027/12345")).toBe(false);
  });
});

describe("noteEInvoiceProblem", () => {
  it("returns the first problem or null", () => {
    expect(noteEInvoiceProblem(freightNote(), seller, buyerMh)).toBeNull();
    expect(noteEInvoiceProblem(freightNote(), seller, { ...buyerMh, gstin: "" })).toContain("no GSTIN");
  });
});

describe("saleReturnToNoteInput", () => {
  const ret = {
    return_number: "SR/26-27/12",
    return_date: "2026-11-02",
    net_amount: 2360,
    gross_amount: 2360,
    gst_amount: 360,
    original_sale_number: "INV/26-27/538",
    notes: null,
  };
  const items = [
    { product_name: "Cotton shirt", hsn_code: "6205", quantity: 2, line_total: 2360, gst_percent: 18, is_dc_item: false, deleted_at: null },
  ];

  it("reads tax-inclusive returns (net = gross)", () => {
    expect(saleReturnTaxInclusive(ret)).toBe(true);
    const input = saleReturnToNoteInput(ret, items, { interState: false, originalSaleDate: "2026-10-28" });
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.docType).toBe("CRN");
    expect(input.number).toBe("SR/26-27/12");
    expect(input.lines[0]).toMatchObject({ taxable: 2000, gstAmount: 360, qty: 2, rate: 1000, unit: "PCS" });
    expect(input.netAmount).toBe(2360);
    expect(input.againstInvoice).toEqual({ number: "INV/26-27/538", date: "2026-10-28" });
    const r = buildNoteEInvoicePayload(input, seller, buyerMh);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.DocDtls.Typ).toBe("CRN");
      expect(r.payload.ValDtls).toMatchObject({ AssVal: 2000, CgstVal: 180, SgstVal: 180, RndOffAmt: 0, TotInvVal: 2360 });
    }
  });

  it("reads tax-exclusive returns (net = gross + GST)", () => {
    const ex = { ...ret, gross_amount: 2000, net_amount: 2360 };
    expect(saleReturnTaxInclusive(ex)).toBe(false);
    const input = saleReturnToNoteInput(ex, [{ ...items[0], line_total: 2000 }], { interState: true, originalSaleDate: null });
    expect(input?.lines[0]).toMatchObject({ taxable: 2000, gstAmount: 360 });
    expect(input?.againstInvoice).toEqual({ number: "INV/26-27/538", date: null });
  });

  it("leaves out challan and deleted lines", () => {
    const mixed = [
      ...items,
      { product_name: "Sample", hsn_code: "6205", quantity: 1, line_total: 500, gst_percent: 0, is_dc_item: true, deleted_at: null },
    ];
    const input = saleReturnToNoteInput({ ...ret, net_amount: 2860, gross_amount: 2860 }, mixed, { interState: false, originalSaleDate: null });
    expect(input?.lines).toHaveLength(1);
    expect(input?.netAmount).toBe(2360);
    expect(
      saleReturnToNoteInput(ret, [{ ...items[0], is_dc_item: true }], { interState: false, originalSaleDate: null }),
    ).toBeNull();
  });

  it("sends a return of an export bill as EXPWP to the overseas buyer, and of an SEZ bill as IGST", () => {
    const abroad: NoteParty = { gstin: "", name: "Gulf Pipes LLC", address: "Jebel Ali, Dubai" };
    const exp = saleReturnToNoteInput(ret, items, {
      interState: true,
      originalSaleDate: "2026-10-28",
      originalB2bDetails: { supply_type: "EXPWP", port_code: "INNSA1", country_code: "AE", currency: "USD", ship_bill_no: "1234567" },
    });
    expect(exp?.supplyType).toBe("EXPWP");
    expect(exp?.exportDetails).toEqual({ portCode: "INNSA1", countryCode: "AE", currency: "USD" });
    const r = exp ? buildNoteEInvoicePayload(exp, seller, abroad) : null;
    expect(r?.ok).toBe(true);
    if (r && r.ok) {
      expect(r.payload.TranDtls.SupTyp).toBe("EXPWP");
      expect(r.payload.DocDtls.Typ).toBe("CRN");
      expect(r.payload.BuyerDtls).toMatchObject({ Gstin: "URP", Stcd: "96", Pos: "96" });
      expect(r.payload.ValDtls).toMatchObject({ AssVal: 2000, IgstVal: 360, CgstVal: 0, TotInvVal: 2360 });
      expect(r.payload.ExpDtls).toEqual({ Port: "INNSA1", CntCode: "AE", ForCur: "USD" });
    }
    // Same-state SEZ unit: still IGST.
    const sez = saleReturnToNoteInput(ret, items, { interState: false, originalSaleDate: null, originalB2bDetails: { supply_type: "SEZWP" } });
    expect(sez?.supplyType).toBe("SEZWP");
    expect(sez?.exportDetails).toBeUndefined();
    const s = sez ? buildNoteEInvoicePayload(sez, seller, buyerMh) : null;
    expect(s?.ok).toBe(true);
    if (s && s.ok) expect(s.payload.ValDtls).toMatchObject({ IgstVal: 360, CgstVal: 0 });
    // Under LUT a return must not carry GST either.
    const lut = saleReturnToNoteInput(ret, items, { interState: true, originalSaleDate: null, originalB2bDetails: { supply_type: "EXPWOP" } });
    expect(lut ? noteEInvoiceProblem(lut, seller, abroad) : null).toContain("LUT");
    // A regular bill adds nothing.
    expect(saleReturnToNoteInput(ret, items, { interState: false, originalSaleDate: null, originalB2bDetails: { po_number: "PO-9" } })).not.toHaveProperty("supplyType");
  });
});

const exportBill = (patch: Partial<NoteInput> = {}): NoteInput => ({
  docType: "INV",
  number: "INV/26-27/612",
  date: "2026-11-05",
  interState: true,
  netAmount: 50000,
  lines: [{ description: "MS Pipe 25mm", hsn: "73063090", qty: 100, rate: 500, taxable: 50000, gstPercent: 0, gstAmount: 0, unit: "PCS" }],
  supplyType: "EXPWOP",
  exportDetails: { shipBillNo: "1234567", shipBillDate: "2026-11-07", portCode: "innsa1", countryCode: "AE", currency: "USD", foreignValue: 600 },
  ...patch,
});
const buyerAbroad: NoteParty = { gstin: "", name: "Gulf Pipes LLC", address: "Jebel Ali, Dubai" };

describe("export and SEZ bills", () => {
  it("sends an export bill to a URP buyer in state 96 with the export details", () => {
    const r = buildNoteEInvoicePayload(exportBill(), seller, buyerAbroad);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.payload;
    expect(p.TranDtls.SupTyp).toBe("EXPWOP");
    expect(p.DocDtls.Typ).toBe("INV");
    expect(p.BuyerDtls).toMatchObject({ Gstin: "URP", Stcd: "96", Pos: "96", Pin: 999999 });
    expect(p.ExpDtls).toEqual({ ShipBNo: "1234567", ShipBDt: "07/11/2026", Port: "INNSA1", CntCode: "AE", ForCur: "USD" });
    expect(p.ValDtls.TotInvValFc).toBe(600);
    expect(p.ValDtls.IgstVal).toBe(0);
    expect(p.RefDtls).toBeUndefined();
  });

  it("charges IGST on an export with tax", () => {
    const r = buildNoteEInvoicePayload(
      exportBill({
        supplyType: "EXPWP",
        netAmount: 59000,
        lines: [{ description: "MS Pipe 25mm", hsn: "73063090", qty: 100, rate: 500, taxable: 50000, gstPercent: 18, gstAmount: 9000 }],
      }),
      seller,
      buyerAbroad,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ItemList[0]).toMatchObject({ IgstAmt: 9000, CgstAmt: 0, SgstAmt: 0, GstRt: 18 });
    expect(r.payload.ValDtls.IgstVal).toBe(9000);
  });

  it("stops GST on a bill under LUT and an export to a buyer with an Indian GSTIN", () => {
    const taxed = exportBill({
      netAmount: 59000,
      lines: [{ description: "MS Pipe 25mm", hsn: "73063090", qty: 100, rate: 500, taxable: 50000, gstPercent: 18, gstAmount: 9000 }],
    });
    expect(noteEInvoiceProblem(taxed, seller, buyerAbroad)).toMatch(/LUT/);
    const r = buildNoteEInvoicePayload(exportBill(), seller, buyerMh);
    expect(r.ok === false && r.code).toBe("EXPORT_BUYER");
  });

  it("charges IGST to an SEZ unit in the shop's own state", () => {
    const r = buildNoteEInvoicePayload(
      exportBill({
        supplyType: "SEZWP",
        interState: false,
        netAmount: 59000,
        lines: [{ description: "MS Pipe 25mm", hsn: "73063090", qty: 100, rate: 500, taxable: 50000, gstPercent: 18, gstAmount: 9000 }],
      }),
      seller,
      buyerMh,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.TranDtls.SupTyp).toBe("SEZWP");
    expect(r.payload.BuyerDtls).toMatchObject({ Gstin: "27BBBBB1111B1Z6", Stcd: "27", Pos: "27", Pin: 411001 });
    expect(r.payload.ItemList[0]).toMatchObject({ IgstAmt: 9000, CgstAmt: 0 });
    expect(r.payload.ExpDtls).toBeUndefined();
    expect(noteEInvoiceProblem(exportBill({ supplyType: "SEZWOP" }), seller, buyerAbroad)).toMatch(/SEZ unit has one/);
  });

  it("adds other charges to the total", () => {
    const r = buildNoteEInvoicePayload(exportBill({ netAmount: 51500, otherCharges: 1500 }), seller, buyerAbroad);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ValDtls).toMatchObject({ AssVal: 50000, OthChrg: 1500, RndOffAmt: 0, TotInvVal: 51500 });
  });
});

describe("saleBillToIrnInput", () => {
  const item = (patch: Record<string, unknown> = {}) => ({
    product_name: "MS Pipe 25mm",
    hsn_code: "73063090",
    quantity: 10,
    unit_price: 1000,
    line_total: 11800,
    gst_percent: 18,
    ...patch,
  });

  it("reads the supply type", () => {
    expect(irpSupplyTypeOf({ supply_type: "SEZWOP" })).toBe("SEZWOP");
    expect(irpSupplyTypeOf({ supply_type: "X" })).toBe("B2B");
    expect(irpSupplyTypeOf(null)).toBe("B2B");
  });

  it("spreads the bill discount so the IRN total is the bill total", () => {
    const input = saleBillToIrnInput(
      {
        sale_number: "INV/26-27/612",
        sale_date: "2026-11-05T10:00:00+05:30",
        net_amount: 21740,
        flat_discount_amount: 1000,
        other_charges: 500,
        round_off: 0.4,
        b2b_details: { supply_type: "EXPWP", port_code: "INNSA1", foreign_value: 260 },
      },
      [item(), item({ line_total: 11800 }), item({ is_dc_item: false, deleted_at: "2026-11-05" })],
    );
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.docType).toBe("INV");
    expect(input.date).toBe("2026-11-05");
    expect(input.supplyType).toBe("EXPWP");
    expect(input.netAmount).toBe(21740);
    expect(input.otherCharges).toBe(500);
    expect(input.exportDetails).toMatchObject({ portCode: "INNSA1", foreignValue: 260 });
    const value = input.lines.reduce((s, l) => s + l.taxable + l.gstAmount, 0);
    expect(Math.abs(value - (21740 - 500 - 0.4))).toBeLessThan(0.02);
    const r = buildNoteEInvoicePayload(input, seller, buyerAbroad);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.payload.ValDtls.RndOffAmt - 0.4)).toBeLessThan(0.03);
    expect(r.payload.ValDtls.TotInvVal).toBe(21740);
  });

  it("reports only GST lines when challan lines are on the bill", () => {
    const input = saleBillToIrnInput(
      { sale_number: "INV/1", sale_date: "2026-11-05", net_amount: 13800, flat_discount_amount: 0, b2b_details: { supply_type: "SEZWP" } },
      [item(), item({ line_total: 2000, gst_percent: 0, is_dc_item: true })],
    );
    expect(input?.lines).toHaveLength(1);
    expect(input?.netAmount).toBe(11800);
    expect(input?.exportDetails).toBeNull();
    expect(saleBillToIrnInput({ sale_number: "INV/2", sale_date: "2026-11-05", net_amount: 0 }, [item({ is_dc_item: true })])).toBeNull();
  });
});
