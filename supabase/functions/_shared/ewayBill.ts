// E-way bill (EWB) rules shared by the eway-bill edge function and the screens.
// Industrial mode, Phase 2 step 4: e-way bill from the e-invoice (IRN) through
// PeriOne's e-invoice API (GENERATE_EWAYBILL / GETEWAYBILLIRN), on the shop's
// existing e-invoice login. Pure functions only: no Deno or browser APIs.

export type EwbTransportMode = "road" | "rail" | "air" | "ship";

/** IRP / EWB codes: 1 road, 2 rail, 3 air, 4 ship (or road cum ship). */
export const EWB_MODE_CODE: Record<EwbTransportMode, string> = {
  road: "1",
  rail: "2",
  air: "3",
  ship: "4",
};

export const EWB_MODE_LABEL: Record<EwbTransportMode, string> = {
  road: "Road",
  rail: "Rail",
  air: "Air",
  ship: "Ship",
};

const MODES: EwbTransportMode[] = ["road", "rail", "air", "ship"];

export function isEwbTransportMode(v: unknown): v is EwbTransportMode {
  return typeof v === "string" && (MODES as string[]).includes(v);
}

/** R: regular vehicle; O: over-dimensional cargo (ODC). */
export type EwbVehicleType = "R" | "O";

export type EwbTransportInput = {
  mode: EwbTransportMode;
  /** Kilometres; blank or 0 lets the IRP work it out from the two PIN codes. */
  distanceKm?: number | string | null;
  /** Transporter GSTIN or TRANSIN (15 characters). */
  transporterId?: string | null;
  transporterName?: string | null;
  vehicleNo?: string | null;
  vehicleType?: EwbVehicleType | null;
  /** LR / RR / AWB / bill of lading number. */
  transDocNo?: string | null;
  /** yyyy-mm-dd */
  transDocDate?: string | null;
};

/** Export bills: the port the goods go to, which the e-way bill shows as the destination. */
export type EwbPortAddress = {
  addr1?: string | null;
  addr2?: string | null;
  place?: string | null;
  pin?: string | number | null;
  /** GST state code of the port, 2 digits (e.g. 27). */
  stateCode?: string | null;
};

export type EwbByIrnPayload = {
  Irn: string;
  Distance: number;
  TransMode?: string;
  TransId?: string;
  TransName?: string;
  TransDocDt?: string;
  TransDocNo?: string;
  VehNo?: string;
  VehType?: EwbVehicleType;
  ExpShipDtls?: { Addr1: string; Addr2?: string; Loc: string; Pin: number; Stcd: string };
};

export type EwbProblemField =
  | "irn"
  | "distance"
  | "vehicle"
  | "transporter"
  | "transDoc"
  | "transDocDate"
  | "port";

export type EwbPayloadResult =
  | { ok: true; payload: EwbByIrnPayload; partAOnly: boolean }
  | { ok: false; field: EwbProblemField; error: string };

/** Transporter GSTIN and TRANSIN share this shape: 2 digits, then 13 letters or digits. */
const TRANSPORTER_ID = /^[0-9]{2}[0-9A-Z]{13}$/;
/** LR / RR / AWB number on the IRP: up to 15 letters, digits, / or -. */
const TRANS_DOC_NO = /^[A-Za-z0-9/-]{1,15}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Vehicle numbers are matched by the e-way bill portal without spaces or dashes. */
export function cleanVehicleNo(raw: string | null | undefined): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clean(v: string | null | undefined, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Whole kilometres 0 to 4000, or null when it isn't one. Blank counts as 0 (the IRP works it out). */
export function ewbDistance(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return 0;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0 || n > 4000 || Math.floor(n) !== n) return null;
  return n;
}

export type EwbTransportPart = {
  mode: EwbTransportMode;
  /** 0 lets the system work it out from the two PIN codes. */
  distance: number;
  transporterId: string;
  /** "" when shorter than 3 characters (left out). */
  transporterName: string;
  vehicleNo: string;
  vehicleType: EwbVehicleType;
  transDocNo: string;
  /** yyyy-mm-dd or "". */
  transDocDate: string;
  /** Vehicle (road) or RR / AWB / bill of lading (other modes) given; false: Part A only. */
  partB: boolean;
};

/**
 * The transport half of an e-way bill, after the portal's own checks: road needs a vehicle
 * number, rail / air / ship need the LR / RR / AWB number and date. With only the
 * transporter's GSTIN / TRANSIN it is Part A only (vehicle added later).
 */
export function ewbTransportPart(
  t: EwbTransportInput,
  dates: { docDate: string; today: string },
): { ok: true; part: EwbTransportPart } | { ok: false; field: EwbProblemField; error: string } {
  const mode: EwbTransportMode = isEwbTransportMode(t.mode) ? t.mode : "road";
  const distance = ewbDistance(t.distanceKm);
  if (distance === null) {
    return { ok: false, field: "distance", error: "Distance must be whole kilometres from 0 to 4000. Leave it blank to let the IRP work it out." };
  }

  const transporterId = String(t.transporterId ?? "").trim().toUpperCase();
  if (transporterId && !TRANSPORTER_ID.test(transporterId)) {
    return { ok: false, field: "transporter", error: "Transporter ID must be the transporter's 15-character GSTIN or TRANSIN." };
  }
  const transporterName = clean(t.transporterName, 100);
  const vehicleNo = cleanVehicleNo(t.vehicleNo);
  if (vehicleNo && (vehicleNo.length < 4 || vehicleNo.length > 15)) {
    return { ok: false, field: "vehicle", error: "Vehicle number looks wrong. Type it as on the RC, e.g. MH12AB1234." };
  }
  const transDocNo = clean(t.transDocNo, 15).replace(/\s+/g, "");
  if (transDocNo && !TRANS_DOC_NO.test(transDocNo)) {
    return { ok: false, field: "transDoc", error: "LR / RR / AWB number can have up to 15 letters, digits, / or -." };
  }
  const transDocDate = String(t.transDocDate ?? "").slice(0, 10);
  if (transDocDate && !ISO_DATE.test(transDocDate)) {
    return { ok: false, field: "transDocDate", error: "Transport document date is not a date." };
  }
  if (transDocDate && ISO_DATE.test(dates.docDate) && transDocDate < dates.docDate) {
    return { ok: false, field: "transDocDate", error: "Transport document date can't be before the bill date." };
  }
  if (transDocDate && ISO_DATE.test(dates.today) && transDocDate > dates.today) {
    return { ok: false, field: "transDocDate", error: "Transport document date can't be in the future." };
  }
  if (transDocNo && !transDocDate) {
    return { ok: false, field: "transDocDate", error: "Give the date of the LR / RR / AWB too." };
  }

  // Part B: the vehicle (road) or the railway / airway / shipping document (other modes).
  const partB = mode === "road" ? !!vehicleNo : !!transDocNo && !!transDocDate;
  if (!partB && !transporterId) {
    return mode === "road"
      ? {
        ok: false,
        field: "vehicle",
        error: "Give the vehicle number, or the transporter's GSTIN / TRANSIN to add the vehicle later.",
      }
      : {
        ok: false,
        field: "transDoc",
        error: `${EWB_MODE_LABEL[mode]}: give the ${mode === "rail" ? "RR" : mode === "air" ? "AWB" : "bill of lading"} number and date, or the transporter's GSTIN / TRANSIN.`,
      };
  }
  return {
    ok: true,
    part: {
      mode,
      distance,
      transporterId,
      transporterName: transporterName.length >= 3 ? transporterName : "",
      vehicleNo,
      vehicleType: t.vehicleType === "O" ? "O" : "R",
      transDocNo,
      transDocDate,
      partB,
    },
  };
}

/**
 * The GENERATE_EWAYBILL request for one IRN, after the IRP's own checks (see ewbTransportPart).
 * Empty values are left out: PeriOne rejects empty strings.
 */
export function buildEwbByIrnPayload(opts: {
  irn: string | null | undefined;
  /** Bill date, yyyy-mm-dd. */
  docDate: string;
  /** India date today, yyyy-mm-dd. */
  today: string;
  transport: EwbTransportInput;
  /** Export bills only. */
  exportPort?: EwbPortAddress | null;
  isExport?: boolean;
}): EwbPayloadResult {
  const irn = String(opts.irn ?? "").trim();
  if (irn.length !== 64) return { ok: false, field: "irn", error: "This bill has no IRN yet. Generate its e-invoice first." };

  const checked = ewbTransportPart(opts.transport, { docDate: opts.docDate, today: opts.today });
  if (checked.ok === false) {
    const bad = checked as { field: EwbProblemField; error: string };
    return { ok: false, field: bad.field, error: bad.error };
  }
  const t = (checked as { part: EwbTransportPart }).part;
  const partB = t.partB;

  const payload: EwbByIrnPayload = { Irn: irn, Distance: t.distance };
  if (t.transporterId) payload.TransId = t.transporterId;
  if (t.transporterName) payload.TransName = t.transporterName;
  if (partB) {
    payload.TransMode = EWB_MODE_CODE[t.mode];
    if (t.transDocNo) {
      payload.TransDocNo = t.transDocNo;
      payload.TransDocDt = ddmmyyyy(t.transDocDate);
    }
    if (t.vehicleNo) {
      payload.VehNo = t.vehicleNo;
      payload.VehType = t.vehicleType;
    }
  }

  if (opts.isExport) {
    const p = opts.exportPort ?? {};
    const addr1 = clean(p.addr1, 100);
    const addr2 = clean(p.addr2, 100);
    const place = clean(p.place, 100);
    const pin = Number(String(p.pin ?? "").trim());
    const stcd = String(p.stateCode ?? "").trim().padStart(2, "0");
    if (addr1.length < 3 || place.length < 3 || !(pin >= 100000 && pin <= 999999) || !/^(0[1-9]|[1-3][0-9])$/.test(stcd)) {
      return {
        ok: false,
        field: "port",
        error: "Export bill: give the port's address, place, PIN code and state. The e-way bill ends at the port.",
      };
    }
    payload.ExpShipDtls = { Addr1: addr1, Loc: place, Pin: pin, Stcd: stcd };
    if (addr2.length >= 3) payload.ExpShipDtls.Addr2 = addr2;
  }

  return { ok: true, payload, partAOnly: !partB };
}

/* ------------------------------------------------------------------ */
/* Replies                                                              */
/* ------------------------------------------------------------------ */

export type EwbReplyInfo = {
  ewbNo: string;
  /** As the IRP wrote it, India time ("2026-11-02 13:49:00"). */
  ewbDate: string;
  /** Empty while there is no Part B (no vehicle yet). */
  validTill: string;
  /** ACT active, CNL cancelled, when the IRP says. */
  status: string;
};

function replyData(resp: unknown): Record<string, unknown> | null {
  const r = (resp ?? {}) as Record<string, unknown>;
  let data: unknown = r.data ?? r.Data ?? null;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (Array.isArray(data)) data = data[0] ?? null;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/** The EWB number, date and validity from a GENERATE_EWAYBILL or GETEWAYBILLIRN reply; null without one. */
export function ewbReplyInfo(resp: unknown): EwbReplyInfo | null {
  const d = replyData(resp);
  if (!d) return null;
  const ewbNo = String(d.EwbNo ?? d.ewbNo ?? d.ewayBillNo ?? "").trim();
  if (!/^\d{12}$/.test(ewbNo)) return null;
  return {
    ewbNo,
    ewbDate: String(d.EwbDt ?? d.ewayBillDate ?? "").trim(),
    validTill: String(d.EwbValidTill ?? d.validUpto ?? "").trim(),
    status: String(d.Status ?? d.status ?? "").trim().toUpperCase(),
  };
}

/** The IRP says this IRN already has an e-way bill (code 4002): fetch it instead of failing. */
export function ewbAlreadyGenerated(resp: unknown, errorText: string): boolean {
  if (/\b4002\b/.test(errorText)) return true;
  if (/already\s+(been\s+)?generated/i.test(errorText) && /e-?way\s*bill|ewb/i.test(errorText)) return true;
  const r = (resp ?? {}) as Record<string, unknown>;
  const details = Array.isArray(r.ErrorDetails) ? r.ErrorDetails : [];
  return details.some((e) => String((e as Record<string, unknown>)?.ErrorCode ?? "") === "4002");
}

/**
 * Days an e-way bill stays valid: 1 day for each 200 km (or part), 20 km for
 * over-dimensional cargo. Each day ends at midnight. Null without a distance.
 */
export function ewbValidityDays(distanceKm: number | null | undefined, vehicleType: EwbVehicleType = "R"): number | null {
  const km = Number(distanceKm ?? 0);
  if (!Number.isFinite(km) || km <= 0) return null;
  return Math.max(1, Math.ceil(km / (vehicleType === "O" ? 20 : 200)));
}

/** Goods worth more than this need an e-way bill (some states set their own limit within the state). */
export const EWB_VALUE_LIMIT = 50_000;

/* ------------------------------------------------------------------ */
/* E-way bill API (PeriOne, NIC v1.03): Part B, cancel, extend         */
/* Phase 2 step 5b. Separate login from the e-invoice API.            */
/* ------------------------------------------------------------------ */

/** Why the vehicle changes (vehewb reasonCode). */
export const EWB_VEHICLE_REASONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "4", label: "First time" },
  { code: "1", label: "Vehicle broke down" },
  { code: "2", label: "Transhipment" },
  { code: "3", label: "Other" },
];

/** Why the e-way bill is cancelled (canewb cancelRsnCode). */
export const EWB_CANCEL_REASONS: ReadonlyArray<{ code: number; label: string }> = [
  { code: 1, label: "Duplicate" },
  { code: 2, label: "Order cancelled" },
  { code: 3, label: "Data entry mistake" },
  { code: 4, label: "Other" },
];

/** Why the validity is extended (extendvalidity extnRsnCode). */
export const EWB_EXTEND_REASONS: ReadonlyArray<{ code: number; label: string }> = [
  { code: 1, label: "Natural calamity" },
  { code: 2, label: "Law and order" },
  { code: 4, label: "Transhipment" },
  { code: 5, label: "Accident" },
  { code: 99, label: "Other" },
];

/** Goods in transit but not moving (extend): on the road, in a warehouse, or elsewhere. */
export type EwbTransitType = "R" | "W" | "O";

export const EWB_TRANSIT_LABEL: Record<EwbTransitType, string> = { R: "On road", W: "Warehouse", O: "Other" };

export type EwbApiField =
  | "ewbNo"
  | "vehicle"
  | "transDoc"
  | "transDocDate"
  | "place"
  | "state"
  | "pin"
  | "reason"
  | "remark"
  | "distance"
  | "address"
  | "window";

export type EwbApiPayloadResult =
  | { ok: true; payload: Record<string, string | number> }
  | { ok: false; field: EwbApiField; error: string };

const fail = (field: EwbApiField, error: string): EwbApiPayloadResult => ({ ok: false, field, error });

const HOUR = 3_600_000;

function ewbNoNumber(v: string | number | null | undefined): number | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return /^\d{12}$/.test(s) ? Number(s) : null;
}

/** GST state code as a number (1-38, or 97 other territory), else null. */
function stateNumber(v: string | number | null | undefined): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && ((n >= 1 && n <= 38) || n === 97) ? n : null;
}

const PLACE = /^[A-Za-z0-9 .,()/-]{3,50}$/;

type TransportCheck = { ok: true; vehicleNo: string; transDocNo: string; transDocDate: string } | { ok: false; result: EwbApiPayloadResult };

/** Road needs the vehicle; rail / air / ship need the RR / AWB / bill of lading number and date. */
function checkTransport(
  mode: EwbTransportMode,
  vehicleRaw: string | null | undefined,
  docNoRaw: string | null | undefined,
  docDateRaw: string | null | undefined,
  dates: { docDate?: string | null; today: string },
): TransportCheck {
  const vehicleNo = cleanVehicleNo(vehicleRaw);
  if (vehicleNo && (vehicleNo.length < 4 || vehicleNo.length > 15)) {
    return { ok: false, result: fail("vehicle", "Vehicle number looks wrong. Type it as on the RC, e.g. MH12AB1234.") };
  }
  const transDocNo = clean(docNoRaw, 15).replace(/\s+/g, "");
  if (transDocNo && !TRANS_DOC_NO.test(transDocNo)) {
    return { ok: false, result: fail("transDoc", "LR / RR / AWB number can have up to 15 letters, digits, / or -.") };
  }
  const transDocDate = String(docDateRaw ?? "").slice(0, 10);
  if (transDocDate && !ISO_DATE.test(transDocDate)) return { ok: false, result: fail("transDocDate", "Transport document date is not a date.") };
  if (transDocDate && dates.docDate && ISO_DATE.test(dates.docDate) && transDocDate < dates.docDate) {
    return { ok: false, result: fail("transDocDate", "Transport document date can't be before the bill date.") };
  }
  if (transDocDate && transDocDate > dates.today) {
    return { ok: false, result: fail("transDocDate", "Transport document date can't be in the future.") };
  }
  if (transDocNo && !transDocDate) return { ok: false, result: fail("transDocDate", "Give the date of the LR / RR / AWB too.") };
  if (mode === "road" && !vehicleNo) return { ok: false, result: fail("vehicle", "Give the vehicle number.") };
  if (mode !== "road" && (!transDocNo || !transDocDate)) {
    const doc = mode === "rail" ? "RR" : mode === "air" ? "AWB" : "bill of lading";
    return { ok: false, result: fail("transDoc", `${EWB_MODE_LABEL[mode]}: give the ${doc} number and date.`) };
  }
  return { ok: true, vehicleNo, transDocNo, transDocDate };
}

function remarkFor(reasonLabel: string | undefined, raw: string | null | undefined, isOther: boolean): string | null {
  const r = clean(raw, 50);
  if (r) return r;
  return isOther ? null : String(reasonLabel ?? "").slice(0, 50);
}

export type EwbVehicleUpdateInput = {
  mode: EwbTransportMode;
  vehicleNo?: string | null;
  transDocNo?: string | null;
  transDocDate?: string | null;
  /** Where the vehicle starts from now (town). */
  fromPlace?: string | null;
  /** GST state code of that place. */
  fromStateCode?: string | number | null;
  reasonCode?: string | null;
  reasonRemark?: string | null;
};

/** vehewb: add the vehicle (Part B) or change it. */
export function buildEwbVehiclePayload(opts: {
  ewbNo: string | number;
  input: EwbVehicleUpdateInput;
  /** Bill date, yyyy-mm-dd. */
  docDate?: string | null;
  /** India date today, yyyy-mm-dd. */
  today: string;
}): EwbApiPayloadResult {
  const ewbNo = ewbNoNumber(opts.ewbNo);
  if (!ewbNo) return fail("ewbNo", "This e-way bill number is not 12 digits.");
  const i = opts.input;
  const mode: EwbTransportMode = isEwbTransportMode(i.mode) ? i.mode : "road";
  const t = checkTransport(mode, i.vehicleNo, i.transDocNo, i.transDocDate, { docDate: opts.docDate, today: opts.today });
  if (t.ok === false) return (t as { result: EwbApiPayloadResult }).result;
  const fromPlace = clean(i.fromPlace, 50);
  if (!PLACE.test(fromPlace)) return fail("place", "Give the town the vehicle starts from (3 to 50 letters).");
  const fromState = stateNumber(i.fromStateCode);
  if (!fromState) return fail("state", "Choose the state the vehicle starts from.");
  const reason = EWB_VEHICLE_REASONS.find((r) => r.code === String(i.reasonCode ?? ""));
  if (!reason) return fail("reason", "Choose why the vehicle is being added or changed.");
  const reasonRem = remarkFor(reason.label, i.reasonRemark, reason.code === "3");
  if (!reasonRem) return fail("remark", "Say why, in a few words.");

  const payload: Record<string, string | number> = {
    ewbNo,
    fromPlace,
    fromState,
    reasonCode: reason.code,
    reasonRem,
    transMode: EWB_MODE_CODE[mode],
  };
  if (t.vehicleNo) payload.vehicleNo = t.vehicleNo;
  if (t.transDocNo) {
    payload.transDocNo = t.transDocNo;
    payload.transDocDate = ddmmyyyy(t.transDocDate);
  }
  return { ok: true, payload };
}

/** canewb: cancel within 24 hours of being made. */
export function buildEwbCancelPayload(opts: {
  ewbNo: string | number;
  reasonCode: number | string | null | undefined;
  remark?: string | null;
  /** When it was made (ISO), to check the 24 hours. */
  ewbDate?: string | null;
  now?: Date;
}): EwbApiPayloadResult {
  const ewbNo = ewbNoNumber(opts.ewbNo);
  if (!ewbNo) return fail("ewbNo", "This e-way bill number is not 12 digits.");
  const made = opts.ewbDate ? Date.parse(opts.ewbDate) : NaN;
  const now = (opts.now ?? new Date()).getTime();
  if (Number.isFinite(made) && now - made > 24 * HOUR) {
    return fail("window", "An e-way bill can be cancelled only within 24 hours of being made.");
  }
  const reason = EWB_CANCEL_REASONS.find((r) => r.code === Number(opts.reasonCode));
  if (!reason) return fail("reason", "Choose why it is being cancelled.");
  const cancelRmrk = remarkFor(reason.label, opts.remark, reason.code === 4);
  if (!cancelRmrk) return fail("remark", "Say why, in a few words.");
  return { ok: true, payload: { ewbNo, cancelRsnCode: reason.code, cancelRmrk } };
}

export type EwbExtendInput = {
  /** M: goods moving; T: in transit but stopped (warehouse, road side). */
  consignment: "M" | "T";
  mode: EwbTransportMode;
  vehicleNo?: string | null;
  transDocNo?: string | null;
  transDocDate?: string | null;
  /** Where the goods are now. */
  fromPlace?: string | null;
  fromPincode?: string | number | null;
  fromStateCode?: string | number | null;
  /** Kilometres still to go. */
  remainingKm?: string | number | null;
  reasonCode?: number | string | null;
  remark?: string | null;
  transitType?: EwbTransitType | null;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
};

/** The portal accepts an extension from 8 hours before to 8 hours after the e-way bill lapses. */
export function ewbExtendWindow(validTill: string | null | undefined): { from: string; to: string } | null {
  const t = validTill ? Date.parse(validTill) : NaN;
  if (!Number.isFinite(t)) return null;
  return { from: new Date(t - 8 * HOUR).toISOString(), to: new Date(t + 8 * HOUR).toISOString() };
}

/** extendvalidity: more days when the goods won't reach in time. */
export function buildEwbExtendPayload(opts: {
  ewbNo: string | number;
  input: EwbExtendInput;
  validTill: string | null | undefined;
  /** Distance on the e-way bill, when known: what remains can't be more. */
  distanceKm?: number | null;
  docDate?: string | null;
  today: string;
  now?: Date;
}): EwbApiPayloadResult {
  const ewbNo = ewbNoNumber(opts.ewbNo);
  if (!ewbNo) return fail("ewbNo", "This e-way bill number is not 12 digits.");
  const win = ewbExtendWindow(opts.validTill);
  if (!win) return fail("window", "Add the vehicle (Part B) first: an e-way bill without a vehicle has no validity to extend.");
  const now = (opts.now ?? new Date()).getTime();
  if (now < Date.parse(win.from) || now > Date.parse(win.to)) {
    return fail("window", "It can be extended only from 8 hours before to 8 hours after it lapses.");
  }
  const i = opts.input;
  const fromPlace = clean(i.fromPlace, 50);
  if (!PLACE.test(fromPlace)) return fail("place", "Give the town where the goods are now (3 to 50 letters).");
  const pin = Number(String(i.fromPincode ?? "").trim());
  if (!(Number.isInteger(pin) && pin >= 100000 && pin <= 999999)) return fail("pin", "Give the 6-digit PIN code where the goods are now.");
  const fromState = stateNumber(i.fromStateCode);
  if (!fromState) return fail("state", "Choose the state where the goods are now.");
  const km = Number(String(i.remainingKm ?? "").trim());
  if (!Number.isInteger(km) || km < 1 || km > 4000) return fail("distance", "Give the kilometres still to go (whole number, 1 to 4000).");
  if (opts.distanceKm && opts.distanceKm > 0 && km > opts.distanceKm) {
    return fail("distance", `Kilometres still to go can't be more than the e-way bill's ${opts.distanceKm} km.`);
  }
  const reason = EWB_EXTEND_REASONS.find((r) => r.code === Number(i.reasonCode));
  if (!reason) return fail("reason", "Choose why it needs more time.");
  const extnRemarks = remarkFor(reason.label, i.remark, reason.code === 99);
  if (!extnRemarks) return fail("remark", "Say why, in a few words.");

  const payload: Record<string, string | number> = {
    ewbNo,
    fromPlace,
    fromPincode: pin,
    fromState,
    remainingDistance: km,
    extnRsnCode: reason.code,
    extnRemarks,
  };

  if (i.consignment === "T") {
    const transitType: EwbTransitType = i.transitType === "W" || i.transitType === "O" ? i.transitType : "R";
    const a1 = clean(i.address1, 50);
    const a2 = clean(i.address2, 50);
    const a3 = clean(i.address3, 50);
    if (a1.length < 3 || a2.length < 3 || a3.length < 3) {
      return fail("address", "Goods not moving: give the address where they are, in three lines.");
    }
    Object.assign(payload, {
      consignmentStatus: "T",
      transMode: "5",
      transitType,
      addressLine1: a1,
      addressLine2: a2,
      addressLine3: a3,
    });
    return { ok: true, payload };
  }

  const mode: EwbTransportMode = isEwbTransportMode(i.mode) ? i.mode : "road";
  const t = checkTransport(mode, i.vehicleNo, i.transDocNo, i.transDocDate, { docDate: opts.docDate, today: opts.today });
  if (t.ok === false) return (t as { result: EwbApiPayloadResult }).result;
  Object.assign(payload, { consignmentStatus: "M", transMode: EWB_MODE_CODE[mode] });
  if (t.vehicleNo) payload.vehicleNo = t.vehicleNo;
  if (t.transDocNo) {
    payload.transDocNo = t.transDocNo;
    payload.transDocDate = ddmmyyyy(t.transDocDate);
  }
  return { ok: true, payload };
}

/* E-way bill API replies -------------------------------------------- */

/** The reply's data when the e-way bill system accepted the request (status_cd 1), else null. */
export function ewbApiData(resp: unknown): Record<string, unknown> | null {
  const r = (resp ?? {}) as Record<string, unknown>;
  const ok = String(r.status_cd ?? r.status ?? "").trim().toLowerCase();
  if (ok !== "1" && ok !== "success") return null;
  return replyData(resp) ?? {};
}

const EWB_ERROR_TEXT: Record<string, string> = {
  "238": "The e-way bill login has expired. Try again.",
  "312": "This e-way bill was not made by this GSTIN, or it is already cancelled.",
  "315": "Its validity has lapsed, so it can't be cancelled.",
  "316": "It has been verified by an officer, so it can't be cancelled.",
  "604": "This bill number already has an e-way bill (made earlier or on the portal). Look it up on the e-way bill portal.",
};

/** A readable reason from a refused e-way bill API reply. */
export function ewbApiErrorText(resp: unknown, fallback: string): string {
  const r = (resp ?? {}) as Record<string, unknown>;
  const err = (r.error ?? {}) as Record<string, unknown>;
  const raw = [err.message, err.desc, r.status_desc, r.message].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  let codes: string[] = [];
  let text = raw ?? "";
  if (raw && /errorCodes/i.test(raw)) {
    try {
      const parsed = JSON.parse(raw) as { errorCodes?: string };
      codes = String(parsed.errorCodes ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      text = "";
    } catch {
      codes = (raw.match(/\d{3,4}/g) ?? []).slice(0, 3);
    }
  }
  const errCd = String(err.error_cd ?? err.code ?? "").trim();
  if (!codes.length && /^\d{3,4}$/.test(errCd)) codes = [errCd];
  const known = codes.map((c) => EWB_ERROR_TEXT[c]).filter(Boolean);
  const parts = [...known, text].filter(Boolean);
  const msg = parts.length ? parts.join(" ") : fallback;
  return codes.length ? `${msg} (code ${codes.join(", ")})` : msg;
}

/**
 * Date-time from the e-way bill system, India time, as an ISO instant:
 * "06/09/2026 11:59:00 PM", "06/09/2026 23:59:00" or "2026-09-06 23:59:00".
 */
export function parseEwbApiDateTime(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let y: number, mo: number, d: number, h: number, mi: number, se: number;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    [d, mo, y, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    se = Number(m[6] ?? 0);
    const ap = (m[7] ?? "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
  } else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    se = Number(m[6] ?? 0);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se) - 330 * 60_000).toISOString();
}

/** New validity from a vehewb or extendvalidity reply. */
export function ewbApiValidUpto(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  return parseEwbApiDateTime(data.validUpto ?? data.ValidUpto ?? data.validUptoDate ?? null);
}

/**
 * The shop's E-Way Bill switch (Settings > Sale > E-Way Bill, einvoice_settings.ewb_enabled).
 * Any shop can turn it on, with or without E-Invoice. A shop in Industrial mode with E-Invoice
 * on that never touched it keeps e-way bills on, as it had them before the switch existed.
 */
export function ewayBillSwitchOn(einvoiceSettings: unknown, industrialOn: boolean): boolean {
  const s = einvoiceSettings as { ewb_enabled?: unknown; enabled?: unknown } | null | undefined;
  return typeof s?.ewb_enabled === "boolean" ? s.ewb_enabled : industrialOn && s?.enabled === true;
}

/**
 * E-way bills are on for the shop. Bills with an e-invoice get theirs from the IRN (e-invoice
 * login); bills without one get a direct e-way bill (PeriOne's e-way bill keys).
 */
export function ewayBillEnabled(einvoiceSettings: unknown, industrialOn: boolean): boolean {
  return ewayBillSwitchOn(einvoiceSettings, industrialOn);
}

/* ------------------------------------------------------------------ */
/* Direct e-way bill (Phase 2 step 6): a bill with no e-invoice, made  */
/* through the e-way bill API (genewaybill, NIC v1.03).                */
/* ------------------------------------------------------------------ */

export type EwbDirectLine = {
  description: string;
  hsn: string;
  qty: number;
  /** UQC, e.g. PCS. */
  unit: string;
  taxable: number;
  gstPercent: number;
  gstAmount: number;
};

export type EwbDirectParty = {
  gstin?: string | null;
  name: string | null;
  address: string | null;
};

/** Where the goods go: needed when the address has no PIN, or the buyer has no GSTIN (its state). */
export type EwbShipTo = {
  pin?: string | number | null;
  place?: string | null;
  /** GST state code, 2 digits. */
  stateCode?: string | number | null;
};

export type EwbDirectField =
  | EwbProblemField
  | "seller"
  | "docNo"
  | "docDate"
  | "toPin"
  | "toPlace"
  | "toState"
  | "lines"
  | "total"
  | "subSupply";

export type EwbDirectItem = {
  productName: string;
  productDesc: string;
  hsnCode: number;
  quantity: number;
  qtyUnit: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonadvol: number;
  taxableAmount: number;
};

export type EwbDirectPayload = {
  supplyType: "O";
  subSupplyType: string;
  /** Needed with sub supply type 8 (Others), up to 20 characters. */
  subSupplyDesc?: string;
  docType: "INV" | "CHL";
  docNo: string;
  docDate: string;
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2?: string;
  fromPlace: string;
  fromPincode: number;
  actFromStateCode: number;
  fromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2?: string;
  toPlace: string;
  toPincode: number;
  actToStateCode: number;
  toStateCode: number;
  transactionType: number;
  otherValue: number;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  cessNonAdvolValue: number;
  totInvValue: number;
  transDistance: string;
  transMode?: string;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
  vehicleNo?: string;
  vehicleType?: EwbVehicleType;
  itemList: EwbDirectItem[];
};

export type EwbDirectResult =
  | { ok: true; payload: EwbDirectPayload; partAOnly: boolean; interState: boolean }
  | { ok: false; field: EwbDirectField; error: string };

const GSTIN = /^[0-9]{2}[0-9A-Z]{13}$/;
/** Document number on the e-way bill: up to 16 letters, digits, / or -. */
const EWB_DOC_NO = /^[A-Za-z0-9/-]{1,16}$/;
/** The e-way bill takes at most this many item lines. */
export const EWB_MAX_ITEMS = 250;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const numOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/** First 6-digit run in an address as a PIN code (100000-999999), else null. */
export function ewbPinIn(address: string | null | undefined): number | null {
  const m = String(address ?? "").match(/(?:^|\D)(\d{6})(?!\d)/);
  const pin = m ? parseInt(m[1], 10) : NaN;
  return pin >= 100000 && pin <= 999999 ? pin : null;
}

/** Town of an address: the last comma part without its PIN, 3 to 50 characters, or "". */
export function ewbTownIn(address: string | null | undefined): string {
  const parts = String(address ?? "")
    .split(/[,\n]/)
    .map((p) => p.replace(/\d{6}/g, "").replace(/[^A-Za-z0-9 .()/-]/g, " ").replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, ""))
    .filter((p) => p.length >= 3);
  const last = parts[parts.length - 1] ?? "";
  return last.slice(0, 50);
}

function addrLines(address: string | null | undefined, fallback: string): { a1: string; a2: string } {
  const flat = String(address ?? "").replace(/\s+/g, " ").trim();
  const a1 = (flat.slice(0, 120).trim() || fallback).slice(0, 120);
  const a2 = flat.slice(120, 240).trim();
  return { a1: a1.length >= 1 ? a1 : fallback, a2 };
}

/* Delivery challans (step 6b) ---------------------------------------- */

/** Why goods move on a delivery challan: outward sub supply types that take a challan (NIC). */
export const EWB_CHALLAN_SUB_SUPPLY: ReadonlyArray<{ code: string; label: string; hint: string }> = [
  { code: "4", label: "Job work", hint: "Goods sent to a job worker." },
  { code: "5", label: "For own use", hint: "Your own branch or godown on the same GSTIN." },
  { code: "12", label: "Exhibition or fair", hint: "Goods sent to an exhibition or fair." },
  { code: "10", label: "Line sales", hint: "Goods taken out to sell on the way." },
  { code: "11", label: "Recipient not known", hint: "The buyer is not known when the goods leave." },
  { code: "9", label: "SKD / CKD / lots", hint: "One supply sent in parts." },
  { code: "8", label: "Others", hint: "Say why in a few words (up to 20 letters)." },
];

/** NIC limit on the "Others" reason. */
export const EWB_SUB_SUPPLY_DESC_MAX = 20;

/** Starting reason for a challan's e-way bill, from the challan type (Industrial mode); the shop can change it. */
export function challanEwbSubSupply(challanType: string | null | undefined): { code: string; desc: string } {
  switch (challanType) {
    case "job_work":
      return { code: "4", desc: "" };
    case "branch_transfer":
      return { code: "5", desc: "" };
    case "supply_on_approval":
      return { code: "8", desc: "Supply on approval" };
    case "repair_return":
      return { code: "8", desc: "Repair/replacement" };
    case "others":
      return { code: "8", desc: "Sample/testing" };
    default:
      return { code: "8", desc: "Bill to follow" };
  }
}

/** Label of a sub supply type code for screens and the print ("Supply" for a bill). */
export function ewbSubSupplyLabel(code: string | null | undefined, desc?: string | null): string {
  const c = String(code ?? "").trim();
  if (!c || c === "1") return "Supply";
  if (c === "8") return String(desc ?? "").trim() || "Others";
  return EWB_CHALLAN_SUB_SUPPLY.find((s) => s.code === c)?.label ?? "Others";
}

/** One challan line as read for its e-way bill. */
export type EwbChallanLineInput = {
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  /** Line value as saved on the challan (after line discount). */
  value: number;
  gstPercent: number;
};

/**
 * E-way bill lines of a delivery challan. A challan carries no GST, so each line's value is read
 * as GST-inclusive at the product's sale GST rate (as the challan print shows it), and the lines
 * are scaled to the challan's saved total (flat discount), the round off staying outside.
 */
export function challanEwbLines(opts: {
  items: EwbChallanLineInput[];
  netAmount: number | null | undefined;
  roundOff?: number | null;
}): { lines: EwbDirectLine[]; netAmount: number } {
  const items = opts.items.filter((i) => numOf(i.value) > 0);
  const sum = items.reduce((s, i) => s + numOf(i.value), 0);
  const saved = numOf(opts.netAmount);
  const roundOff = numOf(opts.roundOff);
  const target = saved - roundOff;
  const scale = sum > 0 && target > 0 && target <= sum + 1;
  const keep = scale ? target / sum : 1;
  const lines: EwbDirectLine[] = items.map((i) => {
    const value = numOf(i.value) * keep;
    const rate = numOf(i.gstPercent);
    const taxable = r2(value / (1 + rate / 100));
    return {
      description: String(i.description ?? ""),
      hsn: String(i.hsn ?? "").trim(),
      qty: numOf(i.qty) || 1,
      unit: String(i.unit ?? "").trim() || "PCS",
      taxable,
      gstPercent: rate,
      gstAmount: r2(value - taxable),
    };
  });
  return { lines, netAmount: scale ? saved : r2(sum + roundOff) };
}

/** The document an e-way bill is made from: a sale bill (default) or a delivery challan. */
export type EwbDirectDoc = {
  type: "INV" | "CHL";
  /** Outward sub supply type: 1 Supply for a bill; a challan reason from EWB_CHALLAN_SUB_SUPPLY. */
  subSupplyType: string;
  subSupplyDesc?: string | null;
};

const BILL_DOC: EwbDirectDoc = { type: "INV", subSupplyType: "1" };

/**
 * genewaybill request for a sale bill without an e-invoice (or a delivery challan), or the first problem to fix.
 * Lines are grouped by HSN, GST rate and unit (the e-way bill shows goods by HSN). Service
 * lines (SAC 99…) are not goods: their value goes into other value. The difference to the
 * bill's saved total (freight, round off) goes into other value too, so totals match exactly.
 */
export function buildDirectEwbPayload(opts: {
  docNo: string | null | undefined;
  /** Bill date, yyyy-mm-dd. */
  docDate: string;
  /** India date today, yyyy-mm-dd. */
  today: string;
  seller: EwbDirectParty;
  buyer: EwbDirectParty;
  shipTo?: EwbShipTo | null;
  lines: EwbDirectLine[];
  /** The bill total as saved. */
  netAmount: number;
  transport: EwbTransportInput;
  /** Bill (default) or delivery challan, with why the goods move. */
  doc?: EwbDirectDoc | null;
}): EwbDirectResult {
  const doc = opts.doc ?? BILL_DOC;
  const noun = doc.type === "CHL" ? "challan" : "bill";
  const Noun = doc.type === "CHL" ? "Challan" : "Bill";
  const subSupplyType = doc.type === "CHL" ? String(doc.subSupplyType ?? "").trim() : "1";
  const subSupplyDesc = String(doc.subSupplyDesc ?? "").replace(/\s+/g, " ").trim();
  if (doc.type === "CHL") {
    if (!EWB_CHALLAN_SUB_SUPPLY.some((s) => s.code === subSupplyType)) {
      return { ok: false, field: "subSupply", error: "Pick why the goods move (job work, own use, others…)." };
    }
    if (subSupplyType === "8" && (subSupplyDesc.length < 1 || subSupplyDesc.length > EWB_SUB_SUPPLY_DESC_MAX)) {
      return { ok: false, field: "subSupply", error: `Say why the goods move in up to ${EWB_SUB_SUPPLY_DESC_MAX} letters, e.g. "Supply on approval".` };
    }
  }
  const ownUse = subSupplyType === "5";

  const docNo = String(opts.docNo ?? "").trim();
  if (!EWB_DOC_NO.test(docNo)) {
    return { ok: false, field: "docNo", error: `${Noun} number ${docNo || "(blank)"} can't go on an e-way bill: it takes up to 16 letters, digits, / and -.` };
  }
  const docDate = String(opts.docDate ?? "").slice(0, 10);
  if (!ISO_DATE.test(docDate)) return { ok: false, field: "docDate", error: `The ${noun} has no date.` };
  if (ISO_DATE.test(opts.today) && docDate > opts.today) {
    return { ok: false, field: "docDate", error: `The ${noun} date is in the future. An e-way bill can't be made for it yet.` };
  }

  const sellerGstin = String(opts.seller.gstin ?? "").trim().toUpperCase();
  if (!GSTIN.test(sellerGstin)) {
    return { ok: false, field: "seller", error: "Shop GSTIN missing or wrong. Fix it in Settings > Business Details." };
  }
  const fromPin = ewbPinIn(opts.seller.address);
  if (!fromPin) {
    return { ok: false, field: "seller", error: "Shop PIN code missing. Add the 6-digit PIN to the address in Settings > Business Details." };
  }
  const fromState = Number(sellerGstin.slice(0, 2));
  const fromPlace = ewbTownIn(opts.seller.address);
  if (fromPlace.length < 3) {
    return { ok: false, field: "seller", error: "Shop town missing. End the address in Settings > Business Details with the town, e.g. \"..., Surat 395003\"." };
  }

  const rawBuyerGstin = String(opts.buyer.gstin ?? "").trim().toUpperCase();
  // Own use: the goods stay with the shop (its branch or godown), so both sides carry its GSTIN.
  const registered = ownUse || GSTIN.test(rawBuyerGstin);
  if (!ownUse && registered && rawBuyerGstin === sellerGstin) {
    return {
      ok: false,
      field: doc.type === "CHL" ? "subSupply" : "seller",
      error: doc.type === "CHL"
        ? "This customer has the shop's own GSTIN. For your own branch or godown, pick \"For own use\"."
        : "Customer GSTIN is the same as the shop GSTIN.",
    };
  }
  const toGstin = ownUse ? sellerGstin : registered ? rawBuyerGstin : "URP";
  const ship = opts.shipTo ?? {};
  const shipState = String(ship.stateCode ?? "").trim() ? stateNumber(ship.stateCode) : null;
  if (String(ship.stateCode ?? "").trim() && shipState === null) {
    return { ok: false, field: "toState", error: "Pick the state the goods go to." };
  }
  if (ownUse && shipState !== null && shipState !== fromState) {
    return {
      ok: false,
      field: "toState",
      error: "Your own GSTIN covers one state. Goods to a branch in another state go on a tax invoice to that branch's GSTIN.",
    };
  }
  // Billing state: the buyer's GSTIN; a buyer without one is billed in the state the goods go to.
  const toState = ownUse ? fromState : registered ? Number(rawBuyerGstin.slice(0, 2)) : shipState ?? fromState;
  const actToState = shipState ?? toState;
  const pinRaw = String(ship.pin ?? "").trim();
  const toPin = pinRaw ? Number(pinRaw) : ewbPinIn(opts.buyer.address);
  if (!toPin || !Number.isInteger(toPin) || toPin < 100000 || toPin > 999999) {
    return { ok: false, field: "toPin", error: "Give the 6-digit PIN code where the goods go." };
  }
  const toPlace = String(ship.place ?? "").replace(/\s+/g, " ").trim().slice(0, 50) || ewbTownIn(opts.buyer.address);
  if (toPlace.length < 3 || !PLACE.test(toPlace)) {
    return { ok: false, field: "toPlace", error: "Give the town the goods go to (3 to 50 letters)." };
  }

  // Goods lines, grouped by HSN + rate + unit.
  type Group = { names: string[]; hsn: string; unit: string; rate: number; qty: number; taxable: number; gst: number };
  const groups = new Map<string, Group>();
  let serviceValue = 0;
  for (const [i, l] of opts.lines.entries()) {
    const hsn = String(l.hsn ?? "").trim();
    const taxable = numOf(l.taxable);
    const gst = numOf(l.gstAmount);
    if (taxable <= 0) continue;
    if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)) {
      return {
        ok: false,
        field: "lines",
        error: `Line ${i + 1} (${String(l.description ?? "").trim() || "item"}) needs an HSN code of 4, 6 or 8 digits${hsn ? ` (it has ${hsn})` : ""}. Add it in the product master or the ${noun}.`,
      };
    }
    if (hsn.startsWith("99")) {
      serviceValue += taxable + gst;
      continue;
    }
    const rate = numOf(l.gstPercent);
    const unit = String(l.unit ?? "").trim().toUpperCase() || "PCS";
    const key = `${hsn}|${rate}|${unit}`;
    const g = groups.get(key) ?? { names: [], hsn, unit, rate, qty: 0, taxable: 0, gst: 0 };
    const name = String(l.description ?? "").replace(/\s+/g, " ").trim();
    if (name && !g.names.includes(name)) g.names.push(name);
    g.qty += numOf(l.qty) || 0;
    g.taxable += taxable;
    g.gst += gst;
    groups.set(key, g);
  }
  if (groups.size === 0) {
    return {
      ok: false,
      field: "lines",
      error: serviceValue > 0
        ? `This ${noun} has only services. An e-way bill is for goods.`
        : doc.type === "CHL"
          ? "This challan has no item values. An e-way bill needs the value of the goods: add the rates to the challan."
          : "This bill has no lines with a value.",
    };
  }
  if (groups.size > EWB_MAX_ITEMS) {
    return { ok: false, field: "lines", error: `This ${noun} has ${groups.size} HSN / rate groups. An e-way bill takes at most ${EWB_MAX_ITEMS}.` };
  }

  const interState = fromState !== toState;
  const itemList: EwbDirectItem[] = [];
  let totalValue = 0;
  let cgstValue = 0;
  let sgstValue = 0;
  let igstValue = 0;
  for (const g of groups.values()) {
    const taxable = r2(g.taxable);
    const gst = r2(g.gst);
    const first = g.names[0] || `HSN ${g.hsn}`;
    const name = g.names.length > 1 ? `${first.slice(0, 85)} and ${g.names.length - 1} more` : first.slice(0, 100);
    itemList.push({
      productName: name.padEnd(3, "."),
      productDesc: g.names.join(", ").slice(0, 100) || name,
      hsnCode: Number(g.hsn),
      quantity: r3(g.qty) || 1,
      qtyUnit: g.unit,
      cgstRate: interState ? 0 : g.rate / 2,
      sgstRate: interState ? 0 : g.rate / 2,
      igstRate: interState ? g.rate : 0,
      cessRate: 0,
      cessNonadvol: 0,
      taxableAmount: taxable,
    });
    totalValue += taxable;
    if (interState) igstValue += gst;
    else {
      cgstValue += r2(gst / 2);
      sgstValue += r2(gst / 2);
    }
  }
  totalValue = r2(totalValue);
  cgstValue = r2(cgstValue);
  sgstValue = r2(sgstValue);
  igstValue = r2(igstValue);
  const net = r2(numOf(opts.netAmount));
  const otherValue = r2(net - (totalValue + cgstValue + sgstValue + igstValue));
  if (otherValue < -100) {
    return { ok: false, field: "total", error: `The ${noun} total ₹${net} is less than its lines. Open and save the ${noun} again.` };
  }

  const checked = ewbTransportPart(opts.transport, { docDate, today: opts.today });
  if (checked.ok === false) {
    const bad = checked as { field: EwbProblemField; error: string };
    return { ok: false, field: bad.field, error: bad.error };
  }
  const t = (checked as { part: EwbTransportPart }).part;

  const from = addrLines(opts.seller.address, fromPlace);
  const to = addrLines(opts.buyer.address, toPlace);
  const sellerName = String(opts.seller.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || sellerGstin;
  const buyerName = String(opts.buyer.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || (ownUse ? sellerName : "Customer");

  const payload: EwbDirectPayload = {
    supplyType: "O",
    subSupplyType,
    ...(subSupplyType === "8" ? { subSupplyDesc } : {}),
    docType: doc.type,
    docNo,
    docDate: ddmmyyyy(docDate),
    fromGstin: sellerGstin,
    fromTrdName: sellerName,
    fromAddr1: from.a1,
    ...(from.a2 ? { fromAddr2: from.a2 } : {}),
    fromPlace,
    fromPincode: fromPin,
    actFromStateCode: fromState,
    fromStateCode: fromState,
    toGstin,
    toTrdName: buyerName,
    toAddr1: to.a1,
    ...(to.a2 ? { toAddr2: to.a2 } : {}),
    toPlace,
    toPincode: toPin,
    actToStateCode: actToState,
    toStateCode: toState,
    transactionType: 1,
    otherValue,
    totalValue,
    cgstValue,
    sgstValue,
    igstValue,
    cessValue: 0,
    cessNonAdvolValue: 0,
    totInvValue: net,
    transDistance: String(t.distance),
    itemList,
  };
  if (t.transporterId) payload.transporterId = t.transporterId;
  if (t.transporterName) payload.transporterName = t.transporterName;
  if (t.partB) {
    payload.transMode = EWB_MODE_CODE[t.mode];
    if (t.transDocNo) {
      payload.transDocNo = t.transDocNo;
      payload.transDocDate = ddmmyyyy(t.transDocDate);
    }
    if (t.vehicleNo) {
      payload.vehicleNo = t.vehicleNo;
      payload.vehicleType = t.vehicleType;
    }
  }
  return { ok: true, payload, partAOnly: !t.partB, interState };
}

/** Number, date and validity from an accepted genewaybill reply, or null. */
export function ewbGenReplyInfo(data: Record<string, unknown> | null): { ewbNo: string; ewbDate: string | null; validTill: string | null } | null {
  if (!data) return null;
  const ewbNo = String(data.ewayBillNo ?? data.ewbNo ?? data.EwbNo ?? "").replace(/\D/g, "");
  if (!/^\d{12}$/.test(ewbNo)) return null;
  return {
    ewbNo,
    ewbDate: parseEwbApiDateTime(data.ewayBillDate ?? data.ewbDate ?? data.EwbDt ?? null),
    validTill: parseEwbApiDateTime(data.validUpto ?? data.ValidUpto ?? data.EwbValidTill ?? null),
  };
}
