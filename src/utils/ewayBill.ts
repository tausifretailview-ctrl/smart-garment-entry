import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import { saleB2BToForm } from "@/utils/industrialMode";
import {
  EWB_VALUE_LIMIT,
  ewayBillEnabled,
  ewayBillSwitchOn,
  isEwbTransportMode,
  type EwbApiField,
  type EwbDirectField,
  type EwbExtendInput,
  type EwbShipTo,
  type EwbPortAddress,
  type EwbProblemField,
  type EwbTransportInput,
  type EwbTransportMode,
  type EwbVehicleType,
  type EwbVehicleUpdateInput,
} from "../../supabase/functions/_shared/ewayBill";

export { EWB_VALUE_LIMIT, ewayBillEnabled, ewayBillSwitchOn };

/**
 * Industrial mode, Phase 2 step 4: e-way bills of sale bills, made from their IRN
 * by the eway-bill service and kept in public.eway_bills.
 */

export type EwayBillRow = {
  id: string;
  sale_id: string | null;
  ewb_no: string;
  ewb_date: string | null;
  valid_till: string | null;
  status: string;
  test_mode: boolean;
  trans_mode: string | null;
  distance_km: number | null;
  transporter_id: string | null;
  transporter_name: string | null;
  vehicle_no: string | null;
  vehicle_type: string | null;
  trans_doc_no: string | null;
  trans_doc_date: string | null;
};

const EWB_COLS =
  "id, sale_id, ewb_no, ewb_date, valid_till, status, test_mode, trans_mode, distance_km, transporter_id, transporter_name, vehicle_no, vehicle_type, trans_doc_no, trans_doc_date, created_at";

/** The step 4 SQL has not run yet (no eway_bills table). */
export function isMissingEwayBillTable(message: string | null | undefined): boolean {
  return /eway_bills|does not exist|schema cache/i.test(String(message ?? ""));
}

/** IRN of a sale bill, read here because the Sales Invoice list rows don't carry it. */
export type SaleIrnState = { irn: string; status: string | null; testMode: boolean | null };

export type SaleEwbState = {
  /** Each bill's active e-way bill, else its latest cancelled one. */
  rows: Map<string, EwayBillRow>;
  /** Bills with an IRN (generated or cancelled). */
  irns: Map<string, SaleIrnState>;
  /** The step 4 SQL has not run. */
  missingSql: boolean;
};

/** IRN and e-way bill of each given sale bill (E-Way Bill switch on). */
export async function fetchSaleEwayBills(organizationId: string, saleIds: string[]): Promise<SaleEwbState> {
  const irns = new Map<string, SaleIrnState>();
  const unique = Array.from(new Set(saleIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, irn, einvoice_status, einvoice_test_mode")
      .eq("organization_id", organizationId)
      .in("id", unique.slice(i, i + 200))
      .not("irn", "is", null);
    if (error) throw error;
    for (const r of data ?? []) {
      if (!r.irn) continue;
      irns.set(String(r.id), {
        irn: String(r.irn),
        status: (r.einvoice_status as string | null) ?? null,
        testMode: (r.einvoice_test_mode as boolean | null) ?? null,
      });
    }
  }
  // Every bill on the page: bills without an IRN can have a direct e-way bill (step 6a).
  const ewb = await fetchEwayBillsForSales(organizationId, unique);
  return { rows: ewb.rows, irns, missingSql: ewb.missingSql };
}

/** E-way bill of each given sale bill: its active one, else its latest cancelled one. */
export async function fetchEwayBillsForSales(
  organizationId: string,
  saleIds: string[],
): Promise<{ rows: Map<string, EwayBillRow>; missingSql: boolean }> {
  const rows = new Map<string, EwayBillRow>();
  const unique = Array.from(new Set(saleIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("eway_bills")
      .select(EWB_COLS)
      .eq("organization_id", organizationId)
      .in("sale_id", unique.slice(i, i + 200))
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingEwayBillTable(error.message)) return { rows, missingSql: true };
      throw error;
    }
    for (const r of (data ?? []) as EwayBillRow[]) {
      const key = String(r.sale_id ?? "");
      if (!key) continue;
      const have = rows.get(key);
      if (!have || (have.status !== "active" && r.status === "active")) rows.set(key, r);
    }
  }
  return { rows, missingSql: false };
}

/* ------------------------------------------------------------------ */
/* Dialog form                                                          */
/* ------------------------------------------------------------------ */

export type EwbTransportForm = {
  mode: EwbTransportMode;
  distanceKm: string;
  transporterId: string;
  transporterName: string;
  vehicleNo: string;
  vehicleType: EwbVehicleType;
  transDocNo: string;
  transDocDate: string;
};

export type EwbPortForm = {
  addr1: string;
  addr2: string;
  place: string;
  pin: string;
  stateCode: string;
};

export const EMPTY_PORT_FORM: EwbPortForm = { addr1: "", addr2: "", place: "", pin: "", stateCode: "" };

/** Transport details already typed on the bill (B2B details) as the dialog's starting values. */
export function ewbFormFromB2b(b2bDetails: unknown): EwbTransportForm {
  const f = saleB2BToForm(b2bDetails);
  return {
    mode: isEwbTransportMode(f.transport_mode) ? f.transport_mode : "road",
    distanceKm: f.distance_km ? String(f.distance_km) : "",
    transporterId: f.transporter_id,
    transporterName: f.transporter_name,
    vehicleNo: f.vehicle_no,
    vehicleType: "R",
    transDocNo: f.lr_no,
    transDocDate: f.lr_date,
  };
}

export function ewbTransportInput(f: EwbTransportForm): EwbTransportInput {
  return {
    mode: f.mode,
    distanceKm: f.distanceKm.trim() || null,
    transporterId: f.transporterId,
    transporterName: f.transporterName,
    vehicleNo: f.vehicleNo,
    vehicleType: f.vehicleType,
    transDocNo: f.transDocNo,
    transDocDate: f.transDocDate || null,
  };
}

export function ewbPortInput(f: EwbPortForm): EwbPortAddress {
  return { addr1: f.addr1, addr2: f.addr2, place: f.place, pin: f.pin, stateCode: f.stateCode };
}

/* ------------------------------------------------------------------ */
/* Service                                                              */
/* ------------------------------------------------------------------ */

export type EwbReply = {
  success: boolean;
  error?: string;
  code?: string;
  field?: EwbProblemField | EwbApiField | EwbDirectField;
  ewbNo?: string;
  ewbDate?: string;
  validTill?: string;
  found?: boolean;
  partAOnly?: boolean;
  message?: string;
};

export async function invokeEwayBill(body: {
  /**
   * generate / sync: from the bill's IRN. test / vehicle / cancel / extend: e-way bill API (step 5b).
   * direct: a bill without an e-invoice, on the e-way bill API (step 6a).
   */
  action: "generate" | "sync" | "test" | "vehicle" | "cancel" | "extend" | "direct";
  saleId?: string;
  ewayBillId?: string;
  organizationId: string;
  transport?: EwbTransportInput;
  exportPort?: EwbPortAddress;
  vehicle?: EwbVehicleUpdateInput;
  cancel?: { reasonCode: number | string; remark?: string | null };
  extend?: EwbExtendInput;
  shipTo?: EwbShipTo;
}): Promise<EwbReply> {
  const { data, error } = await supabase.functions.invoke("eway-bill", { body });
  if (error) {
    const raw = await getEdgeFunctionErrorMessage(error, data, "The e-way bill service did not answer");
    const msg = /requested function was not found|failed to send a request/i.test(raw)
      ? "The e-way bill service isn't live yet. Deploy the eway-bill function, then try again."
      : raw;
    const code = (data as { code?: string } | null)?.code;
    return { success: false, error: msg, code };
  }
  return (data ?? { success: false, error: "No reply from the e-way bill service" }) as EwbReply;
}

/* ------------------------------------------------------------------ */
/* Display                                                              */
/* ------------------------------------------------------------------ */

/** 141008536848 → "1410 0853 6848", as the portal prints it. */
export function formatEwbNo(no: string | null | undefined): string {
  const s = String(no ?? "").replace(/\D/g, "");
  return s.length === 12 ? `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8)}` : String(no ?? "");
}

/** dd/mm/yyyy hh:mm in India time, from an ISO instant. */
export function formatIstDateTime(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + 330 * 60_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
}

export type EwbValidity = { label: string; tone: "ok" | "soon" | "expired" | "partA" | "cancelled" };

/** How long the e-way bill stays valid, for the list badge and dialog. */
export function ewbValidity(row: Pick<EwayBillRow, "status" | "valid_till">, now = new Date()): EwbValidity {
  if (row.status === "cancelled") return { label: "Cancelled", tone: "cancelled" };
  const till = row.valid_till ? Date.parse(row.valid_till) : NaN;
  if (!Number.isFinite(till)) return { label: "Vehicle not added yet", tone: "partA" };
  const hours = (till - now.getTime()) / 3_600_000;
  if (hours <= 0) return { label: `Expired ${formatIstDateTime(row.valid_till)}`, tone: "expired" };
  return { label: `Valid till ${formatIstDateTime(row.valid_till)}`, tone: hours <= 8 ? "soon" : "ok" };
}

/* ------------------------------------------------------------------ */
/* Register and alerts (Phase 2 step 5a)                                */
/* ------------------------------------------------------------------ */

const HOUR_MS = 3_600_000;
/** The portal lets an e-way bill be extended from 8 hours before to 8 hours after it lapses. */
export const EWB_EXTEND_WINDOW_HOURS = 8;
/** An e-way bill can be cancelled within 24 hours of being made. */
export const EWB_CANCEL_HOURS = 24;
/** Part A without a vehicle (Part B) lapses after 15 days. */
export const EWB_PART_A_DAYS = 15;

/** The sale bill an e-way bill belongs to, as the register reads it. */
export type EwbRegisterSale = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string | null;
  net_amount: number | null;
  irn: string | null;
  einvoice_status: string | null;
  einvoice_test_mode: boolean | null;
};

export type EwayBillRegisterRow = EwayBillRow & {
  doc_no: string | null;
  doc_date: string | null;
  irn: string | null;
  generated_via: string | null;
  created_at: string | null;
  sales: EwbRegisterSale | null;
};

const REGISTER_COLS = `${EWB_COLS}, doc_no, doc_date, irn, generated_via, sales:sale_id (id, sale_number, sale_date, customer_id, customer_name, net_amount, irn, einvoice_status, einvoice_test_mode)`;

/** Start and end of an India date range as instants, for timestamptz filters. */
export function istDayRange(fromIso: string, toIso: string): { start: string; end: string } {
  const start = new Date(`${fromIso.slice(0, 10)}T00:00:00+05:30`).toISOString();
  const end = new Date(`${toIso.slice(0, 10)}T23:59:59.999+05:30`).toISOString();
  return { start, end };
}

/** E-way bills made between two India dates, newest first (Industrial mode register). */
export async function fetchEwayBillRegister(
  organizationId: string,
  fromIso: string,
  toIso: string,
): Promise<{ rows: EwayBillRegisterRow[]; missingSql: boolean }> {
  const { start, end } = istDayRange(fromIso, toIso);
  const { data, error } = await supabase
    .from("eway_bills")
    .select(REGISTER_COLS)
    .eq("organization_id", organizationId)
    .gte("ewb_date", start)
    .lte("ewb_date", end)
    .order("ewb_date", { ascending: false })
    .limit(2000);
  if (error) {
    if (isMissingEwayBillTable(error.message)) return { rows: [], missingSql: true };
    throw error;
  }
  return { rows: (data ?? []) as unknown as EwayBillRegisterRow[], missingSql: false };
}

export type EwbAlertKind = "soon" | "extend" | "partA";

type AlertFields = Pick<EwayBillRow, "status" | "valid_till" | "ewb_date"> & { created_at?: string | null };

/**
 * What needs doing on an active e-way bill now:
 * soon: lapses within 8 hours (extend it on the portal if the goods are still moving);
 * extend: lapsed within the last 8 hours, so it can still be extended;
 * partA: no vehicle yet (Part A only), within its 15 days.
 */
export function ewbAlertKind(row: AlertFields, now = new Date()): EwbAlertKind | null {
  if (row.status !== "active") return null;
  const t = now.getTime();
  const till = row.valid_till ? Date.parse(row.valid_till) : NaN;
  if (!Number.isFinite(till)) {
    const made = Date.parse(String(row.ewb_date || row.created_at || ""));
    return Number.isFinite(made) && t - made <= EWB_PART_A_DAYS * 24 * HOUR_MS ? "partA" : null;
  }
  const hours = (till - t) / HOUR_MS;
  if (hours > 0 && hours <= EWB_EXTEND_WINDOW_HOURS) return "soon";
  if (hours <= 0 && hours > -EWB_EXTEND_WINDOW_HOURS) return "extend";
  return null;
}

export type EwbAlertSummary = {
  soon: number;
  extend: number;
  partA: number;
  total: number;
  /** Earliest validity among the "soon" ones. */
  nextExpiry: string | null;
};

export function summarizeEwbAlerts(rows: AlertFields[], now = new Date()): EwbAlertSummary {
  const out: EwbAlertSummary = { soon: 0, extend: 0, partA: 0, total: 0, nextExpiry: null };
  for (const r of rows) {
    const kind = ewbAlertKind(r, now);
    if (!kind) continue;
    out[kind] += 1;
    out.total += 1;
    if (kind === "soon" && r.valid_till && (!out.nextExpiry || Date.parse(r.valid_till) < Date.parse(out.nextExpiry))) {
      out.nextExpiry = r.valid_till;
    }
  }
  return out;
}

/** Last moment the portal accepts an extension: 8 hours after it lapses. */
export function ewbExtendUntil(validTill: string | null | undefined): string | null {
  const ms = validTill ? Date.parse(validTill) : NaN;
  return Number.isFinite(ms) ? new Date(ms + EWB_EXTEND_WINDOW_HOURS * HOUR_MS).toISOString() : null;
}

/** Last moment it can be cancelled: 24 hours after it was made; null once that has passed. */
export function ewbCancelUntil(row: Pick<EwayBillRow, "status" | "ewb_date">, now = new Date()): string | null {
  if (row.status !== "active") return null;
  const made = row.ewb_date ? Date.parse(row.ewb_date) : NaN;
  if (!Number.isFinite(made)) return null;
  const until = made + EWB_CANCEL_HOURS * HOUR_MS;
  return until > now.getTime() ? new Date(until).toISOString() : null;
}

/** Active e-way bills that need doing something now, with the bill they belong to. */
export async function fetchEwayBillAlerts(
  organizationId: string,
  now = new Date(),
): Promise<{ rows: EwayBillRegisterRow[]; missingSql: boolean }> {
  const t = now.getTime();
  const near = supabase
    .from("eway_bills")
    .select(REGISTER_COLS)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .gte("valid_till", new Date(t - EWB_EXTEND_WINDOW_HOURS * HOUR_MS).toISOString())
    .lte("valid_till", new Date(t + EWB_EXTEND_WINDOW_HOURS * HOUR_MS).toISOString())
    .order("valid_till", { ascending: true })
    .limit(200);
  const partA = supabase
    .from("eway_bills")
    .select(REGISTER_COLS)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("valid_till", null)
    .gte("ewb_date", new Date(t - EWB_PART_A_DAYS * 24 * HOUR_MS).toISOString())
    .order("ewb_date", { ascending: true })
    .limit(200);
  const [a, b] = await Promise.all([near, partA]);
  const error = a.error ?? b.error;
  if (error) {
    if (isMissingEwayBillTable(error.message)) return { rows: [], missingSql: true };
    throw error;
  }
  const rows = [...(a.data ?? []), ...(b.data ?? [])] as unknown as EwayBillRegisterRow[];
  return { rows, missingSql: false };
}

/* ------------------------------------------------------------------ */
/* Register Excel and print helpers                                     */
/* ------------------------------------------------------------------ */

const MODE_NAME: Record<string, string> = { "1": "Road", "2": "Rail", "3": "Air", "4": "Ship", road: "Road", rail: "Rail", air: "Air", ship: "Ship" };

/** "Road", "Rail"…, from the saved mode (code or word). */
export function ewbModeName(mode: string | null | undefined): string {
  return MODE_NAME[String(mode ?? "").trim().toLowerCase()] ?? "";
}

/** dd/mm/yyyy from a yyyy-mm-dd date or ISO instant (date part as written). */
export function ewbDdMmYyyy(d: string | null | undefined): string {
  const s = String(d ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
}

/** One row per e-way bill for the register's Excel file. */
export function ewbRegisterExcelRows(rows: EwayBillRegisterRow[], now = new Date()): Record<string, string | number>[] {
  return rows.map((r) => {
    const v = ewbValidity(r, now);
    return {
      "EWB No": r.ewb_no,
      "EWB Date": formatIstDateTime(r.ewb_date),
      "Valid Till": formatIstDateTime(r.valid_till),
      Status: v.label,
      "Bill No": r.sales?.sale_number || r.doc_no || "",
      "Bill Date": ewbDdMmYyyy(r.sales?.sale_date || r.doc_date),
      Customer: r.sales?.customer_name || "",
      Value: Math.round(Number(r.sales?.net_amount ?? 0)),
      Mode: ewbModeName(r.trans_mode),
      "Vehicle No": r.vehicle_no || "",
      "Transporter ID": r.transporter_id || "",
      Transporter: r.transporter_name || "",
      "LR / Doc No": r.trans_doc_no || "",
      "LR / Doc Date": ewbDdMmYyyy(r.trans_doc_date),
      "Distance km": Number(r.distance_km ?? 0) || "",
      Sandbox: r.test_mode ? "Yes" : "No",
    };
  });
}

/** HSN codes on the bill, highest value first (the e-way bill shows the main one first). */
export function ewbHsnSummary(items: Array<{ hsn_code?: string | null; line_total?: number | null }>): string[] {
  const byHsn = new Map<string, number>();
  for (const it of items) {
    const hsn = String(it.hsn_code ?? "").replace(/\s+/g, "");
    if (!hsn) continue;
    byHsn.set(hsn, (byHsn.get(hsn) ?? 0) + Number(it.line_total ?? 0));
  }
  return Array.from(byHsn.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hsn]) => hsn);
}

/** Town and PIN code from a one-line address ("…, Bhiwandi 421302" → Bhiwandi, 421302). */
export function ewbPlaceOf(address: string | null | undefined): { place: string; pin: string } {
  const a = String(address ?? "").replace(/\s+/g, " ").trim();
  const pin = a.match(/\b\d{6}\b/)?.[0] ?? "";
  const parts = a
    .split(",")
    .map((p) => p.replace(/\b\d{6}\b/, "").replace(/[-–\s]+$/, "").trim())
    .filter((p) => p.length > 0);
  return { place: parts[parts.length - 1] ?? "", pin };
}

export type EwbRegisterView = "all" | "active" | "soon" | "extend" | "partA" | "expired" | "cancelled";

const VIEWS: EwbRegisterView[] = ["all", "active", "soon", "extend", "partA", "expired", "cancelled"];

export function parseEwbRegisterView(v: string | null | undefined): EwbRegisterView {
  return (VIEWS as string[]).includes(String(v)) ? (v as EwbRegisterView) : "all";
}

/** Views that follow the live alerts (any date) rather than the date range. */
export function isEwbAlertView(v: EwbRegisterView): v is EwbAlertKind {
  return v === "soon" || v === "extend" || v === "partA";
}

/** Does this e-way bill belong in the register view? */
export function ewbInRegisterView(row: AlertFields, view: EwbRegisterView, now = new Date()): boolean {
  if (view === "all") return true;
  if (isEwbAlertView(view)) return ewbAlertKind(row, now) === view;
  const tone = ewbValidity(row, now).tone;
  if (view === "active") return tone === "ok" || tone === "soon";
  return tone === view;
}

/** Search over EWB number (spaces ignored), bill, customer, vehicle, transporter and LR. */
export function ewbMatchesSearch(row: EwayBillRegisterRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\s+/g, "");
  if (/^\d{3,}$/.test(digits) && row.ewb_no.includes(digits)) return true;
  // Vehicle numbers are saved without spaces or dashes, so "MH 04 AB" finds MH04AB1234.
  const vehicle = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vehicle.length >= 3 && String(row.vehicle_no ?? "").includes(vehicle)) return true;
  return [row.sales?.sale_number, row.doc_no, row.sales?.customer_name, row.transporter_name, row.transporter_id, row.trans_doc_no]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(s));
}

/* ------------------------------------------------------------------ */
/* E-way bill API keys (step 5b), kept with E-Invoice Settings          */
/* ------------------------------------------------------------------ */

export type EwbApiKeys = {
  ewb_api_client_id?: string;
  ewb_api_client_secret?: string;
  ewb_api_username?: string;
  ewb_api_password?: string;
};

/** All four e-way bill API keys are filled (the API email is shared with e-invoice). */
export function ewbApiKeysSet(einvoiceSettings: unknown): boolean {
  const s = (einvoiceSettings ?? {}) as EwbApiKeys & { api_email?: string };
  return [s.ewb_api_client_id, s.ewb_api_client_secret, s.ewb_api_username, s.ewb_api_password, s.api_email].every(
    (v) => String(v ?? "").trim().length > 0,
  );
}

/** Town, PIN and state code of the shop, as the vehicle / extend forms' starting values. */
export function ewbSellerPlace(address: string | null | undefined, gstin: string | null | undefined): {
  place: string;
  pin: string;
  stateCode: string;
} {
  const { place, pin } = ewbPlaceOf(address);
  const code = String(gstin ?? "").slice(0, 2);
  return { place, pin, stateCode: /^\d{2}$/.test(code) ? code : "" };
}
