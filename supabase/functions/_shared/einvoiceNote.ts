/**
 * E-invoice (IRN) for debit and credit notes (Industrial mode, Phase 2 step 2),
 * and for export / SEZ sale bills (Phase 2 step 3).
 *
 * Shared by the einvoice-note edge function and the app (pre-checks, 30-day
 * warning, cancel window). Pure: no Deno, browser or Supabase APIs, so vitest
 * can test it and the edge function can import it.
 *
 * The NIC schema is the same one sale bills use (generate-einvoice), with
 * DocDtls.Typ "DBN" or "CRN" and the original invoice in RefDtls.PrecDocDtls.
 * Notes are tax exclusive: each line's taxable value is stored, GST is on top.
 * Export and SEZ bills are "INV" with SupTyp SEZWP / SEZWOP / EXPWP / EXPWOP:
 * always IGST; an export buyer is URP with state and place of supply 96.
 */

export type NoteDocType = "DBN" | "CRN" | "INV";

/** IRP supply type (TranDtls.SupTyp). Deemed export (DEXP) is not offered yet. */
export type IrpSupplyType = "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP";

const IRP_SUPPLY_TYPES: IrpSupplyType[] = ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP"];

/** Supply type saved on a sale bill (sales.b2b_details.supply_type); "B2B" when none. */
export function irpSupplyTypeOf(b2bDetails: unknown): IrpSupplyType {
  const v = b2bDetails && typeof b2bDetails === "object" ? (b2bDetails as Record<string, unknown>).supply_type : null;
  return typeof v === "string" && (IRP_SUPPLY_TYPES as string[]).includes(v) ? (v as IrpSupplyType) : "B2B";
}

export const isExportSupplyType = (t: IrpSupplyType | null | undefined): boolean => t === "EXPWP" || t === "EXPWOP";
export const isSezSupplyType = (t: IrpSupplyType | null | undefined): boolean => t === "SEZWP" || t === "SEZWOP";

/** Shipping bill, port, buyer country and foreign currency of an export bill (all optional at the IRP). */
export interface ExportDocDetails {
  shipBillNo?: string | null;
  /** yyyy-mm-dd */
  shipBillDate?: string | null;
  portCode?: string | null;
  countryCode?: string | null;
  currency?: string | null;
  foreignValue?: number | null;
}

export interface NoteParty {
  gstin: string;
  name: string;
  address: string;
  phone?: string | null;
  email?: string | null;
}

export interface NoteLineInput {
  description: string;
  hsn: string;
  qty: number;
  /** Unit price before tax. */
  rate: number;
  taxable: number;
  gstPercent: number;
  gstAmount: number;
  /** UQC code, e.g. NOS. Defaults to OTH (value-only lines). */
  unit?: string;
}

export interface NoteInput {
  docType: NoteDocType;
  number: string;
  /** yyyy-mm-dd (a longer ISO string is cut to the day). */
  date: string;
  interState: boolean;
  /** Rounded total of the note, as saved. */
  netAmount: number;
  lines: NoteLineInput[];
  remarks?: string | null;
  againstInvoice?: { number: string; date: string | null } | null;
  /** Default B2B. Export / SEZ always charge IGST, whatever interState says. */
  supplyType?: IrpSupplyType;
  /** Freight and other charges on the bill (not taxed), added to the total. */
  otherCharges?: number | null;
  exportDetails?: ExportDocDetails | null;
}

export type NotePayloadResult =
  | { ok: true; payload: NoteEInvoicePayload }
  | { ok: false; code: string; error: string };

export interface NoteEInvoicePayload {
  Version: string;
  TranDtls: { TaxSch: string; SupTyp: string; RegRev: string; EcmGstin: null; IgstOnIntra: string };
  DocDtls: { Typ: NoteDocType; No: string; Dt: string };
  SellerDtls: Record<string, unknown>;
  BuyerDtls: Record<string, unknown>;
  ItemList: Array<Record<string, unknown>>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
    TotInvValFc?: number;
  };
  RefDtls?: { InvRm?: string; PrecDocDtls?: Array<{ InvNo: string; InvDt: string }> };
  ExpDtls?: Record<string, string | number>;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export const GSTIN_PATTERN = /^[0-9]{2}[0-9A-Z]{13}$/;
/** IRP document number: 1 to 16 characters, letters, digits, / and -, not starting with 0, / or -. */
export const IRP_DOC_NO_PATTERN = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;

export function cleanGstin(v: string | null | undefined): string {
  return String(v ?? "").trim().toUpperCase();
}

/** First 6-digit run in an address as a PIN code (100000-999999), else null. */
export function extractPin(address: string | null | undefined): number | null {
  const m = String(address ?? "").match(/\d{6}/);
  const pin = m ? parseInt(m[0], 10) : NaN;
  return pin >= 100000 && pin <= 999999 ? pin : null;
}

/** dd/mm/yyyy from yyyy-mm-dd (or a longer ISO string); "" when not a date. */
export function irpDate(iso: string | null | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

function text(v: string | null | undefined, max: number, fallback: string): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s.length >= 3 ? s : fallback;
}

function phoneDigits(v: string | null | undefined): string | undefined {
  const d = String(v ?? "").replace(/\D/g, "");
  const p = d.length > 12 ? d.slice(-10) : d;
  return p.length >= 6 && p.length <= 12 ? p : undefined;
}

function emailOk(v: string | null | undefined): string | undefined {
  const s = String(v ?? "").trim();
  return s.length >= 6 && s.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined;
}

/** Address split into the IRP's two 100-character lines, plus a place name. */
function addressParts(address: string | null | undefined) {
  const flat = String(address ?? "").replace(/\s+/g, " ").trim();
  const addr1 = text(flat.slice(0, 100), 100, "Address Not Provided");
  const rest = flat.slice(100, 200).trim();
  const lastPart = flat.split(",").pop()?.trim() ?? "";
  return {
    Addr1: addr1,
    ...(rest.length >= 3 ? { Addr2: rest } : {}),
    Loc: text(lastPart, 50, "City"),
  };
}

function party(p: NoteParty, pin: number, stateCode: string) {
  const name = text(p.name, 100, "Customer");
  const ph = phoneDigits(p.phone);
  const em = emailOk(p.email);
  return {
    Gstin: cleanGstin(p.gstin),
    LglNm: name,
    TrdNm: name,
    ...addressParts(p.address),
    Pin: pin,
    Stcd: stateCode,
    ...(ph ? { Ph: ph } : {}),
    ...(em ? { Em: em } : {}),
  };
}

const NOTE_WORD: Record<NoteDocType, string> = { DBN: "debit note", CRN: "credit note", INV: "bill" };

/** Overseas buyer at the IRP: no GSTIN, state and place of supply "Other country". */
const EXPORT_BUYER = { gstin: "URP", state: "96", pin: 999999 };

function exportDetailsPayload(e: ExportDocDetails | null | undefined): Record<string, string | number> | null {
  if (!e) return null;
  const out: Record<string, string | number> = {};
  const sb = String(e.shipBillNo ?? "").replace(/"/g, "").trim().slice(0, 20);
  if (sb) out.ShipBNo = sb;
  const sbDt = irpDate(e.shipBillDate ?? null);
  if (sbDt) out.ShipBDt = sbDt;
  const port = String(e.portCode ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{2,10}$/.test(port)) out.Port = port;
  const country = String(e.countryCode ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) out.CntCode = country;
  const cur = String(e.currency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3,16}$/.test(cur)) out.ForCur = cur;
  return Object.keys(out).length ? out : null;
}

/**
 * NIC payload for a debit or credit note, or the first problem the shop must fix.
 * Totals are rebuilt from the lines so every IRP sum check holds exactly; the
 * difference to the saved (rounded) total goes to RndOffAmt.
 */
export function buildNoteEInvoicePayload(note: NoteInput, seller: NoteParty, buyer: NoteParty): NotePayloadResult {
  const word = NOTE_WORD[note.docType];
  const supply: IrpSupplyType = note.supplyType ?? "B2B";
  const exportSupply = isExportSupplyType(supply);
  const zeroRated = exportSupply || isSezSupplyType(supply);
  const withoutTax = supply === "SEZWOP" || supply === "EXPWOP";
  const sellerGstin = cleanGstin(seller.gstin);
  const buyerGstin = exportSupply ? EXPORT_BUYER.gstin : cleanGstin(buyer.gstin);
  if (!GSTIN_PATTERN.test(sellerGstin)) {
    return { ok: false, code: "SELLER_GSTIN", error: "Shop GSTIN missing or wrong. Fix it in Settings > Business Details." };
  }
  if (exportSupply && GSTIN_PATTERN.test(cleanGstin(buyer.gstin))) {
    return {
      ok: false,
      code: "EXPORT_BUYER",
      error: `This customer has an Indian GSTIN (${cleanGstin(buyer.gstin)}). An export bill is for a buyer abroad: pick SEZ if the buyer is an SEZ unit, or Regular.`,
    };
  }
  // An export buyer is URP: no GSTIN checks.
  if (!exportSupply) {
    if (!buyerGstin) {
      return {
        ok: false,
        code: "BUYER_GSTIN",
        error: isSezSupplyType(supply)
          ? "This customer has no GSTIN. An SEZ unit has one: add it in the customer master."
          : `This customer has no GSTIN. An IRN is only for a ${word} to a registered buyer.`,
      };
    }
    if (!GSTIN_PATTERN.test(buyerGstin)) {
      return { ok: false, code: "BUYER_GSTIN", error: `Customer GSTIN ${buyerGstin} doesn't look right (15 characters). Fix it in the customer master.` };
    }
    if (buyerGstin === sellerGstin) {
      return { ok: false, code: "BUYER_GSTIN", error: "Customer GSTIN is the same as the shop GSTIN." };
    }
  }
  const number = String(note.number ?? "").trim();
  if (!IRP_DOC_NO_PATTERN.test(number)) {
    return {
      ok: false,
      code: "DOC_NO",
      error: `Number ${number || "(blank)"} can't go to the IRP: it takes up to 16 letters, digits, / and -.`,
    };
  }
  const dt = irpDate(note.date);
  if (!dt) return { ok: false, code: "DOC_DATE", error: `The ${word} has no date.` };

  const sellerPin = extractPin(seller.address);
  if (!sellerPin) {
    return { ok: false, code: "SELLER_PIN", error: "Shop PIN code missing. Add the 6-digit PIN to the address in Settings > Business Details." };
  }
  const buyerPin = exportSupply ? EXPORT_BUYER.pin : extractPin(buyer.address);
  if (!buyerPin) {
    return { ok: false, code: "BUYER_PIN", error: "Customer PIN code missing. Add the 6-digit PIN to this customer's address, then try again." };
  }

  const sellerState = sellerGstin.slice(0, 2);
  const buyerState = exportSupply ? EXPORT_BUYER.state : buyerGstin.slice(0, 2);
  const gstinsInterState = sellerState !== buyerState;
  // Export and SEZ supplies are inter-state by law (IGST), even to an SEZ in the shop's own state.
  const inter = zeroRated ? true : note.interState;
  if (!zeroRated && gstinsInterState !== note.interState) {
    return {
      ok: false,
      code: "INTER_STATE",
      error: note.interState
        ? `The ${word} charges IGST, but the shop and customer GSTINs are both from state ${sellerState}. Edit it and turn off Inter-state.`
        : `The ${word} charges CGST + SGST, but the customer GSTIN is from state ${buyerState} and the shop from ${sellerState}. Edit it and turn on Inter-state.`,
    };
  }

  if (!note.lines.length) return { ok: false, code: "NO_LINES", error: `The ${word} has no lines.` };
  const items: Array<Record<string, unknown>> = [];
  let assVal = 0;
  let cgstVal = 0;
  let sgstVal = 0;
  let igstVal = 0;
  for (const [i, l] of note.lines.entries()) {
    const row = `Line ${i + 1}`;
    const hsn = String(l.hsn ?? "").trim();
    if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)) {
      return {
        ok: false,
        code: "HSN",
        error: `${row} needs an HSN / SAC code of 4, 6 or 8 digits for the IRP${hsn ? ` (it has ${hsn})` : ""}. Edit the ${word} and add it.`,
      };
    }
    const taxable = round2(num(l.taxable));
    if (taxable <= 0) return { ok: false, code: "LINE_VALUE", error: `${row} has no value.` };
    const gstRate = num(l.gstPercent);
    const gst = round2(num(l.gstAmount));
    if (withoutTax && gst > 0) {
      return {
        ok: false,
        code: "LUT_TAX",
        error: `Under LUT / bond the ${word} can't charge GST, but ${row.toLowerCase()} has ₹${gst} GST. Set GST 0% on every line, or pick the "with IGST" supply type on the bill.`,
      };
    }
    const half = round2(gst / 2);
    const cgst = inter ? 0 : half;
    const sgst = inter ? 0 : half;
    const igst = inter ? gst : 0;
    const qty = round3(num(l.qty)) || 1;
    const service = hsn.startsWith("99");
    const desc = String(l.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    items.push({
      SlNo: String(i + 1),
      PrdDesc: desc.length >= 3 ? desc : desc.padEnd(3, "."),
      IsServc: service ? "Y" : "N",
      HsnCd: hsn,
      Qty: qty,
      FreeQty: 0,
      Unit: (l.unit || "OTH").toUpperCase(),
      UnitPrice: round3(num(l.rate) || taxable / qty),
      TotAmt: taxable,
      Discount: 0,
      PreTaxVal: taxable,
      AssAmt: taxable,
      GstRt: gstRate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: round2(taxable + cgst + sgst + igst),
    });
    assVal += taxable;
    cgstVal += cgst;
    sgstVal += sgst;
    igstVal += igst;
  }
  assVal = round2(assVal);
  cgstVal = round2(cgstVal);
  sgstVal = round2(sgstVal);
  igstVal = round2(igstVal);
  const othChrg = round2(Math.max(0, num(note.otherCharges)));
  const net = round2(num(note.netAmount));
  const linesTotal = round2(assVal + cgstVal + sgstVal + igstVal + othChrg);
  const roundOff = round2(net - linesTotal);
  if (Math.abs(roundOff) >= 100) {
    return {
      ok: false,
      code: "TOTAL",
      error: `The ${word} total ₹${net} doesn't match its lines (₹${linesTotal}). Open and save it again.`,
    };
  }

  const remarks = String(note.remarks ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const againstNo = String(note.againstInvoice?.number ?? "").trim();
  const againstDt = irpDate(note.againstInvoice?.date ?? null);
  const prec = againstNo && againstDt && IRP_DOC_NO_PATTERN.test(againstNo) ? [{ InvNo: againstNo, InvDt: againstDt }] : null;
  const refDtls =
    remarks.length >= 3 || prec ? { ...(remarks.length >= 3 ? { InvRm: remarks } : {}), ...(prec ? { PrecDocDtls: prec } : {}) } : null;

  const expDtls = exportSupply ? exportDetailsPayload(note.exportDetails) : null;
  const foreignValue = exportSupply ? round2(num(note.exportDetails?.foreignValue)) : 0;

  const payload: NoteEInvoicePayload = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: supply, RegRev: "N", EcmGstin: null, IgstOnIntra: "N" },
    DocDtls: { Typ: note.docType, No: number, Dt: dt },
    SellerDtls: party({ ...seller, gstin: sellerGstin }, sellerPin, sellerState),
    BuyerDtls: { ...party({ ...buyer, gstin: buyerGstin }, buyerPin, buyerState), Pos: buyerState },
    ItemList: items,
    ValDtls: {
      AssVal: assVal,
      CgstVal: cgstVal,
      SgstVal: sgstVal,
      IgstVal: igstVal,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: othChrg,
      RndOffAmt: roundOff,
      TotInvVal: net,
      ...(foreignValue > 0 ? { TotInvValFc: foreignValue } : {}),
    },
    ...(refDtls ? { RefDtls: refDtls } : {}),
    ...(expDtls ? { ExpDtls: expDtls } : {}),
  };
  return { ok: true, payload };
}

/** The first problem stopping an IRN, or null (the app's pre-check; no union narrowing needed). */
export function noteEInvoiceProblem(note: NoteInput, seller: NoteParty, buyer: NoteParty): string | null {
  const r = buildNoteEInvoicePayload(note, seller, buyer);
  return r.ok === true ? null : (r as { error: string }).error;
}

/* ------------------------------------------------------------------ */
/* Stored debit note (sales.debit_note_details) to a NoteInput          */
/* ------------------------------------------------------------------ */

const DN_REASON_TEXT: Record<string, string> = {
  rate_difference: "Rate difference",
  freight: "Freight / packing charged later",
  short_billed: "Quantity short billed",
  interest: "Interest on late payment",
  other: "Other",
};

/** NoteInput for a saved debit note; null when its stored details are missing. */
export function debitNoteToNoteInput(
  sale: { sale_number: string; sale_date: string; net_amount: number | null },
  rawDetails: unknown,
): NoteInput | null {
  if (!rawDetails || typeof rawDetails !== "object") return null;
  const d = rawDetails as Record<string, unknown>;
  if (!Array.isArray(d.lines)) return null;
  const reason = String(d.reason ?? "");
  const reasonNote = String(d.reason_note ?? "").trim();
  const shortBilled = reason === "short_billed";
  const lines: NoteLineInput[] = (d.lines as unknown[]).map((x) => {
    const l = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const hsn = String(l.hsn ?? "").trim();
    return {
      description: String(l.description ?? ""),
      hsn,
      qty: num(l.qty),
      rate: num(l.rate),
      taxable: num(l.taxable),
      gstPercent: num(l.gst_percent),
      gstAmount: num(l.gst_amount),
      // Only a short-billed quantity moves goods; other notes change value only.
      unit: shortBilled && !hsn.startsWith("99") ? "NOS" : "OTH",
    };
  });
  const reasonText = DN_REASON_TEXT[reason] ?? "";
  return {
    docType: "DBN",
    number: sale.sale_number,
    date: String(sale.sale_date ?? "").slice(0, 10),
    interState: d.inter_state === true,
    netAmount: num(sale.net_amount),
    lines,
    remarks: [reasonText, reasonNote].filter(Boolean).join(": "),
    againstInvoice: {
      number: String(d.against_sale_number ?? ""),
      date: typeof d.against_sale_date === "string" ? d.against_sale_date : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Sale return (credit note) to a NoteInput                             */
/* ------------------------------------------------------------------ */

export interface SaleReturnForNote {
  return_number: string | null;
  return_date: string;
  net_amount: number | null;
  gross_amount: number | null;
  gst_amount: number | null;
  original_sale_number: string | null;
  notes?: string | null;
}

export interface SaleReturnItemForNote {
  product_name: string | null;
  hsn_code: string | null;
  quantity: number | null;
  line_total: number | null;
  gst_percent: number | null;
  is_dc_item?: boolean | null;
  deleted_at?: string | null;
  /** IRP unit (UQC) from the product master, worked out by the caller (_shared/uqc.ts). Default PCS. */
  unit?: string | null;
}

/**
 * A sale return saves tax-inclusive lines (net = gross) or tax-exclusive ones (net = gross + GST);
 * the row does not store which, so it is read from the totals.
 */
export function saleReturnTaxInclusive(ret: Pick<SaleReturnForNote, "net_amount" | "gross_amount" | "gst_amount">): boolean {
  const gst = num(ret.gst_amount);
  if (gst <= 0) return true;
  const net = num(ret.net_amount);
  const gross = num(ret.gross_amount);
  return Math.abs(net - gross) <= Math.abs(net - (gross + gst));
}

/**
 * NoteInput (CRN) for a saved sale return. Challan (DC) lines carry no GST and are left out.
 * The place of supply follows the GSTINs, so the caller passes interState from them.
 */
export function saleReturnToNoteInput(
  ret: SaleReturnForNote,
  items: SaleReturnItemForNote[],
  opts: {
    interState: boolean;
    originalSaleDate: string | null;
    /** sales.b2b_details of the original bill: a return of an export / SEZ bill is reported the same way. */
    originalB2bDetails?: unknown;
  },
): NoteInput | null {
  const live = items.filter((i) => !i.deleted_at && !i.is_dc_item);
  if (live.length === 0) return null;
  const inclusive = saleReturnTaxInclusive(ret);
  const lines: NoteLineInput[] = live.map((i) => {
    const total = num(i.line_total);
    const rate = num(i.gst_percent);
    const taxable = inclusive ? round2(total / (1 + rate / 100)) : round2(total);
    const gstAmount = inclusive ? round2(total - taxable) : round2((total * rate) / 100);
    const qty = num(i.quantity) || 1;
    return {
      description: String(i.product_name ?? ""),
      hsn: String(i.hsn_code ?? "").trim(),
      qty,
      rate: round3(taxable / qty),
      taxable,
      gstPercent: rate,
      gstAmount,
      unit: String(i.unit ?? "").trim() || "PCS",
    };
  });
  const lineSum = round2(lines.reduce((s, l) => s + l.taxable + l.gstAmount, 0));
  // With challan lines mixed in, the saved total also holds them: report the GST lines only.
  const netAmount = live.length === items.filter((i) => !i.deleted_at).length ? num(ret.net_amount) : lineSum;
  return {
    docType: "CRN",
    number: String(ret.return_number ?? ""),
    date: String(ret.return_date ?? "").slice(0, 10),
    interState: opts.interState,
    netAmount,
    lines,
    remarks: String(ret.notes ?? "").trim() || "Goods returned",
    againstInvoice: ret.original_sale_number
      ? { number: String(ret.original_sale_number), date: opts.originalSaleDate }
      : null,
    ...returnSupplyFields(opts.originalB2bDetails),
  };
}

/** Supply type of a return of an export / SEZ bill; export: port, country and currency of the bill. */
function returnSupplyFields(b2bDetails: unknown): Pick<NoteInput, "supplyType" | "exportDetails"> {
  const supplyType = irpSupplyTypeOf(b2bDetails);
  if (supplyType === "B2B") return {};
  if (!isExportSupplyType(supplyType)) return { supplyType };
  const d = b2bDetails as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    supplyType,
    exportDetails: { portCode: text(d.port_code), countryCode: text(d.country_code), currency: text(d.currency) },
  };
}

/* ------------------------------------------------------------------ */
/* Export / SEZ sale bill to a NoteInput (Phase 2 step 3)               */
/* ------------------------------------------------------------------ */

export interface SaleBillForIrn {
  sale_number: string | null;
  sale_date: string;
  net_amount: number | null;
  flat_discount_amount?: number | null;
  other_charges?: number | null;
  round_off?: number | null;
  notes?: string | null;
  b2b_details?: unknown;
}

export interface SaleBillItemForIrn {
  product_name: string | null;
  hsn_code: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  gst_percent: number | null;
  is_dc_item?: boolean | null;
  deleted_at?: string | null;
  /** IRP unit (UQC) from the product master, worked out by the caller (_shared/uqc.ts). Default PCS / OTH. */
  unit?: string | null;
}

/**
 * NoteInput (INV) for a saved export / SEZ bill made on Sale Invoice.
 *
 * Sale Invoice saves each line_total with GST in it (inclusive and exclusive bills alike). The bill
 * discounts (flat discount, points) are spread over the lines in proportion, so the IRN total is the
 * bill's own net: lines + other charges + round off. A bill with challan (DC) lines, which carry no
 * GST, reports its GST lines only, with the flat discount taken off each in the bill's ratio.
 */
export function saleBillToIrnInput(sale: SaleBillForIrn, items: SaleBillItemForIrn[]): NoteInput | null {
  const all = items.filter((i) => !i.deleted_at);
  const live = all.filter((i) => !i.is_dc_item);
  if (live.length === 0) return null;
  const otherCharges = Math.max(0, num(sale.other_charges));
  const roundOff = num(sale.round_off);
  const saved = num(sale.net_amount);
  const linesSum = live.reduce((sum, i) => sum + num(i.line_total), 0);
  const target = saved - otherCharges - roundOff;
  const scaleToNet = live.length === all.length && linesSum > 0 && target > 0 && target <= linesSum + 1;
  let keep: number;
  if (scaleToNet) {
    keep = target / linesSum;
  } else {
    const gross = all.reduce((sum, i) => sum + num(i.unit_price) * num(i.quantity), 0);
    const flat = Math.max(0, num(sale.flat_discount_amount));
    keep = gross > 0 ? 1 - Math.min(1, flat / gross) : 1;
  }
  const lines: NoteLineInput[] = live.map((i) => {
    const value = num(i.line_total) * keep;
    const rate = num(i.gst_percent);
    const taxable = round2(value / (1 + rate / 100));
    const gstAmount = round2(value - taxable);
    const qty = num(i.quantity) || 1;
    const hsn = String(i.hsn_code ?? "").trim();
    return {
      description: String(i.product_name ?? ""),
      hsn,
      qty,
      rate: round3(taxable / qty),
      taxable,
      gstPercent: rate,
      gstAmount,
      unit: String(i.unit ?? "").trim() || (hsn.startsWith("99") ? "OTH" : "PCS"),
    };
  });
  const fromLines = round2(lines.reduce((s, l) => s + l.taxable + l.gstAmount, 0) + otherCharges + roundOff);
  const supplyType = irpSupplyTypeOf(sale.b2b_details);
  const d = (sale.b2b_details && typeof sale.b2b_details === "object" ? sale.b2b_details : {}) as Record<string, unknown>;
  return {
    docType: "INV",
    number: String(sale.sale_number ?? ""),
    date: String(sale.sale_date ?? "").slice(0, 10),
    interState: true,
    netAmount: scaleToNet ? saved : fromLines,
    lines,
    remarks: String(sale.notes ?? "").trim() || null,
    againstInvoice: null,
    supplyType,
    otherCharges,
    exportDetails: isExportSupplyType(supplyType)
      ? {
          shipBillNo: typeof d.ship_bill_no === "string" ? d.ship_bill_no : null,
          shipBillDate: typeof d.ship_bill_date === "string" ? d.ship_bill_date : null,
          portCode: typeof d.port_code === "string" ? d.port_code : null,
          countryCode: typeof d.country_code === "string" ? d.country_code : null,
          currency: typeof d.currency === "string" ? d.currency : null,
          foreignValue: d.foreign_value == null ? null : num(d.foreign_value),
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Time limits                                                          */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

/** India date (yyyy-mm-dd). */
export function indiaTodayIso(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/**
 * Shops with turnover of ₹10 crore or more (from 1 April 2025) cannot report a
 * document older than 30 days to the IRP: a note dated 1st must get its IRN by the 30th.
 */
export const IRN_REPORTING_DAYS = 30;

export function irnReportingWindow(docDate: string, now = new Date()): { lastDay: string; daysLeft: number; late: boolean } | null {
  const d = String(docDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const docMs = Date.parse(`${d}T00:00:00Z`);
  const todayMs = Date.parse(`${indiaTodayIso(now)}T00:00:00Z`);
  const lastMs = docMs + (IRN_REPORTING_DAYS - 1) * DAY_MS;
  const daysLeft = Math.round((lastMs - todayMs) / DAY_MS);
  return { lastDay: new Date(lastMs).toISOString().slice(0, 10), daysLeft, late: daysLeft < 0 };
}

/** The IRP lets an IRN be cancelled for 24 hours after its acknowledgement. */
export function irnCancelHoursLeft(ackAt: string | null | undefined, now = new Date()): number {
  const t = ackAt ? Date.parse(ackAt) : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round(((t + DAY_MS - now.getTime()) / 3_600_000) * 10) / 10);
}

/**
 * IRP acknowledgement time ("2026-11-02 10:15:00" or "02/11/2026 10:15:00", India time)
 * as an ISO instant; null when it can't be read.
 */
export function parseIrpDateTime(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  let y: string, mo: string, d: string, h: string, mi: string, se: string;
  if (m) {
    [, y, mo, d, h, mi, se] = m as unknown as string[];
  } else {
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    [, d, mo, y, h, mi, se] = m as unknown as string[];
  }
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se || "00"}+05:30`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/* ------------------------------------------------------------------ */
/* PeriOne responses                                                    */
/* ------------------------------------------------------------------ */

function detailText(details: unknown): string {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) {
    return details
      .map((e) => {
        const r = (e ?? {}) as Record<string, unknown>;
        const msg = String(r.ErrorMessage ?? r.message ?? "");
        const code = r.ErrorCode ? `${r.ErrorCode}: ` : "";
        return msg ? `${code}${msg}` : JSON.stringify(e);
      })
      .join("; ");
  }
  const r = details as Record<string, unknown>;
  return String(r.ErrorMessage ?? r.message ?? JSON.stringify(details));
}

/** Readable error from a PeriOne / IRP response. */
export function perioneErrorText(resp: unknown, fallback = "The IRP did not accept it"): string {
  const r = (resp ?? {}) as Record<string, unknown>;
  return (
    detailText(r.ErrorDetails) ||
    (typeof r.status_desc === "string" ? r.status_desc : "") ||
    detailText(r.error) ||
    (typeof r.message === "string" ? r.message : "") ||
    fallback
  );
}

export function perioneSucceeded(resp: unknown): boolean {
  const r = (resp ?? {}) as Record<string, unknown>;
  const data = (r.data ?? null) as Record<string, unknown> | null;
  return r.status_cd === "Success" || String(r.status_cd) === "1" || !!data?.Irn;
}

/**
 * When the IRP already holds an IRN for this number (error 2150) it sends that IRN back
 * in InfoDtls; null otherwise.
 */
export function duplicateIrnInfo(resp: unknown): { irn: string; ackNo: string; ackDt: string } | null {
  const r = (resp ?? {}) as Record<string, unknown>;
  const info = Array.isArray(r.InfoDtls) ? (r.InfoDtls as unknown[]) : [];
  for (const x of info) {
    const e = (x ?? {}) as Record<string, unknown>;
    if (String(e.InfCd ?? "").toUpperCase() !== "DUPIRN") continue;
    const desc = (e.Desc ?? {}) as Record<string, unknown>;
    const irn = String(desc.Irn ?? "");
    if (irn) return { irn, ackNo: String(desc.AckNo ?? ""), ackDt: String(desc.AckDt ?? "") };
  }
  return null;
}

/** IRP cancel reasons. */
export const IRN_CANCEL_REASONS = [
  { code: "1", label: "Duplicate" },
  { code: "2", label: "Data entry mistake" },
  { code: "3", label: "Order cancelled" },
  { code: "4", label: "Other" },
] as const;
