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
  /** Export / SEZ bill (Phase 2 step 3); absent on a regular bill within India. */
  supply_type?: Exclude<SaleSupplyType, "B2B">;
  /** Export only: shipping bill, port and buyer country, filled when known. */
  ship_bill_no?: string;
  /** yyyy-MM-dd */
  ship_bill_date?: string;
  /** Indian port code, e.g. INNSA1. */
  port_code?: string;
  /** Buyer country, ISO 2 letters, e.g. AE. */
  country_code?: string;
  /** Invoice currency, ISO 3 letters, e.g. USD. */
  currency?: string;
  /** Invoice value in that currency. */
  foreign_value?: number;
}

/* Supply type of a sale bill. Codes are the IRP's own (TranDtls.SupTyp). */
export type SaleSupplyType = "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP";

export const SALE_SUPPLY_TYPES: ReadonlyArray<{
  value: SaleSupplyType;
  label: string;
  short: string;
  /** Rule 46 line printed on the invoice. */
  endorsement: string;
}> = [
  { value: "B2B", label: "Regular (within India)", short: "", endorsement: "" },
  {
    value: "SEZWP",
    label: "SEZ unit, with IGST",
    short: "SEZ with IGST",
    endorsement: "SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF INTEGRATED TAX",
  },
  {
    value: "SEZWOP",
    label: "SEZ unit, under LUT (no IGST)",
    short: "SEZ under LUT",
    endorsement:
      "SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX",
  },
  {
    value: "EXPWP",
    label: "Export, with IGST",
    short: "Export with IGST",
    endorsement: "SUPPLY MEANT FOR EXPORT ON PAYMENT OF INTEGRATED TAX",
  },
  {
    value: "EXPWOP",
    label: "Export, under LUT (no IGST)",
    short: "Export under LUT",
    endorsement: "SUPPLY MEANT FOR EXPORT UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX",
  },
];

const SUPPLY_CODES = SALE_SUPPLY_TYPES.map((t) => t.value);

export function isSaleSupplyType(v: unknown): v is SaleSupplyType {
  return typeof v === "string" && (SUPPLY_CODES as string[]).includes(v);
}

/** Supply type saved on a bill (b2b_details); "B2B" for every regular bill. */
export function saleSupplyTypeOf(details: unknown): SaleSupplyType {
  const v = details && typeof details === "object" ? (details as Record<string, unknown>).supply_type : null;
  return isSaleSupplyType(v) ? v : "B2B";
}

export const isExportSupply = (t: SaleSupplyType | null | undefined): boolean => t === "EXPWP" || t === "EXPWOP";
export const isSezSupply = (t: SaleSupplyType | null | undefined): boolean => t === "SEZWP" || t === "SEZWOP";
/** Export or SEZ: always IGST, whatever the states. */
export const isZeroRatedSupply = (t: SaleSupplyType | null | undefined): boolean => isExportSupply(t) || isSezSupply(t);
/** Under LUT / bond: the bill carries no GST. */
export const isSupplyWithoutTax = (t: SaleSupplyType | null | undefined): boolean => t === "SEZWOP" || t === "EXPWOP";

export function saleSupplyShortLabel(t: SaleSupplyType | null | undefined): string {
  return SALE_SUPPLY_TYPES.find((x) => x.value === t)?.short ?? "";
}

/** Rule 46 endorsement for an export / SEZ bill; "" for a regular bill. */
export function saleSupplyEndorsement(details: unknown): string {
  const t = saleSupplyTypeOf(details);
  return SALE_SUPPLY_TYPES.find((x) => x.value === t)?.endorsement ?? "";
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
  supply_type: SaleSupplyType;
  ship_bill_no: string;
  ship_bill_date: string;
  port_code: string;
  country_code: string;
  currency: string;
  foreign_value: string;
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
  supply_type: "B2B",
  ship_bill_no: "",
  ship_bill_date: "",
  port_code: "",
  country_code: "",
  currency: "",
  foreign_value: "",
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
    supply_type: saleSupplyTypeOf(r),
    ship_bill_no: str(r.ship_bill_no),
    ship_bill_date: ISO_DATE_RE.test(str(r.ship_bill_date)) ? str(r.ship_bill_date) : "",
    port_code: str(r.port_code),
    country_code: str(r.country_code),
    currency: str(r.currency),
    foreign_value: r.foreign_value == null || r.foreign_value === "" ? "" : str(r.foreign_value),
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
  if (form.supply_type && form.supply_type !== "B2B") {
    if (!isSaleSupplyType(form.supply_type)) throw new Error("Pick a supply type from the list");
    out.supply_type = form.supply_type;
  }
  // Shipping bill, port and currency belong to export bills only.
  if (isExportSupply(out.supply_type)) {
    const sb = t(form.ship_bill_no).replace(/"/g, "");
    if (sb) out.ship_bill_no = sb.slice(0, 20);
    if (t(form.ship_bill_date)) {
      if (!ISO_DATE_RE.test(t(form.ship_bill_date))) throw new Error("Shipping bill date is not a valid date");
      out.ship_bill_date = t(form.ship_bill_date);
    }
    const port = t(form.port_code).toUpperCase().replace(/\s/g, "");
    if (port) {
      if (!/^[A-Z0-9]{2,10}$/.test(port)) throw new Error("Port code is letters and digits, e.g. INNSA1");
      out.port_code = port;
    }
    const country = t(form.country_code).toUpperCase();
    if (country) {
      if (!/^[A-Z]{2}$/.test(country)) throw new Error("Country code is 2 letters, e.g. AE or US");
      out.country_code = country;
    }
    const cur = t(form.currency).toUpperCase();
    if (cur) {
      if (!/^[A-Z]{3}$/.test(cur)) throw new Error("Currency is 3 letters, e.g. USD");
      out.currency = cur;
    }
    const fv = t(form.foreign_value).replace(/,/g, "");
    if (fv) {
      const n = Number(fv);
      if (!Number.isFinite(n) || n <= 0 || n > 1e13) throw new Error("Value in foreign currency must be more than 0");
      out.foreign_value = Math.round(n * 100) / 100;
    }
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
  const supply = saleSupplyShortLabel(saleSupplyTypeOf(d));
  if (supply) rows.push(["Supply", supply]);
  if (d.ship_bill_no) rows.push(["Shipping Bill", `${d.ship_bill_no}${d.ship_bill_date ? ` dt ${dmy(d.ship_bill_date)}` : ""}`]);
  const portCountry = [d.port_code, d.country_code].filter(Boolean).join(" · ");
  if (portCountry) rows.push(["Port · Country", portCountry]);
  if (d.currency && d.foreign_value) {
    rows.push(["Value", `${d.currency} ${d.foreign_value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  }
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

/* ------------------------------------------------------------------ */
/* Quotation follow-up and revision (Industrial mode)                  */
/* ------------------------------------------------------------------ */

/** "QT/26-27/0042" or "QT/26-27/0042 Rev 2". */
export function quotationDisplayNumber(number: string, revisionNo: number | null | undefined): string {
  const rev = Number(revisionNo);
  return Number.isInteger(rev) && rev > 0 ? `${number} Rev ${rev}` : number;
}

export type FollowUpState = "overdue" | "today" | "upcoming";

const CLOSED_QUOTATION_STATUSES = new Set(["confirmed", "cancelled"]);

/** Follow-up chip state; null when there is nothing to chase. */
export function quotationFollowUpState(
  followUpDate: string | null | undefined,
  status: string | null | undefined,
  today: Date = new Date(),
): FollowUpState | null {
  if (!followUpDate || !ISO_DATE_RE.test(followUpDate)) return null;
  if (status && CLOSED_QUOTATION_STATUSES.has(status)) return null;
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (followUpDate < t) return "overdue";
  if (followUpDate === t) return "today";
  return "upcoming";
}

/** Local calendar day → "yyyy-MM-dd" (no UTC shift). */
export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "yyyy-MM-dd" → local Date at noon, or null. */
export function fromIsoDay(v: string | null | undefined): Date | null {
  return v && ISO_DATE_RE.test(v) ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)), 12) : null;
}

/** Quick picks for "why did we lose this quotation". Free text is allowed too. */
export const QUOTATION_LOST_REASONS = [
  "Price too high",
  "Went to a competitor",
  "Delivery time too long",
  "No response from customer",
  "Requirement dropped",
  "Specs did not match",
] as const;

/** "Price too high" + optional note → "Price too high: asked ₹410, we quoted ₹455" (max 200 chars). */
export function buildQuotationLostReason(reason: string, note: string): string | null {
  const r = reason.trim();
  const n = note.trim();
  const text = r && n ? `${r}: ${n}` : r || n;
  return text ? text.slice(0, 200) : null;
}

/** Short label for the follow-up chip, e.g. "Follow up 28/10 · 4d late". */
export function formatFollowUpChip(followUpDate: string, state: FollowUpState, today: Date = new Date()): string {
  const d = fromIsoDay(followUpDate);
  if (!d) return "";
  const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (state === "today") return "Follow up today";
  if (state === "overdue") {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    const late = Math.round((t.getTime() - d.getTime()) / 86_400_000);
    return `Follow up ${dm} · ${late}d late`;
  }
  return `Follow up ${dm}`;
}

/* ------------------------------------------------------------------ */
/* Item: alternate unit and reorder level (Industrial mode)            */
/* ------------------------------------------------------------------ */

export type IndustrialItemDetails = {
  alt_uom: string | null;
  alt_uom_factor: number | null;
  reorder_level: number | null;
};

export type IndustrialItemForm = {
  alt_uom: string;
  alt_uom_factor: string;
  reorder_level: string;
};

export const EMPTY_INDUSTRIAL_ITEM_FORM: IndustrialItemForm = { alt_uom: "", alt_uom_factor: "", reorder_level: "" };

function numText(v: unknown): string {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? "" : String(n);
}

export function industrialItemToForm(raw: unknown): IndustrialItemForm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    alt_uom: typeof r.alt_uom === "string" ? r.alt_uom : "",
    alt_uom_factor: numText(r.alt_uom_factor),
    reorder_level: numText(r.reorder_level),
  };
}

/** Validates the item form. Throws a user-facing message on bad input. */
export function parseIndustrialItemForm(form: IndustrialItemForm, baseUom: string): IndustrialItemDetails {
  const alt = form.alt_uom.trim().toUpperCase();
  const factorText = form.alt_uom_factor.replace(/,/g, "").trim();
  const reorderText = form.reorder_level.replace(/,/g, "").trim();

  let alt_uom: string | null = null;
  let alt_uom_factor: number | null = null;
  if (alt) {
    if (alt === (baseUom || "").trim().toUpperCase()) throw new Error("Alternate unit must be different from the main unit");
    const f = Number(factorText);
    if (!factorText || !Number.isFinite(f) || f <= 0) throw new Error(`Enter how many ${baseUom || "units"} make 1 ${alt}`);
    if (f > 100000) throw new Error("Alternate unit conversion is too large");
    alt_uom = alt;
    alt_uom_factor = Math.round(f * 10000) / 10000;
  }

  let reorder_level: number | null = null;
  if (reorderText) {
    const n = Number(reorderText);
    if (!Number.isFinite(n) || n < 0) throw new Error("Reorder level must be 0 or more");
    reorder_level = Math.round(n * 1000) / 1000;
  }
  return { alt_uom, alt_uom_factor, reorder_level };
}

function trimQty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * "36 NOS" → "3 BOX"; "40 NOS" → "3 BOX + 4 NOS". Empty when the item has no
 * alternate unit or the qty is under one alternate unit.
 */
export function formatAltUnitQty(
  qty: number,
  baseUom: string,
  altUom: string | null | undefined,
  factor: number | null | undefined,
): string {
  const f = Number(factor);
  if (!altUom || !Number.isFinite(f) || f <= 0 || !Number.isFinite(qty) || qty <= 0) return "";
  const whole = Math.floor((qty + 1e-9) / f);
  if (whole < 1) return "";
  const rest = Math.round((qty - whole * f) * 1000) / 1000;
  return rest > 0 ? `${trimQty(whole)} ${altUom} + ${trimQty(rest)} ${baseUom}` : `${trimQty(whole)} ${altUom}`;
}

export type ReorderState = "below" | "at" | "ok";

/** Below = stock under the reorder level; at = exactly on it. */
export function reorderState(stockQty: number, reorderLevel: number | null | undefined): ReorderState | null {
  if (reorderLevel === null || reorderLevel === undefined || !Number.isFinite(Number(reorderLevel))) return null;
  const level = Number(reorderLevel);
  if (stockQty < level) return "below";
  if (stockQty === level) return "at";
  return "ok";
}

/* ------------------------------------------------------------------ */
/* Delivery challan type (Industrial mode)                             */
/* ------------------------------------------------------------------ */

/** Why the goods move on a challan (CGST Rule 55 reasons, plus the everyday ones). */
export const CHALLAN_TYPES = [
  {
    value: "sale_delivery",
    label: "Delivery (bill to follow)",
    printTitle: "DELIVERY CHALLAN",
    hint: "Goods go now, the tax invoice follows.",
  },
  {
    value: "job_work",
    label: "Sent for job work",
    printTitle: "DELIVERY CHALLAN - JOB WORK",
    hint: "Inputs must come back within 1 year, capital goods within 3 years.",
  },
  {
    value: "supply_on_approval",
    label: "Supply on approval",
    printTitle: "DELIVERY CHALLAN - ON APPROVAL",
    hint: "Raise the tax invoice when the buyer accepts, or within 6 months.",
  },
  {
    value: "branch_transfer",
    label: "Branch / stock transfer",
    printTitle: "DELIVERY CHALLAN - STOCK TRANSFER",
    hint: "Own godown or branch on the same GSTIN. Another GSTIN needs a tax invoice.",
  },
  {
    value: "repair_return",
    label: "Repair / replacement",
    printTitle: "DELIVERY CHALLAN - REPAIR / REPLACEMENT",
    hint: "Repaired or replacement goods going back to the customer.",
  },
  {
    value: "others",
    label: "Others (exhibition, sample)",
    printTitle: "DELIVERY CHALLAN",
    hint: "Exhibition, samples or goods sent for testing.",
  },
] as const;

export const DEFAULT_CHALLAN_TYPE: ChallanType = "sale_delivery";

export type ChallanType = (typeof CHALLAN_TYPES)[number]["value"];

export function isChallanType(v: unknown): v is ChallanType {
  return typeof v === "string" && CHALLAN_TYPES.some((t) => t.value === v);
}

export function challanTypeLabel(v: string | null | undefined): string {
  return CHALLAN_TYPES.find((t) => t.value === v)?.label ?? "";
}

export function challanTypeHint(v: string | null | undefined): string {
  return CHALLAN_TYPES.find((t) => t.value === v)?.hint ?? "";
}

/** Print heading for a challan; plain "DELIVERY CHALLAN" when no type is set. */
export function challanPrintTitle(v: string | null | undefined): string {
  return CHALLAN_TYPES.find((t) => t.value === v)?.printTitle ?? "DELIVERY CHALLAN";
}

/* ------------------------------------------------------------------ */
/* Receivables ageing by due date (Industrial mode)                    */
/* ------------------------------------------------------------------ */

export type DueAgeKey = "notDue" | "d30" | "d60" | "d90" | "d90plus";

/**
 * Days past the due date on the shop's calendar (negative = not due yet).
 * Falls back to the bill date when the bill has no due date.
 */
export function daysPastDue(
  dueDate: string | null | undefined,
  saleDate: string | null | undefined,
  today: Date = new Date(),
): number {
  let due = fromIsoDay(dueDate ? dueDate.slice(0, 10) : null);
  if (!due && saleDate) {
    const d = new Date(saleDate);
    if (!Number.isNaN(d.getTime())) due = fromIsoDay(toIsoDay(d));
  }
  if (!due) return 0;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.round((t.getTime() - due.getTime()) / 86_400_000);
}

export function dueAgeBucket(daysOverdue: number): DueAgeKey {
  if (daysOverdue <= 0) return "notDue";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90plus";
}
