import { describe, expect, it } from "vitest";
import {
  buildGstr1Json,
  documentSeries,
  filingPeriod,
  gstinCheckDigit,
  isValidDocNumber,
  isValidGstin,
  isValidHsn,
  portalDate,
  uqcForUnit,
  type Gstr1Bill,
  type Gstr1Input,
} from "./gstr1Json";

// Check digits worked out with gstinCheckDigit; the two real ones are public company GSTINs.
const SHOP = "27ABCDE1234F1Z0"; // Maharashtra
const GUJ = "24ABCDE1234F1Z6"; // Gujarat (inter-state buyer)
const MAH = "27AAPFU0939F1ZV"; // Maharashtra (intra-state buyer)

const bill = (over: Partial<Gstr1Bill>): Gstr1Bill => ({
  id: "b",
  number: "POS/26-27/1",
  date: "2026-10-05",
  gstin: "",
  billValue: 1050,
  taxType: "inclusive",
  lines: [{ hsn: "6109", rate: 5, qty: 1, value: 1050, uom: "pcs", productName: "T-Shirt" }],
  ...over,
});

const input = (over: Partial<Gstr1Input>): Gstr1Input => ({
  shopGstin: SHOP,
  fromYmd: "2026-10-01",
  toYmd: "2026-10-31",
  bills: [],
  notes: [],
  documents: { invoices: [], creditNotes: [] },
  ...over,
});

describe("GSTIN check", () => {
  it("accepts real GSTINs and rejects a wrong check digit", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("07AAGFF2194N1Z1")).toBe(true);
    expect(isValidGstin(" 07aagff2194n1z1 ")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("")).toBe(false);
    expect(gstinCheckDigit("27ABCDE1234F1Z")).toBe("0");
  });

  it("rejects an impossible state code", () => {
    expect(isValidGstin("00AAPFU0939F1Z" + gstinCheckDigit("00AAPFU0939F1Z"))).toBe(false);
  });
});

describe("portal field rules", () => {
  it("HSN digits, document numbers, units, dates", () => {
    expect(isValidHsn("6109")).toBe(true);
    expect(isValidHsn("610910")).toBe(true);
    expect(isValidHsn("61091000")).toBe(true);
    expect(isValidHsn("610")).toBe(false);
    expect(isValidHsn("0000")).toBe(true); // digits only; the portal's master list decides the rest
    expect(isValidHsn("61A9")).toBe(false);

    expect(isValidDocNumber("POS/26-27/1234")).toBe(true);
    expect(isValidDocNumber("INV-00001")).toBe(true);
    expect(isValidDocNumber("POS/26-27/12345678")).toBe(false); // 17 chars
    expect(isValidDocNumber("INV 1")).toBe(false);

    expect(uqcForUnit("Pcs")).toBe("PCS");
    expect(uqcForUnit("Mtr.")).toBe("MTR");
    expect(uqcForUnit("")).toBe("PCS");
    expect(uqcForUnit("bale")).toBeNull();

    expect(portalDate("2026-10-05T20:30:00.000Z")).toBe("06-10-2026"); // 02:00 IST next day
    expect(portalDate("2026-10-05")).toBe("05-10-2026");
  });

  it("filing period is one month or one GST quarter", () => {
    expect(filingPeriod("2026-10-01", "2026-10-31")).toBe("102026");
    expect(filingPeriod("2026-02-01", "2026-02-28")).toBe("022026");
    expect(filingPeriod("2026-07-01", "2026-09-30")).toBe("092026");
    expect(filingPeriod("2027-01-01", "2027-03-31")).toBe("032027");
    expect(filingPeriod("2026-08-01", "2026-10-31")).toBeNull();
    expect(filingPeriod("2026-10-01", "2026-10-30")).toBeNull();
    expect(filingPeriod("2026-10-02", "2026-10-31")).toBeNull();
  });

  it("groups document numbers into series by prefix", () => {
    const series = documentSeries([
      { number: "POS/26-27/12", cancelled: false },
      { number: "POS/26-27/3", cancelled: true },
      { number: "INV-7", cancelled: false },
    ]);
    expect(series.map((s) => s.prefix)).toEqual(["INV-", "POS/26-27/"]);
    expect(series[1].docs.map((d) => d.number)).toEqual(["POS/26-27/3", "POS/26-27/12"]);
  });
});

describe("buildGstr1Json", () => {
  it("writes B2B, B2CS, CDNR, HSN split and document series", () => {
    const r = buildGstr1Json(
      input({
        bills: [
          bill({ id: "1", number: "POS/26-27/1", date: "2026-10-05T10:00:00Z", billValue: 2100, lines: [
            { hsn: "6109", rate: 5, qty: 2, value: 1050, uom: "Pcs", productName: "T-Shirt" },
            { hsn: "6203", rate: 5, qty: 1, value: 1050, uom: "Pcs", productName: "Trouser" },
          ] }),
          bill({ id: "2", number: "INV/26-27/1", date: "2026-10-06", gstin: GUJ, billValue: 11800, taxType: "exclusive", lines: [
            { hsn: "6204", rate: 18, qty: 4, value: 10000, uom: "pcs", productName: "Dress" },
          ] }),
        ],
        notes: [
          bill({ id: "r1", number: "SR/26-27/1", date: "2026-10-09", billValue: 525, lines: [
            { hsn: "6109", rate: 5, qty: 1, value: 525, uom: "pcs", productName: "T-Shirt" },
          ] }),
          bill({ id: "r2", number: "SR/26-27/2", date: "2026-10-10", gstin: GUJ, billValue: 2950, taxType: "exclusive", lines: [
            { hsn: "6204", rate: 18, qty: 1, value: 2500, uom: "pcs", productName: "Dress" },
          ] }),
        ],
        documents: {
          invoices: [
            { number: "POS/26-27/1", cancelled: false },
            { number: "POS/26-27/2", cancelled: true },
            { number: "INV/26-27/1", cancelled: false },
          ],
          creditNotes: [
            { number: "SR/26-27/1", cancelled: false },
            { number: "SR/26-27/2", cancelled: false },
          ],
        },
      }),
    );
    expect(r.errors).toEqual([]);
    const json = r.json!;
    expect(json.gstin).toBe(SHOP);
    expect(json.fp).toBe("102026");

    // B2B: inter-state buyer → IGST, place of supply = buyer's state.
    expect(json.b2b).toHaveLength(1);
    expect(json.b2b[0].ctin).toBe(GUJ);
    const inv = json.b2b[0].inv[0];
    expect(inv).toMatchObject({ inum: "INV/26-27/1", idt: "06-10-2026", val: 11800, pos: "24", rchrg: "N", inv_typ: "R" });
    expect(inv.itms[0].itm_det).toEqual({ rt: 18, txval: 10000, iamt: 1800, camt: 0, samt: 0, csamt: 0 });

    // B2CS: 2000 taxable at 5%, less the 500 retail credit note.
    expect(json.b2cs).toEqual([
      { sply_ty: "INTRA", rt: 5, typ: "OE", pos: "27", txval: 1500, iamt: 0, camt: 37.5, samt: 37.5, csamt: 0 },
    ]);

    // CDNR: positive note amounts.
    expect(json.cdnr[0].ctin).toBe(GUJ);
    expect(json.cdnr[0].nt[0]).toMatchObject({ ntty: "C", nt_num: "SR/26-27/2", nt_dt: "10-10-2026", pos: "24", val: 2950 });
    expect(json.cdnr[0].nt[0].itms[0].itm_det).toEqual({ rt: 18, txval: 2500, iamt: 450, camt: 0, samt: 0, csamt: 0 });
    expect(json.cdnur).toEqual([]);

    // HSN: B2B net of the credit note; B2C net of the retail return.
    expect(json.hsn.hsn_b2b).toEqual([
      { num: 1, hsn_sc: "6204", desc: "Dress", uqc: "PCS", qty: 3, rt: 18, txval: 7500, iamt: 1350, camt: 0, samt: 0, csamt: 0 },
    ]);
    expect(json.hsn.hsn_b2c.map((h) => [h.hsn_sc, h.qty, h.txval])).toEqual([
      ["6109", 1, 500],
      ["6203", 1, 1000],
    ]);

    // Table 13: one series per prefix, cancelled counted.
    expect(json.doc_issue.doc_det).toEqual([
      { doc_num: 1, docs: [
        { num: 1, from: "INV/26-27/1", to: "INV/26-27/1", totnum: 1, cancel: 0, net_issue: 1 },
        { num: 2, from: "POS/26-27/1", to: "POS/26-27/2", totnum: 2, cancel: 1, net_issue: 1 },
      ] },
      { doc_num: 5, docs: [{ num: 1, from: "SR/26-27/1", to: "SR/26-27/2", totnum: 2, cancel: 0, net_issue: 2 }] },
    ]);
    expect(json.nil).toBeUndefined();

    expect(r.summary).toMatchObject({ b2bInvoices: 1, b2csRows: 1, cdnrNotes: 1, hsnRows: 3, docSeries: 3, taxable: 9000, tax: 1425 });
  });

  it("blocks on a bad buyer GSTIN, a missing HSN and a bad bill number; warns on a partial GSTIN", () => {
    const r = buildGstr1Json(
      input({
        bills: [
          bill({ id: "1", number: "POS/26-27/1", gstin: "27AAPFU0939F1ZX" }),
          bill({ id: "2", number: "POS/26-27/2", lines: [{ hsn: "", rate: 5, qty: 1, value: 105, productName: "Cap" }] }),
          bill({ id: "3", number: "POS 26-27 3" }),
          bill({ id: "4", number: "POS/26-27/4", gstin: "27AAPFU09" }),
          bill({ id: "5", number: "POS/26-27/5", lines: [{ hsn: "61", rate: 5, qty: 1, value: 105, productName: "Sock" }] }),
        ],
      }),
    );
    expect(r.json).toBeNull();
    expect(r.errors.map((e) => e.code).sort()).toEqual(["bad_hsn", "buyer_gstin", "invoice_number", "missing_hsn"]);
    expect(r.errors.find((e) => e.code === "buyer_gstin")?.refs).toEqual(["POS/26-27/1"]);
    expect(r.errors.find((e) => e.code === "missing_hsn")?.refs).toEqual(["Cap"]);
    expect(r.warnings.find((w) => w.code === "partial_gstin")?.refs).toEqual(["POS/26-27/4"]);
  });

  it("a shop under ₹5 crore may skip HSN on retail lines, never on B2B lines", () => {
    const bills = [
      bill({ id: "1", number: "POS/26-27/1", lines: [{ hsn: "", rate: 5, qty: 1, value: 105, productName: "Cap" }] }),
      bill({ id: "2", number: "INV/26-27/1", gstin: MAH, lines: [{ hsn: "", rate: 5, qty: 1, value: 105, productName: "Belt" }] }),
    ];
    const strict = buildGstr1Json(input({ bills }));
    expect(strict.errors.find((e) => e.code === "missing_hsn")?.refs).toEqual(["Cap", "Belt"]);

    const relaxed = buildGstr1Json(input({ bills, skipB2cHsn: true }));
    expect(relaxed.errors.find((e) => e.code === "missing_hsn")?.refs).toEqual(["Belt"]);
    expect(relaxed.warnings.find((w) => w.code === "missing_hsn")?.refs).toEqual(["Cap"]);
  });

  it("puts 0% lines and No-GST bills in the nil-rated table, and a B2C bill with only those stays out of B2CS", () => {
    const r = buildGstr1Json(
      input({
        bills: [
          bill({ id: "1", number: "POS/26-27/1", billValue: 300, taxType: "no_gst", lines: [{ hsn: "6109", rate: 5, qty: 1, value: 300, productName: "T-Shirt" }] }),
          bill({ id: "2", number: "INV/26-27/1", gstin: MAH, billValue: 1250, lines: [
            { hsn: "6109", rate: 5, qty: 1, value: 1050, productName: "T-Shirt" },
            { hsn: "4901", rate: 0, qty: 1, value: 200, productName: "Book" },
          ] }),
        ],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.json!.b2cs).toEqual([]);
    expect(r.json!.nil!.inv).toEqual([
      { sply_ty: "INTRAB2B", nil_amt: 200, expt_amt: 0, ngsup_amt: 0 },
      { sply_ty: "INTRAB2C", nil_amt: 300, expt_amt: 0, ngsup_amt: 0 },
    ]);
    // The B2B invoice keeps only its taxable line; its value is still the full bill.
    expect(r.json!.b2b[0].inv[0].val).toBe(1250);
    expect(r.json!.b2b[0].inv[0].itms).toHaveLength(1);
    expect(r.warnings.find((w) => w.code === "nil_rated")?.refs).toEqual(["POS/26-27/1", "INV/26-27/1"]);
  });

  it("inter-state retail above ₹2.5 lakh is B2CL; a retail credit note that outweighs sales warns", () => {
    const r = buildGstr1Json(
      input({
        bills: [
          bill({ id: "1", number: "INV/26-27/9", posStateCode: "24", billValue: 300000, taxType: "exclusive", lines: [
            { hsn: "6204", rate: 5, qty: 100, value: 285714.29, productName: "Saree" },
          ] }),
          bill({ id: "2", number: "POS/26-27/1", billValue: 105 }),
        ],
        notes: [bill({ id: "r", number: "SR/26-27/1", billValue: 210, lines: [{ hsn: "6109", rate: 5, qty: 2, value: 210, productName: "T-Shirt" }] })],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.json!.b2cl).toEqual([
      { pos: "24", inv: [expect.objectContaining({ inum: "INV/26-27/9", val: 300000, pos: "24" })] },
    ]);
    expect(r.json!.b2cl[0].inv[0].itms[0].itm_det).toEqual({ rt: 5, txval: 285714.29, iamt: 14285.71, camt: 0, samt: 0, csamt: 0 });
    expect(r.json!.b2cs).toEqual([
      { sply_ty: "INTRA", rt: 5, typ: "OE", pos: "27", txval: -100, iamt: 0, camt: -2.5, samt: -2.5, csamt: 0 },
    ]);
    expect(r.warnings.map((w) => w.code)).toContain("negative_b2cs");
    expect(r.warnings.map((w) => w.code)).toContain("negative_hsn");
  });

  it("refuses a bad shop GSTIN or a period that is not a month / quarter", () => {
    expect(buildGstr1Json(input({ shopGstin: "27ABCDE1234F1Z5" })).errors.map((e) => e.code)).toEqual(["shop_gstin"]);
    const r = buildGstr1Json(input({ fromYmd: "2026-10-01", toYmd: "2026-11-30" }));
    expect(r.errors.map((e) => e.code)).toEqual(["period"]);
    expect(r.json).toBeNull();
    expect(buildGstr1Json(input({})).warnings.map((w) => w.code)).toEqual(["empty"]);
  });
});
