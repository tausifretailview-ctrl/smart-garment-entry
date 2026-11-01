/**
 * Industrial mode, Phase 2 step 1: sales debit note (GST section 34).
 *
 * A debit note raises what a customer owes after the bill: a rate difference,
 * freight charged later, a short-billed quantity, interest. It is saved as a
 * `sales` row with sale_type "debit_note" (number DN/yy-yy/N, no stock lines),
 * so party balance, customer ledger, outstanding and receipts treat it like a
 * credit bill with no extra code. The GST lines and the original invoice live
 * in sales.debit_note_details.
 */

export const DEBIT_NOTE_SALE_TYPE = "debit_note";
export const DEBIT_NOTE_NUMBER_PREFIX = "DN";

export const DEBIT_NOTE_REASONS = [
  { value: "rate_difference", label: "Rate difference (price increase)", line: "Rate difference" },
  { value: "freight", label: "Freight / packing charged later", line: "Freight charges" },
  { value: "short_billed", label: "Quantity short billed", line: "Short billed quantity" },
  { value: "interest", label: "Interest on late payment", line: "Interest on late payment" },
  { value: "other", label: "Other", line: "" },
] as const;

export type DebitNoteReason = (typeof DEBIT_NOTE_REASONS)[number]["value"];

/** GST rates offered on a debit note line (old 12% / 28% stay for notes against older bills). */
export const DEBIT_NOTE_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

export function isDebitNoteReason(v: unknown): v is DebitNoteReason {
  return typeof v === "string" && DEBIT_NOTE_REASONS.some((r) => r.value === v);
}

export function debitNoteReasonLabel(v: string | null | undefined): string {
  return DEBIT_NOTE_REASONS.find((r) => r.value === v)?.label ?? "";
}

export function debitNoteReasonLine(v: string | null | undefined): string {
  return DEBIT_NOTE_REASONS.find((r) => r.value === v)?.line ?? "";
}

export function isDebitNoteSale(sale: { sale_type?: string | null } | null | undefined): boolean {
  return sale?.sale_type === DEBIT_NOTE_SALE_TYPE;
}

/* ------------------------------------------------------------------ */
/* Lines and totals                                                    */
/* ------------------------------------------------------------------ */

/** One line as typed in the form (strings, so half-typed numbers survive). */
export type DebitNoteLineForm = {
  key: string;
  description: string;
  hsn: string;
  qty: string;
  rate: string;
  gst_percent: string;
};

export type DebitNoteLine = {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  taxable: number;
  gst_percent: number;
  gst_amount: number;
};

export type DebitNoteTotals = {
  lines: DebitNoteLine[];
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  net: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function num(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

let lineSeq = 0;
export function newDebitNoteLineForm(patch: Partial<DebitNoteLineForm> = {}): DebitNoteLineForm {
  lineSeq += 1;
  return { key: `dn-${Date.now()}-${lineSeq}`, description: "", hsn: "", qty: "1", rate: "", gst_percent: "18", ...patch };
}

/** A line counts once it has a description or an amount. */
function isFilled(l: DebitNoteLineForm): boolean {
  return l.description.trim() !== "" || num(l.rate) !== 0;
}

/**
 * Taxable = qty x rate; GST per line at 2 decimals (same rounding as Sale Invoice,
 * exclusive tax); total rounded to the whole rupee.
 */
export function computeDebitNote(forms: DebitNoteLineForm[], interState: boolean): DebitNoteTotals {
  const lines: DebitNoteLine[] = forms.filter(isFilled).map((l) => {
    const qty = num(l.qty) || 0;
    const rate = num(l.rate);
    const taxable = round2(qty * rate);
    const gstPercent = num(l.gst_percent);
    return {
      description: l.description.trim(),
      hsn: l.hsn.trim().toUpperCase(),
      qty,
      rate,
      taxable,
      gst_percent: gstPercent,
      gst_amount: round2((taxable * gstPercent) / 100),
    };
  });
  const taxable = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const gst = round2(lines.reduce((s, l) => s + l.gst_amount, 0));
  const half = round2(gst / 2);
  const beforeRound = round2(taxable + gst);
  const net = Math.round(beforeRound);
  return {
    lines,
    taxable,
    gst,
    cgst: interState ? 0 : half,
    sgst: interState ? 0 : round2(gst - half),
    igst: interState ? gst : 0,
    roundOff: round2(net - beforeRound),
    net,
  };
}

export type DebitNoteFormCheck = {
  customerId: string | null | undefined;
  againstSaleNumber: string;
  reason: string;
  forms: DebitNoteLineForm[];
};

/** First problem a person must fix before saving, or null. */
export function validateDebitNote(f: DebitNoteFormCheck): string | null {
  if (!f.customerId) return "Pick the customer.";
  if (!f.againstSaleNumber.trim()) return "Pick or type the original invoice number (GST needs it on the note).";
  if (!isDebitNoteReason(f.reason)) return "Pick a reason.";
  const filled = f.forms.filter(isFilled);
  if (filled.length === 0) return "Add at least one line.";
  for (const [i, l] of filled.entries()) {
    const row = `Line ${i + 1}`;
    if (!l.description.trim()) return `${row}: add a description.`;
    if (num(l.qty) <= 0) return `${row}: quantity must be more than 0.`;
    if (num(l.rate) <= 0) return `${row}: rate must be more than 0.`;
    if (!(DEBIT_NOTE_GST_RATES as readonly number[]).includes(num(l.gst_percent))) return `${row}: pick a GST rate.`;
    const hsn = l.hsn.trim();
    if (hsn && !/^\d{4,8}$/.test(hsn)) return `${row}: HSN / SAC should be 4 to 8 digits.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Stored details (sales.debit_note_details)                           */
/* ------------------------------------------------------------------ */

export type DebitNoteDetails = {
  v: 1;
  against_sale_id: string | null;
  against_sale_number: string;
  against_sale_date: string | null;
  reason: DebitNoteReason;
  reason_note: string;
  inter_state: boolean;
  lines: DebitNoteLine[];
  taxable_total: number;
  gst_total: number;
};

export function buildDebitNoteDetails(input: {
  againstSaleId: string | null;
  againstSaleNumber: string;
  againstSaleDate: string | null;
  reason: DebitNoteReason;
  reasonNote: string;
  interState: boolean;
  totals: DebitNoteTotals;
}): DebitNoteDetails {
  return {
    v: 1,
    against_sale_id: input.againstSaleId,
    against_sale_number: input.againstSaleNumber.trim().slice(0, 40),
    against_sale_date: input.againstSaleDate ? input.againstSaleDate.slice(0, 10) : null,
    reason: input.reason,
    reason_note: input.reasonNote.trim().slice(0, 200),
    inter_state: input.interState,
    lines: input.totals.lines,
    taxable_total: input.totals.taxable,
    gst_total: input.totals.gst,
  };
}

/** Reads a stored value defensively; null when it is not a debit note's details. */
export function parseDebitNoteDetails(raw: unknown): DebitNoteDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines)) return null;
  const lines: DebitNoteLine[] = (r.lines as unknown[]).map((x) => {
    const l = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      description: String(l.description ?? ""),
      hsn: String(l.hsn ?? ""),
      qty: num(l.qty as number),
      rate: num(l.rate as number),
      taxable: num(l.taxable as number),
      gst_percent: num(l.gst_percent as number),
      gst_amount: num(l.gst_amount as number),
    };
  });
  return {
    v: 1,
    against_sale_id: typeof r.against_sale_id === "string" ? r.against_sale_id : null,
    against_sale_number: String(r.against_sale_number ?? ""),
    against_sale_date: typeof r.against_sale_date === "string" ? r.against_sale_date : null,
    reason: isDebitNoteReason(r.reason) ? r.reason : "other",
    reason_note: String(r.reason_note ?? ""),
    inter_state: r.inter_state === true,
    lines,
    taxable_total: num(r.taxable_total as number),
    gst_total: num(r.gst_total as number),
  };
}

export function debitNoteDetailsToForms(d: DebitNoteDetails): DebitNoteLineForm[] {
  return d.lines.map((l) =>
    newDebitNoteLineForm({
      description: l.description,
      hsn: l.hsn,
      qty: String(l.qty),
      rate: String(l.rate),
      gst_percent: String(l.gst_percent),
    }),
  );
}

function ddmmyyyy(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Note line printed on the debit note: original invoice and reason. */
export function debitNotePrintNote(d: DebitNoteDetails, extraNotes?: string | null): string {
  const date = ddmmyyyy(d.against_sale_date);
  const parts = [
    `Against Invoice ${d.against_sale_number}${date ? ` dated ${date}` : ""}`,
    `Reason: ${debitNoteReasonLabel(d.reason)}${d.reason_note ? ` - ${d.reason_note}` : ""}`,
  ];
  const extra = (extraNotes ?? "").trim();
  if (extra) parts.push(extra);
  return parts.join(". ");
}

/** Lines in the shape InvoiceWrapper prints (exclusive tax: total = taxable). */
export function debitNotePrintItems(d: DebitNoteDetails) {
  return d.lines.map((l, i) => ({
    sr: i + 1,
    particulars: l.description,
    productName: l.description,
    size: "",
    barcode: "",
    hsn: l.hsn,
    sp: l.rate,
    qty: l.qty,
    rate: l.rate,
    total: l.taxable,
    gstPercent: l.gst_percent,
    discountPercent: 0,
  }));
}

/** Still to collect on a debit note (receipts update paid_amount like any credit bill). */
export function debitNoteBalance(net: number | null | undefined, paid: number | null | undefined): number {
  return Math.max(0, round2(num(net ?? 0) - num(paid ?? 0)));
}
