/**
 * GSTR-1 JSON in the GST portal's Offline Tool format, built in the browser from the
 * bills the GST Reports page already loaded.
 *
 * Tables written: B2B (4), B2CL (5), Exports (6A), B2CS (7), Nil-rated (8), CDNR / CDNUR (9B),
 * HSN summary split B2B / B2C (12, May 2025 format) and Documents issued (13).
 * Amendment tables (B2BA, CDNRA, …) are not written: corrections to a filed month are
 * made on the portal.
 *
 * Rules that decide where a rupee goes (same rules as GST Analysis):
 * - Taxable value of a line = line total − its share of the bill discount; round off is not taxable.
 * - A buyer is "registered" only with a GSTIN that passes the format and checksum test.
 * - Walk-in (B2C) sales are intra-state unless the bill carries a place of supply.
 * - Credit notes to unregistered buyers are netted into B2CS (the portal has no row for them);
 *   only an inter-state note above ₹2.5 lakh goes to CDNUR.
 * - Debit notes (Industrial mode, sale_type debit_note) follow the same routes with note type "D"
 *   and add to tax instead of reducing it; they are numbered as their own series in Table 13.
 * - 0% lines on a GST bill, and No-GST bills, are reported as nil-rated (Table 8).
 * - Export and SEZ bills (Industrial mode, `supplyType` on the bill) are zero-rated and always IGST:
 *   exports go to the EXP table (6A, with / without payment), SEZ bills to B2B as SEWP / SEWOP.
 *   Their 0% (under LUT) lines stay in those tables, not in nil-rated.
 */
import { round2, splitLineValue } from "@/utils/gstAnalysis";
import { extractStateCode, isInterState, type GstTaxType } from "@/utils/gstRegisterUtils";

export type Gstr1Line = {
  hsn: string | null | undefined;
  /** GST rate in percent. */
  rate: number | null | undefined;
  qty: number | null | undefined;
  /** Line amount after the bill-discount share (tax inclusive or exclusive per the bill). */
  value: number | null | undefined;
  /** Product unit as typed in the product master (PCS, MTR, …). */
  uom?: string | null;
  productName?: string | null;
};

/** Zero-rated supply of a bill (Industrial mode). Left out for a regular bill. */
export type Gstr1SupplyType = "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP";

export type Gstr1ExportDetails = {
  shipBillNo?: string | null;
  /** yyyy-mm-dd */
  shipBillDate?: string | null;
  portCode?: string | null;
};

export type Gstr1Bill = {
  id: string;
  number: string;
  /** Bill time (timestamptz) or date (yyyy-mm-dd). */
  date: string;
  /** Buyer GSTIN as saved (may be blank or partial). */
  gstin: string | null | undefined;
  /** Invoice value to report (bill total incl. GST). */
  billValue: number;
  taxType: GstTaxType;
  /** Two-digit place-of-supply state code when known; else the shop's state. */
  posStateCode?: string | null;
  lines: Gstr1Line[];
  /** Export / SEZ bill (Industrial mode). */
  supplyType?: Gstr1SupplyType | null;
  /** Export bill: shipping bill details as saved on the bill. */
  exportDetails?: Gstr1ExportDetails | null;
};

/** Sale return = credit note; a debit note uses the same shape. */
export type Gstr1Note = Gstr1Bill;

export type Gstr1Document = { number: string; cancelled: boolean };

export type Gstr1Input = {
  shopGstin: string;
  /** yyyy-mm-dd, inclusive. Must be one calendar month or one GST quarter. */
  fromYmd: string;
  toYmd: string;
  bills: Gstr1Bill[];
  notes: Gstr1Note[];
  /** Sales debit notes (rate difference, freight…): tax exclusive, added to the period's tax. */
  debitNotes?: Gstr1Note[];
  /** Every bill / credit note / debit note number issued in the period, cancelled ones included, for Table 13. */
  documents: { invoices: Gstr1Document[]; creditNotes: Gstr1Document[]; debitNotes?: Gstr1Document[] };
  /** Shop under ₹5 crore turnover may leave HSN off retail (B2C) lines. */
  skipB2cHsn?: boolean;
};

export type Gstr1Issue = {
  code:
    | "shop_gstin"
    | "period"
    | "buyer_gstin"
    | "partial_gstin"
    | "invoice_number"
    | "missing_hsn"
    | "bad_hsn"
    | "negative_b2cs"
    | "negative_hsn"
    | "nil_rated"
    | "unknown_uqc"
    | "sez_gstin"
    | "lut_tax"
    | "shipping_bill"
    | "empty";
  message: string;
  /** Bill numbers / product names this issue is about (first few). */
  refs?: string[];
};

type RateHeads = { rt: number; txval: number; iamt: number; camt: number; samt: number };

export type Gstr1Json = {
  gstin: string;
  fp: string;
  version: string;
  hash: string;
  b2b: Array<{ ctin: string; inv: Gstr1Invoice[] }>;
  b2cl: Array<{ pos: string; inv: Gstr1Invoice[] }>;
  b2cs: Array<{ sply_ty: "INTRA" | "INTER"; rt: number; typ: "OE"; pos: string; txval: number; iamt: number; camt: number; samt: number; csamt: number }>;
  /** Exports (Table 6A); written only when the period has export bills. */
  exp?: Array<{ exp_typ: "WPAY" | "WOPAY"; inv: Gstr1ExportInvoice[] }>;
  nil?: { inv: Array<{ sply_ty: "INTRB2B" | "INTRAB2B" | "INTRB2C" | "INTRAB2C"; nil_amt: number; expt_amt: number; ngsup_amt: number }> };
  cdnr: Array<{ ctin: string; nt: Gstr1CreditNote[] }>;
  cdnur: Array<Gstr1CreditNote & { typ: "B2CL" }>;
  hsn: { hsn_b2b: Gstr1HsnRow[]; hsn_b2c: Gstr1HsnRow[] };
  doc_issue: { doc_det: Array<{ doc_num: number; docs: Array<{ num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number }> }> };
};

export type Gstr1Item = { num: number; itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number } };
export type Gstr1Invoice = { inum: string; idt: string; val: number; pos: string; rchrg: "N"; inv_typ: "R" | "SEWP" | "SEWOP"; itms: Gstr1Item[] };
export type Gstr1ExportInvoice = {
  inum: string;
  idt: string;
  val: number;
  sbpcode?: string;
  sbnum?: number;
  sbdt?: string;
  itms: Array<{ rt: number; txval: number; iamt: number; csamt: number }>;
};
export type Gstr1CreditNote = { ntty: "C" | "D"; nt_num: string; nt_dt: string; pos: string; rchrg: "N"; inv_typ: "R"; val: number; itms: Gstr1Item[] };
export type Gstr1HsnRow = { num: number; hsn_sc: string; desc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };

export type Gstr1Build = {
  /** Null while there is an error. */
  json: Gstr1Json | null;
  fp: string;
  errors: Gstr1Issue[];
  warnings: Gstr1Issue[];
  summary: {
    b2bInvoices: number;
    b2clInvoices: number;
    b2csRows: number;
    cdnrNotes: number;
    cdnurNotes: number;
    /** How many of the CDNR / CDNUR notes are debit notes (note type D). */
    debitNotes: number;
    /** Export bills (EXP table). */
    expInvoices: number;
    /** SEZ bills (in B2B as SEWP / SEWOP). */
    sezInvoices: number;
    hsnRows: number;
    docSeries: number;
    taxable: number;
    tax: number;
  };
};

/** Version string the government Offline Tool writes; the portal has accepted other tools' older values too. */
export const GSTR1_JSON_VERSION = "GST3.2.1";
/** Offline Tool files carry a literal "hash" placeholder. */
export const GSTR1_JSON_HASH = "hash";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Last character of a GSTIN per the GSTN mod-36 rule. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_ALPHABET.indexOf(first14[i]);
    if (value < 0) return "";
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

/** Format + checksum. The portal rejects a B2B invoice whose buyer GSTIN fails either. */
export function isValidGstin(raw: string | null | undefined): boolean {
  const gstin = String(raw || "").trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) return false;
  const state = Number(gstin.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return false;
  return gstinCheckDigit(gstin.slice(0, 14)) === gstin[14];
}

/** HSN (goods) 4 / 6 / 8 digits; SAC (services) 6 digits. */
export function isValidHsn(raw: string | null | undefined): boolean {
  const hsn = String(raw || "").trim();
  return /^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn);
}

/** Portal UQC codes the product unit maps to. */
const UQC_BY_UNIT: Record<string, string> = {
  pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS", nos: "NOS", no: "NOS", number: "NOS", numbers: "NOS", unit: "UNT", units: "UNT", unt: "UNT",
  mtr: "MTR", mtrs: "MTR", m: "MTR", meter: "MTR", meters: "MTR", metre: "MTR", metres: "MTR",
  kg: "KGS", kgs: "KGS", kilogram: "KGS", kilograms: "KGS", gm: "GMS", gms: "GMS", gram: "GMS", grams: "GMS",
  ltr: "LTR", ltrs: "LTR", litre: "LTR", liter: "LTR", litres: "LTR", liters: "LTR", ml: "MLT", mlt: "MLT",
  set: "SET", sets: "SET", pair: "PRS", pairs: "PRS", prs: "PRS", box: "BOX", boxes: "BOX",
  pack: "PAC", packs: "PAC", pkt: "PAC", packet: "PAC", packets: "PAC", pac: "PAC",
  dozen: "DOZ", dozens: "DOZ", dz: "DOZ", doz: "DOZ", roll: "ROL", rolls: "ROL", rol: "ROL",
  bag: "BAG", bags: "BAG", bundle: "BDL", bundles: "BDL", bdl: "BDL", carton: "CTN", cartons: "CTN", ctn: "CTN",
  bottle: "BTL", bottles: "BTL", btl: "BTL", can: "CAN", cans: "CAN", tube: "TUB", tubes: "TUB", tub: "TUB",
  sqft: "SQF", sqf: "SQF", sqm: "SQM", sqmtr: "SQM", yard: "YDS", yards: "YDS", yds: "YDS", ton: "TON", tons: "TON",
  qtl: "QTL", quintal: "QTL", cm: "CMS", cms: "CMS", sheet: "NOS", sheets: "NOS",
  service: "NA", services: "NA", na: "NA", oth: "OTH", other: "OTH", others: "OTH",
};

/** `null` when the unit is not one the portal knows (caller reports it and uses OTH). */
export function uqcForUnit(unit: string | null | undefined): string | null {
  const key = String(unit || "").trim().toLowerCase().replace(/[.\s-]+/g, "");
  if (!key) return "PCS";
  return UQC_BY_UNIT[key] || null;
}

/** Bill time as the IST calendar day, dd-mm-yyyy. */
export function portalDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value);
  }
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, mo, da] = ymd.split("-");
  return `${da}-${mo}-${y}`;
}

/**
 * Return period "MMYYYY". One calendar month, or one GST quarter (Apr–Jun, Jul–Sep,
 * Oct–Dec, Jan–Mar) whose period is its last month. Null for any other range.
 */
export function filingPeriod(fromYmd: string, toYmd: string): string | null {
  const from = fromYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const to = toYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!from || !to) return null;
  const [fy, fm, fd] = [Number(from[1]), Number(from[2]), Number(from[3])];
  const [ty, tm, td] = [Number(to[1]), Number(to[2]), Number(to[3])];
  if (fd !== 1) return null;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (td !== lastDay) return null;
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  if (months === 1) return `${String(tm).padStart(2, "0")}${ty}`;
  if (months === 3 && (fm - 1) % 3 === 0) return `${String(tm).padStart(2, "0")}${ty}`;
  return null;
}

/** Portal invoice number: up to 16 characters, letters, digits, "/" and "-". */
export function isValidDocNumber(num: string | null | undefined): boolean {
  return /^[A-Za-z0-9/-]{1,16}$/.test(String(num || ""));
}

type Series = { prefix: string; docs: Array<{ number: string; ordinal: number; cancelled: boolean }> };

/** Group document numbers by the text before their trailing digits ("POS/26-27/" of "POS/26-27/123"). */
export function documentSeries(docs: readonly Gstr1Document[]): Series[] {
  const byPrefix = new Map<string, Series>();
  for (const doc of docs) {
    const number = String(doc.number || "").trim();
    if (!number) continue;
    const m = number.match(/^(.*?)(\d+)$/);
    const prefix = m ? m[1] : number;
    const ordinal = m ? Number(m[2]) : 0;
    const series = byPrefix.get(prefix) || { prefix, docs: [] };
    series.docs.push({ number, ordinal, cancelled: !!doc.cancelled });
    byPrefix.set(prefix, series);
  }
  const out = [...byPrefix.values()];
  out.forEach((s) => s.docs.sort((a, b) => a.ordinal - b.ordinal || a.number.localeCompare(b.number)));
  return out.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

function addRate(map: Map<number, RateHeads>, rate: number, taxable: number, gst: number, inter: boolean, sign = 1) {
  const row = map.get(rate) || { rt: rate, txval: 0, iamt: 0, camt: 0, samt: 0 };
  row.txval += sign * taxable;
  if (inter) row.iamt += sign * gst;
  else {
    row.camt += (sign * gst) / 2;
    row.samt += (sign * gst) / 2;
  }
  map.set(rate, row);
}

/** `allowZero`: a zero-rated bill under LUT reports its 0% lines in its own table. */
function itemsFromRates(map: Map<number, RateHeads>, allowZero = false): Gstr1Item[] {
  return [...map.values()]
    .filter((r) => (allowZero ? r.rt >= 0 : r.rt > 0) && Math.abs(r.txval) >= 0.005)
    .sort((a, b) => a.rt - b.rt)
    .map((r, i) => ({
      num: i + 1,
      itm_det: { rt: r.rt, txval: round2(r.txval), iamt: round2(r.iamt), camt: round2(r.camt), samt: round2(r.samt), csamt: 0 },
    }));
}

type HsnAcc = Gstr1HsnRow & { names: Map<string, number> };

const ZERO_RATED_TYPES: readonly Gstr1SupplyType[] = ["SEZWP", "SEZWOP", "EXPWP", "EXPWOP"];

/** The bill's export / SEZ supply, or null for a regular bill. */
export function zeroRatedSupplyOf(bill: Pick<Gstr1Bill, "supplyType">): Gstr1SupplyType | null {
  const t = bill.supplyType;
  return t && (ZERO_RATED_TYPES as readonly string[]).includes(t) ? t : null;
}

function pushRefs(issues: Gstr1Issue[], code: Gstr1Issue["code"], message: string, refs: string[]) {
  if (refs.length === 0) return;
  const uniq = [...new Set(refs)];
  issues.push({ code, message: `${message} (${uniq.length})`, refs: uniq.slice(0, 25) });
}

export function buildGstr1Json(input: Gstr1Input): Gstr1Build {
  const errors: Gstr1Issue[] = [];
  const warnings: Gstr1Issue[] = [];
  const shopGstin = String(input.shopGstin || "").trim().toUpperCase();
  const shopState = extractStateCode(shopGstin);

  if (!isValidGstin(shopGstin)) {
    errors.push({ code: "shop_gstin", message: "Shop GSTIN is missing or not valid. Fix it in Settings → Business Info before downloading." });
  }
  const fp = filingPeriod(input.fromYmd, input.toYmd);
  if (!fp) {
    errors.push({ code: "period", message: "Pick one full month (or one quarter: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar). GSTR-1 is filed per period." });
  }

  const badGstinBills: string[] = [];
  const partialGstinBills: string[] = [];
  const badNumbers: string[] = [];
  const missingHsnProducts: string[] = [];
  const missingHsnB2cProducts: string[] = [];
  const badHsnProducts: string[] = [];
  const unknownUnits: string[] = [];
  const nilBills: string[] = [];
  const sezNoGstinBills: string[] = [];
  const lutTaxBills: string[] = [];
  const noShippingBills: string[] = [];
  const badShippingBills: string[] = [];

  const b2bMap = new Map<string, Gstr1Invoice[]>();
  const b2clMap = new Map<string, Gstr1Invoice[]>();
  const b2csMap = new Map<string, { sply_ty: "INTRA" | "INTER"; pos: string; rates: Map<number, RateHeads> }>();
  const cdnrMap = new Map<string, Gstr1CreditNote[]>();
  const cdnur: Array<Gstr1CreditNote & { typ: "B2CL" }> = [];
  const hsnB2b = new Map<string, HsnAcc>();
  const hsnB2c = new Map<string, HsnAcc>();
  const nil = { INTRB2B: 0, INTRAB2B: 0, INTRB2C: 0, INTRAB2C: 0 };
  const expMap = new Map<"WPAY" | "WOPAY", Gstr1ExportInvoice[]>();

  const classify = (doc: Gstr1Bill) => {
    const gstin = String(doc.gstin || "").trim().toUpperCase();
    const registered = isValidGstin(gstin);
    if (!registered && gstin.length === 15) badGstinBills.push(doc.number);
    else if (!registered && gstin) partialGstinBills.push(doc.number);
    const inter = registered ? isInterState(shopGstin, gstin) : !!doc.posStateCode && !!shopState && doc.posStateCode !== shopState;
    const pos = registered ? extractStateCode(gstin) || shopState : String(doc.posStateCode || "").trim() || shopState;
    if (!isValidDocNumber(doc.number)) badNumbers.push(doc.number || "(blank)");
    return { gstin, registered, inter, pos };
  };

  const addHsn = (
    target: Map<string, HsnAcc>,
    line: Gstr1Line,
    rate: number,
    taxable: number,
    gst: number,
    inter: boolean,
    sign: number,
  ) => {
    const hsn = String(line.hsn || "").trim();
    const mapped = uqcForUnit(line.uom);
    if (mapped === null) unknownUnits.push(String(line.uom));
    const uqc = mapped || "OTH";
    const key = `${hsn}|${rate}|${uqc}`;
    const row = target.get(key) || {
      num: 0, hsn_sc: hsn, desc: "", uqc, qty: 0, rt: rate, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0, names: new Map<string, number>(),
    };
    row.qty += sign * (Number(line.qty) || 0);
    row.txval += sign * taxable;
    if (inter) row.iamt += sign * gst;
    else {
      row.camt += (sign * gst) / 2;
      row.samt += (sign * gst) / 2;
    }
    const name = String(line.productName || "").trim();
    if (name) row.names.set(name, (row.names.get(name) || 0) + 1);
    target.set(key, row);
  };

  /** Rate-wise split of one document; HSN rows and nil amounts are written as a side effect. */
  const rateSplit = (doc: Gstr1Bill, registered: boolean, inter: boolean, sign: number, zeroRated = false) => {
    const rates = new Map<number, RateHeads>();
    let nilAmount = 0;
    for (const line of doc.lines) {
      const value = Number(line.value) || 0;
      const rate = doc.taxType === "no_gst" ? 0 : Number(line.rate) || 0;
      const { taxable, gst } = splitLineValue(value, rate, doc.taxType);
      const hsn = String(line.hsn || "").trim();
      const name = String(line.productName || "").trim() || "(unnamed product)";
      if (!hsn) {
        if (registered || !input.skipB2cHsn) missingHsnProducts.push(name);
        else missingHsnB2cProducts.push(name);
      } else if (!isValidHsn(hsn)) {
        badHsnProducts.push(`${name}: ${hsn}`);
      }
      if (rate <= 0 && !zeroRated) {
        nilAmount += sign * taxable;
      } else {
        addRate(rates, rate, taxable, gst, inter, sign);
      }
      if (hsn) addHsn(registered ? hsnB2b : hsnB2c, line, rate, taxable, gst, inter, sign);
    }
    if (nilAmount !== 0) {
      const key = `${inter ? "INTR" : "INTRA"}${registered ? "B2B" : "B2C"}` as keyof typeof nil;
      nil[key] += nilAmount;
      nilBills.push(doc.number);
    }
    return rates;
  };

  /** Shipping bill fields of an export invoice: all three, or none (the portal wants them together). */
  const shippingFields = (bill: Gstr1Bill): Pick<Gstr1ExportInvoice, "sbpcode" | "sbnum" | "sbdt"> => {
    const d = bill.exportDetails || {};
    const port = String(d.portCode || "").trim().toUpperCase();
    const sbNo = String(d.shipBillNo || "").trim();
    const sbDt = String(d.shipBillDate || "").trim();
    if (!port && !sbNo && !sbDt) {
      noShippingBills.push(bill.number);
      return {};
    }
    if (/^[A-Z0-9]{6}$/.test(port) && /^\d{3,7}$/.test(sbNo) && /^\d{4}-\d{2}-\d{2}$/.test(sbDt)) {
      return { sbpcode: port, sbnum: Number(sbNo), sbdt: portalDate(sbDt) };
    }
    badShippingBills.push(bill.number);
    return {};
  };

  /** Export bill → EXP; SEZ bill → B2B as SEWP / SEWOP. Always IGST. */
  const addZeroRatedBill = (bill: Gstr1Bill, supply: Gstr1SupplyType) => {
    const exportBill = supply === "EXPWP" || supply === "EXPWOP";
    const withoutTax = supply === "EXPWOP" || supply === "SEZWOP";
    if (!isValidDocNumber(bill.number)) badNumbers.push(bill.number || "(blank)");
    const gstin = String(bill.gstin || "").trim().toUpperCase();
    if (!exportBill && !isValidGstin(gstin)) {
      sezNoGstinBills.push(bill.number);
      return;
    }
    // Export lines count as unregistered (HSN B2C); SEZ lines as registered (HSN B2B).
    const rates = rateSplit(bill, !exportBill, true, 1, true);
    if (withoutTax && [...rates.values()].some((r) => Math.abs(r.iamt) >= 0.005)) lutTaxBills.push(bill.number);
    const itms = itemsFromRates(rates, true);
    if (itms.length === 0) return;
    if (exportBill) {
      const typ = withoutTax ? "WOPAY" : "WPAY";
      const list = expMap.get(typ) || [];
      list.push({
        inum: bill.number,
        idt: portalDate(bill.date),
        val: round2(bill.billValue),
        ...shippingFields(bill),
        itms: itms.map((it) => ({ rt: it.itm_det.rt, txval: it.itm_det.txval, iamt: it.itm_det.iamt, csamt: 0 })),
      });
      expMap.set(typ, list);
      return;
    }
    const inv: Gstr1Invoice = {
      inum: bill.number,
      idt: portalDate(bill.date),
      val: round2(bill.billValue),
      pos: extractStateCode(gstin) || shopState,
      rchrg: "N",
      inv_typ: withoutTax ? "SEWOP" : "SEWP",
      itms,
    };
    const list = b2bMap.get(gstin) || [];
    list.push(inv);
    b2bMap.set(gstin, list);
  };

  for (const bill of input.bills) {
    const supply = zeroRatedSupplyOf(bill);
    if (supply) {
      addZeroRatedBill(bill, supply);
      continue;
    }
    const { gstin, registered, inter, pos } = classify(bill);
    const rates = rateSplit(bill, registered, inter, 1);
    const itms = itemsFromRates(rates);
    if (itms.length === 0) continue; // nothing taxable: nil-rated only
    const inv: Gstr1Invoice = { inum: bill.number, idt: portalDate(bill.date), val: round2(bill.billValue), pos, rchrg: "N", inv_typ: "R", itms };
    if (registered) {
      const list = b2bMap.get(gstin) || [];
      list.push(inv);
      b2bMap.set(gstin, list);
    } else if (inter && Number(bill.billValue) > 250000) {
      const list = b2clMap.get(pos) || [];
      list.push(inv);
      b2clMap.set(pos, list);
    } else {
      const sply_ty = inter ? "INTER" : "INTRA";
      const key = `${sply_ty}|${pos}`;
      const bucket = b2csMap.get(key) || { sply_ty, pos, rates: new Map<number, RateHeads>() };
      rates.forEach((r, rate) => addRate(bucket.rates, rate, r.txval, r.iamt + r.camt + r.samt, inter));
      b2csMap.set(key, bucket);
    }
  }

  for (const note of input.notes) {
    const { gstin, registered, inter, pos } = classify(note);
    if (registered) {
      const rates = rateSplit(note, true, inter, -1);
      // CDNR carries positive note amounts; the sign above only nets the HSN summary.
      const positive = new Map<number, RateHeads>();
      rates.forEach((r, rate) => positive.set(rate, { rt: rate, txval: -r.txval, iamt: -r.iamt, camt: -r.camt, samt: -r.samt }));
      const itms = itemsFromRates(positive);
      if (itms.length === 0) continue;
      const nt: Gstr1CreditNote = { ntty: "C", nt_num: note.number, nt_dt: portalDate(note.date), pos, rchrg: "N", inv_typ: "R", val: round2(note.billValue), itms };
      const list = cdnrMap.get(gstin) || [];
      list.push(nt);
      cdnrMap.set(gstin, list);
    } else if (inter && Number(note.billValue) > 250000) {
      const rates = rateSplit(note, false, inter, -1);
      const positive = new Map<number, RateHeads>();
      rates.forEach((r, rate) => positive.set(rate, { rt: rate, txval: -r.txval, iamt: -r.iamt, camt: -r.camt, samt: -r.samt }));
      const itms = itemsFromRates(positive);
      if (itms.length === 0) continue;
      cdnur.push({ typ: "B2CL", ntty: "C", nt_num: note.number, nt_dt: portalDate(note.date), pos, rchrg: "N", inv_typ: "R", val: round2(note.billValue), itms });
    } else {
      // Netted into B2CS: the portal has no credit-note row for small retail buyers.
      const rates = rateSplit(note, false, inter, -1);
      const sply_ty = inter ? "INTER" : "INTRA";
      const key = `${sply_ty}|${pos}`;
      const bucket = b2csMap.get(key) || { sply_ty, pos, rates: new Map<number, RateHeads>() };
      rates.forEach((r, rate) => addRate(bucket.rates, rate, r.txval, r.iamt + r.camt + r.samt, inter));
      b2csMap.set(key, bucket);
    }
  }

  for (const note of input.debitNotes ?? []) {
    const { gstin, registered, inter, pos } = classify(note);
    // A debit note adds to the period, so its lines go in at +1 (sales direction).
    const rates = rateSplit(note, registered, inter, 1);
    if (registered || (inter && Number(note.billValue) > 250000)) {
      const itms = itemsFromRates(rates);
      if (itms.length === 0) continue;
      const nt: Gstr1CreditNote = { ntty: "D", nt_num: note.number, nt_dt: portalDate(note.date), pos, rchrg: "N", inv_typ: "R", val: round2(note.billValue), itms };
      if (registered) {
        const list = cdnrMap.get(gstin) || [];
        list.push(nt);
        cdnrMap.set(gstin, list);
      } else {
        cdnur.push({ typ: "B2CL", ...nt });
      }
    } else {
      const sply_ty = inter ? "INTER" : "INTRA";
      const key = `${sply_ty}|${pos}`;
      const bucket = b2csMap.get(key) || { sply_ty, pos, rates: new Map<number, RateHeads>() };
      rates.forEach((r, rate) => addRate(bucket.rates, rate, r.txval, r.iamt + r.camt + r.samt, inter));
      b2csMap.set(key, bucket);
    }
  }

  // ── Issues ──
  pushRefs(errors, "buyer_gstin", "Buyer GSTIN fails the GST checksum: correct it on the customer, or clear it to bill as B2C", badGstinBills);
  pushRefs(warnings, "partial_gstin", "Buyer GSTIN is not 15 characters; these bills are reported as B2C", partialGstinBills);
  pushRefs(errors, "invoice_number", "Bill number must be 1–16 characters: letters, digits, / and -", badNumbers);
  pushRefs(errors, "missing_hsn", "Products without an HSN code: add the HSN in the product master", missingHsnProducts);
  pushRefs(warnings, "missing_hsn", "Retail (B2C) lines without HSN left out of the HSN summary", missingHsnB2cProducts);
  pushRefs(errors, "bad_hsn", "HSN must be 4, 6 or 8 digits (SAC 6 digits)", badHsnProducts);
  pushRefs(warnings, "unknown_uqc", "Product unit not in the GST unit list; reported as OTH", unknownUnits);
  pushRefs(warnings, "nil_rated", "0% / No-GST amounts reported as nil-rated (Table 8). If they are exempt goods, move them on the portal", nilBills);
  pushRefs(errors, "sez_gstin", "SEZ bills need the SEZ unit's valid GSTIN on the customer", sezNoGstinBills);
  pushRefs(errors, "lut_tax", "Export / SEZ bills under LUT carry GST on their lines: set GST 0% on the bill, or change the supply to \"with IGST\"", lutTaxBills);
  pushRefs(warnings, "shipping_bill", "Export bills without shipping bill details: add them on the portal once the shipping bill is issued", noShippingBills);
  pushRefs(warnings, "shipping_bill", "Shipping bill details left out of the file: the portal wants a 6-character port code, a 3–7 digit shipping bill number and its date", badShippingBills);

  const b2cs = [...b2csMap.values()]
    .flatMap((bucket) =>
      [...bucket.rates.values()]
        .filter((r) => r.rt > 0 && Math.abs(r.txval) >= 0.005)
        .map((r) => ({
          sply_ty: bucket.sply_ty,
          rt: r.rt,
          typ: "OE" as const,
          pos: bucket.pos,
          txval: round2(r.txval),
          iamt: round2(r.iamt),
          camt: round2(r.camt),
          samt: round2(r.samt),
          csamt: 0,
        })),
    )
    .sort((a, b) => a.pos.localeCompare(b.pos) || a.sply_ty.localeCompare(b.sply_ty) || a.rt - b.rt);
  const negativeB2cs = b2cs.filter((r) => r.txval < 0);
  if (negativeB2cs.length > 0) {
    warnings.push({
      code: "negative_b2cs",
      message: `Retail returns exceed retail sales at ${negativeB2cs.map((r) => `${r.rt}%`).join(", ")}: the B2CS row is negative. The portal accepts this; check it is expected.`,
    });
  }

  const finishHsn = (map: Map<string, HsnAcc>): Gstr1HsnRow[] =>
    [...map.values()]
      .filter((r) => Math.abs(r.txval) >= 0.005 || Math.abs(r.qty) >= 0.0005)
      .sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.rt - b.rt)
      .map((r, i) => {
        let desc = "";
        let best = 0;
        r.names.forEach((count, name) => {
          if (count > best) {
            best = count;
            desc = name;
          }
        });
        return {
          num: i + 1,
          hsn_sc: r.hsn_sc,
          desc: desc.slice(0, 30),
          uqc: r.uqc,
          qty: Math.round(r.qty * 1000) / 1000,
          rt: r.rt,
          txval: round2(r.txval),
          iamt: round2(r.iamt),
          camt: round2(r.camt),
          samt: round2(r.samt),
          csamt: 0,
        };
      });
  const hsn_b2b = finishHsn(hsnB2b);
  const hsn_b2c = finishHsn(hsnB2c);
  pushRefs(
    warnings,
    "negative_hsn",
    "HSN rows where returns exceed sales (negative quantity or value)",
    [...hsn_b2b, ...hsn_b2c].filter((r) => r.txval < 0 || r.qty < 0).map((r) => `${r.hsn_sc} @ ${r.rt}%`),
  );

  const seriesDocs = (docs: readonly Gstr1Document[]) =>
    documentSeries(docs).map((s, i) => {
      const cancel = s.docs.filter((d) => d.cancelled).length;
      return {
        num: i + 1,
        from: s.docs[0].number,
        to: s.docs[s.docs.length - 1].number,
        totnum: s.docs.length,
        cancel,
        net_issue: s.docs.length - cancel,
      };
    });
  const invoiceSeries = seriesDocs(input.documents.invoices);
  const noteSeries = seriesDocs(input.documents.creditNotes);
  const debitSeries = seriesDocs(input.documents.debitNotes ?? []);
  const doc_det: Gstr1Json["doc_issue"]["doc_det"] = [];
  if (invoiceSeries.length) doc_det.push({ doc_num: 1, docs: invoiceSeries });
  // Table 13 nature 4 = debit notes, 5 = credit notes.
  if (debitSeries.length) doc_det.push({ doc_num: 4, docs: debitSeries });
  if (noteSeries.length) doc_det.push({ doc_num: 5, docs: noteSeries });

  const b2b = [...b2bMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ctin, inv]) => ({ ctin, inv }));
  const b2cl = [...b2clMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pos, inv]) => ({ pos, inv }));
  const cdnr = [...cdnrMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ctin, nt]) => ({ ctin, nt }));
  const exp = (["WPAY", "WOPAY"] as const)
    .filter((typ) => (expMap.get(typ) || []).length > 0)
    .map((typ) => ({ exp_typ: typ, inv: expMap.get(typ) || [] }));
  const nilRows = (Object.keys(nil) as Array<keyof typeof nil>)
    .filter((k) => Math.abs(nil[k]) >= 0.005)
    .map((k) => ({ sply_ty: k, nil_amt: round2(nil[k]), expt_amt: 0, ngsup_amt: 0 }));

  const summary = {
    b2bInvoices: b2b.reduce((n, c) => n + c.inv.length, 0),
    b2clInvoices: b2cl.reduce((n, c) => n + c.inv.length, 0),
    b2csRows: b2cs.length,
    cdnrNotes: cdnr.reduce((n, c) => n + c.nt.length, 0),
    cdnurNotes: cdnur.length,
    debitNotes: cdnr.reduce((n, c) => n + c.nt.filter((x) => x.ntty === "D").length, 0) + cdnur.filter((x) => x.ntty === "D").length,
    expInvoices: exp.reduce((n, e) => n + e.inv.length, 0),
    sezInvoices: b2b.reduce((n, c) => n + c.inv.filter((i) => i.inv_typ !== "R").length, 0),
    hsnRows: hsn_b2b.length + hsn_b2c.length,
    docSeries: invoiceSeries.length + noteSeries.length + debitSeries.length,
    taxable: 0,
    tax: 0,
  };
  const addItem = (it: Gstr1Item, sign: number) => {
    summary.taxable += sign * it.itm_det.txval;
    summary.tax += sign * (it.itm_det.iamt + it.itm_det.camt + it.itm_det.samt);
  };
  b2b.forEach((c) => c.inv.forEach((i) => i.itms.forEach((it) => addItem(it, 1))));
  b2cl.forEach((c) => c.inv.forEach((i) => i.itms.forEach((it) => addItem(it, 1))));
  b2cs.forEach((r) => {
    summary.taxable += r.txval;
    summary.tax += r.iamt + r.camt + r.samt;
  });
  exp.forEach((e) =>
    e.inv.forEach((i) =>
      i.itms.forEach((it) => {
        summary.taxable += it.txval;
        summary.tax += it.iamt;
      }),
    ),
  );
  // Credit notes reduce the period's tax; debit notes add to it.
  cdnr.forEach((c) => c.nt.forEach((n) => n.itms.forEach((it) => addItem(it, n.ntty === "D" ? 1 : -1))));
  cdnur.forEach((n) => n.itms.forEach((it) => addItem(it, n.ntty === "D" ? 1 : -1)));
  summary.taxable = round2(summary.taxable);
  summary.tax = round2(summary.tax);

  if (summary.b2bInvoices + summary.b2clInvoices + summary.b2csRows + summary.expInvoices + summary.cdnrNotes + summary.cdnurNotes + nilRows.length === 0) {
    warnings.push({ code: "empty", message: "No GST sales in this period. A NIL GSTR-1 is filed on the portal directly; no file is needed." });
  }

  const json: Gstr1Json | null =
    errors.length > 0 || !fp
      ? null
      : {
          gstin: shopGstin,
          fp,
          version: GSTR1_JSON_VERSION,
          hash: GSTR1_JSON_HASH,
          b2b,
          b2cl,
          b2cs,
          ...(exp.length ? { exp } : {}),
          ...(nilRows.length ? { nil: { inv: nilRows } } : {}),
          cdnr,
          cdnur,
          hsn: { hsn_b2b, hsn_b2c },
          doc_issue: { doc_det },
        };

  return { json, fp: fp || "", errors, warnings, summary };
}
