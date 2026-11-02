import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import { saleB2BToForm } from "@/utils/industrialMode";
import {
  isEwbTransportMode,
  type EwbPortAddress,
  type EwbProblemField,
  type EwbTransportInput,
  type EwbTransportMode,
  type EwbVehicleType,
} from "../../supabase/functions/_shared/ewayBill";

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

/** IRN and e-way bill of each given sale bill (Industrial mode only). */
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
  const ewb = await fetchEwayBillsForSales(organizationId, Array.from(irns.keys()));
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
  field?: EwbProblemField;
  ewbNo?: string;
  ewbDate?: string;
  validTill?: string;
  found?: boolean;
  partAOnly?: boolean;
};

export async function invokeEwayBill(body: {
  action: "generate" | "sync";
  saleId: string;
  organizationId: string;
  transport?: EwbTransportInput;
  exportPort?: EwbPortAddress;
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
