/**
 * Industrial mode (B2B trading, industrial units, warehouses).
 *
 * Two gates, both needed, so live retail shops never see a change:
 *  1. Platform Admin feature `industrial_mode` on the shop (DEMO first, others on request).
 *  2. Settings > Product > Industrial mode switch (`sale_settings.industrial_mode.enabled`).
 */

export const INDUSTRIAL_MODE_FEATURE = "industrial_mode";

export type CreditLimitAction = "warn" | "block";

export interface IndustrialModeConfig {
  enabled?: boolean;
  /** What happens when a sale bill takes the party over its credit limit. */
  credit_limit_action?: CreditLimitAction;
  /** Fill the bill due date from the party's credit days. */
  auto_due_date?: boolean;
}

export interface IndustrialModeSettings {
  enabled: boolean;
  credit_limit_action: CreditLimitAction;
  auto_due_date: boolean;
}

export const DEFAULT_INDUSTRIAL_MODE: IndustrialModeSettings = {
  enabled: false,
  credit_limit_action: "warn",
  auto_due_date: true,
};

export function resolveIndustrialMode(
  featureEnabled: boolean,
  config: IndustrialModeConfig | null | undefined,
): IndustrialModeSettings {
  if (!featureEnabled || !config?.enabled) return { ...DEFAULT_INDUSTRIAL_MODE };
  return {
    enabled: true,
    credit_limit_action: config.credit_limit_action === "block" ? "block" : "warn",
    auto_due_date: config.auto_due_date !== false,
  };
}

/** Party credit terms kept on the customer row (nullable columns, industrial mode only). */
export interface CustomerCreditTerms {
  credit_limit: number | null;
  credit_days: number | null;
  contact_person: string | null;
  pan_number: string | null;
}

export const EMPTY_CUSTOMER_CREDIT_TERMS: CustomerCreditTerms = {
  credit_limit: null,
  credit_days: null,
  contact_person: null,
  pan_number: null,
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Form text → row values. Throws a plain-language error on bad input. */
export function parseCustomerCreditTermsInput(input: {
  credit_limit: string;
  credit_days: string;
  contact_person: string;
  pan_number: string;
}): CustomerCreditTerms {
  const limitText = input.credit_limit.trim().replace(/,/g, "");
  let credit_limit: number | null = null;
  if (limitText) {
    const n = Number(limitText);
    if (!Number.isFinite(n) || n < 0) throw new Error("Credit limit must be an amount of 0 or more");
    credit_limit = Math.round(n * 100) / 100;
  }

  const daysText = input.credit_days.trim();
  let credit_days: number | null = null;
  if (daysText) {
    const n = Number(daysText);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error("Credit days must be a whole number from 0 to 365");
    credit_days = n;
  }

  const pan = input.pan_number.trim().toUpperCase();
  if (pan && !PAN_RE.test(pan)) throw new Error("PAN must look like ABCDE1234F");

  const contact = input.contact_person.trim();
  return {
    credit_limit,
    credit_days,
    contact_person: contact || null,
    pan_number: pan || null,
  };
}

/**
 * Bill date + credit days (local calendar days). Returned at local noon: Sale Invoice saves
 * `due_date` via toISOString(), and local midnight in India is the previous day in UTC.
 */
export function dueDateFromCreditDays(billDate: Date, creditDays: number | null | undefined): Date {
  const d = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate(), 12);
  const days = Number(creditDays);
  if (Number.isFinite(days) && days > 0) d.setDate(d.getDate() + Math.floor(days));
  return d;
}

export interface CreditLimitCheckInput {
  /** Party credit limit; null / 0 means no limit set. */
  creditLimit: number | null | undefined;
  /** Party net balance now (positive = party owes the shop), already including the bill being edited. */
  currentBalance: number;
  /** Net amount of this bill. */
  billAmount: number;
  /** Amount paid on this bill at save (cash / UPI / mix). */
  paidNow?: number;
  /** When editing, the bill's saved net amount (already inside currentBalance). */
  originalBillAmount?: number;
}

export interface CreditLimitCheck {
  hasLimit: boolean;
  /** Balance after this bill is saved. */
  balanceAfter: number;
  /** Limit − balance before this bill (can be negative). */
  availableBefore: number;
  /** How much this bill goes over the limit (0 when within). */
  overBy: number;
  exceeded: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function checkCreditLimit(input: CreditLimitCheckInput): CreditLimitCheck {
  const limit = Number(input.creditLimit);
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const base = (Number(input.currentBalance) || 0) - (Number(input.originalBillAmount) || 0);
  const unpaid = Math.max(0, (Number(input.billAmount) || 0) - Math.max(0, Number(input.paidNow) || 0));
  const balanceAfter = round2(base + unpaid);
  if (!hasLimit) {
    return { hasLimit: false, balanceAfter, availableBefore: 0, overBy: 0, exceeded: false };
  }
  const overBy = round2(Math.max(0, balanceAfter - limit));
  return {
    hasLimit: true,
    balanceAfter,
    availableBefore: round2(limit - base),
    overBy,
    // Paise noise never blocks a bill.
    exceeded: overBy > 0.5,
  };
}

export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/* ------------------------------------------------------------------ */
/* Sale bill B2B details (Industrial mode): stored in sales.b2b_details */
/* ------------------------------------------------------------------ */

export type TransportMode = "road" | "rail" | "air" | "ship";

export const TRANSPORT_MODE_LABEL: Record<TransportMode, string> = {
  road: "Road",
  rail: "Rail",
  air: "Air",
  ship: "Ship",
};

export interface SaleB2BDetails {
  customer_po_no?: string;
  /** yyyy-MM-dd */
  customer_po_date?: string;
  transporter_name?: string;
  /** Transporter GSTIN / TRANSIN (15 characters) for the e-way bill. */
  transporter_id?: string;
  transport_mode?: TransportMode;
  vehicle_no?: string;
  /** LR / RR / AWB / docket number. */
  lr_no?: string;
  /** yyyy-MM-dd */
  lr_date?: string;
  distance_km?: number;
}

export type SaleB2BDetailsForm = {
  customer_po_no: string;
  customer_po_date: string;
  transporter_name: string;
  transporter_id: string;
  transport_mode: TransportMode;
  vehicle_no: string;
  lr_no: string;
  lr_date: string;
  distance_km: string;
};

export const EMPTY_SALE_B2B_FORM: SaleB2BDetailsForm = {
  customer_po_no: "",
  customer_po_date: "",
  transporter_name: "",
  transporter_id: "",
  transport_mode: "road",
  vehicle_no: "",
  lr_no: "",
  lr_date: "",
  distance_km: "",
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES: TransportMode[] = ["road", "rail", "air", "ship"];

/** Vehicle numbers are matched by the e-way bill portal without spaces or dashes. */
export function normalizeVehicleNo(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Saved row value → form (tolerates null / old shapes). */
export function saleB2BToForm(raw: unknown): SaleB2BDetailsForm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const mode = str(r.transport_mode) as TransportMode;
  return {
    customer_po_no: str(r.customer_po_no),
    customer_po_date: ISO_DATE_RE.test(str(r.customer_po_date)) ? str(r.customer_po_date) : "",
    transporter_name: str(r.transporter_name),
    transporter_id: str(r.transporter_id),
    transport_mode: MODES.includes(mode) ? mode : "road",
    vehicle_no: str(r.vehicle_no),
    lr_no: str(r.lr_no),
    lr_date: ISO_DATE_RE.test(str(r.lr_date)) ? str(r.lr_date) : "",
    distance_km: r.distance_km == null || r.distance_km === "" ? "" : str(r.distance_km),
  };
}

/**
 * Form → row value. Empty fields are left out; an all-empty form saves NULL.
 * Throws a plain-language error on bad input.
 */
export function parseSaleB2BForm(form: SaleB2BDetailsForm): SaleB2BDetails | null {
  const out: SaleB2BDetails = {};
  const t = (v: string) => v.trim();
  if (t(form.customer_po_no)) out.customer_po_no = t(form.customer_po_no).slice(0, 40);
  if (t(form.customer_po_date)) {
    if (!ISO_DATE_RE.test(t(form.customer_po_date))) throw new Error("Customer PO date is not a valid date");
    out.customer_po_date = t(form.customer_po_date);
  }
  if (t(form.transporter_name)) out.transporter_name = t(form.transporter_name).slice(0, 80);
  const tid = t(form.transporter_id).toUpperCase().replace(/\s/g, "");
  if (tid) {
    if (!/^[0-9A-Z]{15}$/.test(tid)) throw new Error("Transporter ID must be the 15-character GSTIN / TRANSIN");
    out.transporter_id = tid;
  }
  const vehicle = normalizeVehicleNo(form.vehicle_no);
  if (vehicle) {
    if (vehicle.length < 4 || vehicle.length > 15) throw new Error("Vehicle number looks wrong (e.g. MH04AB1234)");
    out.vehicle_no = vehicle;
  }
  if (t(form.lr_no)) out.lr_no = t(form.lr_no).slice(0, 30);
  if (t(form.lr_date)) {
    if (!ISO_DATE_RE.test(t(form.lr_date))) throw new Error("LR date is not a valid date");
    out.lr_date = t(form.lr_date);
  }
  if (t(form.distance_km)) {
    const n = Number(t(form.distance_km));
    if (!Number.isInteger(n) || n < 0 || n > 4000) throw new Error("Distance must be whole km from 0 to 4000");
    out.distance_km = n;
  }
  if (Object.keys(out).length === 0) return null;
  // Mode only means something once there is transport to describe.
  if (out.transporter_name || out.transporter_id || out.vehicle_no || out.lr_no || out.distance_km != null) {
    out.transport_mode = MODES.includes(form.transport_mode) ? form.transport_mode : "road";
  }
  return out;
}

const dmy = (iso?: string) => (iso && ISO_DATE_RE.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** One printable transport line for invoice templates that have a "Transport" slot. */
export function formatSaleTransportLine(d: SaleB2BDetails | null | undefined, fallback = ""): string {
  if (!d) return fallback;
  const parts: string[] = [];
  const name = d.transporter_name || fallback;
  if (name) parts.push(d.transporter_id ? `${name} (${d.transporter_id})` : name);
  else if (d.transporter_id) parts.push(d.transporter_id);
  if (d.transport_mode && d.transport_mode !== "road") parts.push(TRANSPORT_MODE_LABEL[d.transport_mode]);
  if (d.vehicle_no) parts.push(`Vehicle ${d.vehicle_no}`);
  if (d.lr_no) parts.push(`LR ${d.lr_no}${d.lr_date ? ` dt ${dmy(d.lr_date)}` : ""}`);
  if (d.distance_km != null && d.distance_km > 0) parts.push(`${d.distance_km} km`);
  return parts.join(" · ");
}

/** "PO-7781 dt 28/10/2026" or "". */
export function formatCustomerPoRef(d: SaleB2BDetails | null | undefined): string {
  if (!d?.customer_po_no) return "";
  return `${d.customer_po_no}${d.customer_po_date ? ` dt ${dmy(d.customer_po_date)}` : ""}`;
}

const dmyDash = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

function toLocalDay(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  // "yyyy-MM-dd" from the database is a calendar day, not a UTC instant.
  if (ISO_DATE_RE.test(v)) return new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)), 12);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Label / value rows for the A4 invoice detail box (Tally Tax Invoice).
 * Empty for bills without B2B details, so retail prints stay exactly as before.
 */
export function buildB2BInvoiceRows(
  d: SaleB2BDetails | null | undefined,
  opts: { invoiceDate?: Date | string | null; dueDate?: Date | string | null } = {},
): Array<[string, string]> {
  if (!d || typeof d !== "object") return [];
  const rows: Array<[string, string]> = [];
  const po = formatCustomerPoRef(d);
  if (po) rows.push(["Buyer's Order No.", po]);
  const through = [d.transporter_name, d.transport_mode && d.transport_mode !== "road" ? `by ${TRANSPORT_MODE_LABEL[d.transport_mode]}` : ""]
    .filter(Boolean)
    .join(" ");
  if (through) rows.push(["Dispatched through", through]);
  if (d.transporter_id) rows.push(["Transporter ID", d.transporter_id]);
  if (d.vehicle_no) rows.push(["Vehicle No.", d.vehicle_no]);
  if (d.lr_no) rows.push(["LR / RR No.", `${d.lr_no}${d.lr_date ? ` dt ${dmy(d.lr_date)}` : ""}`]);
  if (d.distance_km != null && d.distance_km > 0) rows.push(["Distance", `${d.distance_km} km`]);
  const due = toLocalDay(opts.dueDate);
  const inv = toLocalDay(opts.invoiceDate);
  if (due && (!inv || due.toDateString() !== inv.toDateString())) rows.push(["Due Date", dmyDash(due)]);
  return rows;
}
