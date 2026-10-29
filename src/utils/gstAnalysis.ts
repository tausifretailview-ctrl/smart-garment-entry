/**
 * GST Analysis — month-wise GST payable, worked out the way GSTR-3B is filed.
 *
 * Output tax  = GST on sale bills − GST on sale returns (credit notes)
 * Input credit = GST on purchase bills − GST on purchase returns (debit notes)
 * Payable in cash = output tax left after ITC is set off in the Rule 88A order.
 *
 * DC (No GST) bills and lines never come in here; the loader drops them.
 */
import { isInterState, type GstTaxType } from "@/utils/gstRegisterUtils";

export type GstHeads = { igst: number; cgst: number; sgst: number };

export type GstRateRow = GstHeads & { rate: number; taxable: number };

export type GstDocRow = GstHeads & {
  id: string;
  date: string;
  number: string;
  party: string;
  gstin: string;
  /** Party has a 15-character GSTIN. */
  registered: boolean;
  interState: boolean;
  taxable: number;
  /** Bill amount as saved (incl. GST, round off, charges). */
  billValue: number;
  rates: GstRateRow[];
};

export const emptyHeads = (): GstHeads => ({ igst: 0, cgst: 0, sgst: 0 });

export const totalTax = (h: GstHeads): number => h.igst + h.cgst + h.sgst;

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export const hasValidGstinLength = (gstin: string | null | undefined): boolean =>
  String(gstin || "").trim().length === 15;

/** Taxable value + GST of one line amount. */
export function splitLineValue(
  value: number,
  rate: number,
  taxType: GstTaxType,
): { taxable: number; gst: number } {
  const v = Number(value) || 0;
  const r = Number(rate) || 0;
  if (taxType === "no_gst" || r <= 0) return { taxable: v, gst: 0 };
  if (taxType === "exclusive") return { taxable: v, gst: (v * r) / 100 };
  const taxable = v / (1 + r / 100);
  return { taxable, gst: v - taxable };
}

function addToRate(map: Map<number, GstRateRow>, rate: number, taxable: number, gst: number, inter: boolean) {
  const row = map.get(rate) || { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  row.taxable += taxable;
  if (inter) row.igst += gst;
  else {
    row.cgst += gst / 2;
    row.sgst += gst / 2;
  }
  map.set(rate, row);
}

function finishDoc(
  base: Omit<GstDocRow, "rates" | "taxable" | "igst" | "cgst" | "sgst">,
  map: Map<number, GstRateRow>,
): GstDocRow {
  const rates = [...map.values()].sort((a, b) => a.rate - b.rate);
  return {
    ...base,
    rates,
    taxable: rates.reduce((s, r) => s + r.taxable, 0),
    igst: rates.reduce((s, r) => s + r.igst, 0),
    cgst: rates.reduce((s, r) => s + r.cgst, 0),
    sgst: rates.reduce((s, r) => s + r.sgst, 0),
  };
}

type DocHeader = {
  id: string;
  date: string;
  number: string;
  party: string;
  gstin: string;
  billValue: number;
};

function docBase(h: DocHeader, shopGstin: string) {
  const gstin = String(h.gstin || "").trim().toUpperCase();
  return {
    ...h,
    gstin,
    registered: hasValidGstinLength(gstin),
    interState: isInterState(shopGstin, gstin),
  };
}

/**
 * Sale bill. The taxable value is after the bill (flat) discount: each line's
 * `discount_share` comes off its line total (CGST Act s.15(3) — discount shown on the invoice).
 * Round off is not taxable value.
 */
export function saleDocTaxes(
  header: DocHeader,
  lines: ReadonlyArray<{ line_total?: number | null; discount_share?: number | null; gst_percent?: number | null }>,
  taxType: GstTaxType,
  shopGstin: string,
): GstDocRow {
  const base = docBase(header, shopGstin);
  const map = new Map<number, GstRateRow>();
  for (const l of lines) {
    const value = (Number(l.line_total) || 0) - (Number(l.discount_share) || 0);
    const rate = taxType === "no_gst" ? 0 : Number(l.gst_percent) || 0;
    const { taxable, gst } = splitLineValue(value, rate, taxType);
    addToRate(map, rate, taxable, gst, base.interState);
  }
  return finishDoc(base, map);
}

/**
 * Sale return (credit note). Lines are split with the original bill's GST mode; when the
 * return header carries a GST amount, the lines are scaled to it so return discounts match
 * what was saved on the credit note.
 */
export function saleReturnDocTaxes(
  header: DocHeader & { headerGst: number },
  lines: ReadonlyArray<{ line_total?: number | null; gst_percent?: number | null }>,
  taxType: GstTaxType,
  shopGstin: string,
): GstDocRow {
  const base = docBase(header, shopGstin);
  const split = lines.map((l) => {
    const rate = taxType === "no_gst" ? 0 : Number(l.gst_percent) || 0;
    return { rate, ...splitLineValue(Number(l.line_total) || 0, rate, taxType) };
  });
  const linesGst = split.reduce((s, x) => s + x.gst, 0);
  const headerGst = Number(header.headerGst) || 0;
  const factor = headerGst > 0 && linesGst > 0 ? headerGst / linesGst : 1;
  const map = new Map<number, GstRateRow>();
  for (const x of split) addToRate(map, x.rate, x.taxable * factor, x.gst * factor, base.interState);
  return finishDoc(base, map);
}

/**
 * Purchase bill or purchase return. Purchase line totals are before GST; the bill discount
 * (header gross − discount = taxable) is spread over the lines in proportion, then GST is
 * charged at each line's rate — the same way Purchase Entry works out the bill GST.
 */
export function purchaseDocTaxes(
  header: DocHeader & { headerTaxable: number | null },
  lines: ReadonlyArray<{ line_total?: number | null; gst_per?: number | null }>,
  shopGstin: string,
): GstDocRow {
  const base = docBase(header, shopGstin);
  const linesTotal = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
  const headerTaxable = Number(header.headerTaxable);
  let factor = linesTotal > 0 && Number.isFinite(headerTaxable) ? headerTaxable / linesTotal : 1;
  // Discounts only lower the value; anything else is old / odd header data — trust the lines.
  if (!(factor > 0) || factor > 1.0001) factor = 1;
  const map = new Map<number, GstRateRow>();
  for (const l of lines) {
    const rate = Number(l.gst_per) || 0;
    const taxable = (Number(l.line_total) || 0) * factor;
    addToRate(map, rate, taxable, (taxable * rate) / 100, base.interState);
  }
  return finishDoc(base, map);
}

/** Rate-wise totals of many documents. */
export function sumByRate(docs: readonly GstDocRow[]): GstRateRow[] {
  const map = new Map<number, GstRateRow>();
  for (const d of docs) {
    for (const r of d.rates) {
      const row = map.get(r.rate) || { rate: r.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      row.taxable += r.taxable;
      row.igst += r.igst;
      row.cgst += r.cgst;
      row.sgst += r.sgst;
      map.set(r.rate, row);
    }
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

export function sumRows<T extends GstHeads & { taxable: number }>(rows: readonly T[]) {
  return rows.reduce(
    (acc, r) => ({
      taxable: acc.taxable + r.taxable,
      igst: acc.igst + r.igst,
      cgst: acc.cgst + r.cgst,
      sgst: acc.sgst + r.sgst,
    }),
    { taxable: 0, ...emptyHeads() },
  );
}

/** Rows a minus rows b, rate by rate (e.g. sales − sale returns). */
export function netByRate(a: readonly GstRateRow[], b: readonly GstRateRow[]): GstRateRow[] {
  const map = new Map<number, GstRateRow>();
  for (const r of a) map.set(r.rate, { ...r });
  for (const r of b) {
    const row = map.get(r.rate) || { rate: r.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    row.taxable -= r.taxable;
    row.igst -= r.igst;
    row.cgst -= r.cgst;
    row.sgst -= r.sgst;
    map.set(r.rate, row);
  }
  return [...map.values()].sort((x, y) => x.rate - y.rate);
}

/** The document cut down to one rate (rate filter); null when it has no line at that rate. */
export function docAtRate(doc: GstDocRow, rate: number | null): GstDocRow | null {
  if (rate == null) return doc;
  const r = doc.rates.find((x) => x.rate === rate);
  if (!r) return null;
  return { ...doc, rates: [r], taxable: r.taxable, igst: r.igst, cgst: r.cgst, sgst: r.sgst };
}

export type GstSetOff = {
  liability: GstHeads;
  credit: GstHeads;
  /** credit head → tax head it paid */
  usedIgst: GstHeads;
  usedCgst: GstHeads;
  usedSgst: GstHeads;
  cash: GstHeads;
  carryForward: GstHeads;
};

/**
 * ITC set-off per CGST Act s.49 / s.49A / s.49B and Rule 88A:
 * - IGST credit is used up first: against IGST, then CGST and SGST (any order or proportion —
 *   it goes where the own CGST / SGST credit falls short first, so the least cash is paid).
 * - CGST credit: CGST, then IGST. SGST credit: SGST, then IGST.
 * - CGST credit never pays SGST and SGST credit never pays CGST.
 * A negative liability (more returns than sales) counts as zero; negative credit is added to the tax.
 */
export function computeGstSetOff(liabilityIn: GstHeads, creditIn: GstHeads): GstSetOff {
  const pos = (n: number) => Math.max(0, Number(n) || 0);
  // Negative credit (more purchase returns than purchases) is ITC to reverse: it adds to the tax.
  const reversal = (head: keyof GstHeads) => pos(-(Number(creditIn[head]) || 0));
  const liability = {
    igst: pos((Number(liabilityIn.igst) || 0) + reversal("igst")),
    cgst: pos((Number(liabilityIn.cgst) || 0) + reversal("cgst")),
    sgst: pos((Number(liabilityIn.sgst) || 0) + reversal("sgst")),
  };
  const credit = { igst: pos(creditIn.igst), cgst: pos(creditIn.cgst), sgst: pos(creditIn.sgst) };
  const left = { ...liability };
  const usedIgst = emptyHeads();
  const usedCgst = emptyHeads();
  const usedSgst = emptyHeads();

  let igstCredit = credit.igst;
  const use = (amount: number, head: keyof GstHeads, used: GstHeads) => {
    const x = Math.min(amount, left[head]);
    left[head] -= x;
    used[head] += x;
    return x;
  };

  igstCredit -= use(igstCredit, "igst", usedIgst);
  // Where own CGST / SGST credit is short, IGST credit fills the gap first.
  igstCredit -= use(Math.min(igstCredit, Math.max(0, left.cgst - credit.cgst)), "cgst", usedIgst);
  igstCredit -= use(Math.min(igstCredit, Math.max(0, left.sgst - credit.sgst)), "sgst", usedIgst);
  // Rule 88A: IGST credit must be used up before CGST / SGST credit is touched.
  igstCredit -= use(igstCredit, "cgst", usedIgst);
  igstCredit -= use(igstCredit, "sgst", usedIgst);

  let cgstCredit = credit.cgst;
  cgstCredit -= use(cgstCredit, "cgst", usedCgst);
  cgstCredit -= use(cgstCredit, "igst", usedCgst);

  let sgstCredit = credit.sgst;
  sgstCredit -= use(sgstCredit, "sgst", usedSgst);
  sgstCredit -= use(sgstCredit, "igst", usedSgst);

  return {
    liability,
    credit,
    usedIgst,
    usedCgst,
    usedSgst,
    cash: left,
    carryForward: { igst: igstCredit, cgst: cgstCredit, sgst: sgstCredit },
  };
}

/** GSTR-3B due date for a monthly filer: 20th of the next month. */
export function gstr3bDueDate(periodEndYmd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodEndYmd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12; next month index = month
  return new Date(year, month, 20);
}
