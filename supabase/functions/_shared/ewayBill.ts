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

/**
 * The GENERATE_EWAYBILL request for one IRN, after the IRP's own checks:
 * road needs a vehicle number, rail / air / ship need the LR / RR / AWB number and date.
 * With only the transporter's GSTIN / TRANSIN it is Part A only (vehicle added later).
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

  const t = opts.transport;
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
  if (transDocDate && ISO_DATE.test(opts.docDate) && transDocDate < opts.docDate) {
    return { ok: false, field: "transDocDate", error: "Transport document date can't be before the bill date." };
  }
  if (transDocDate && ISO_DATE.test(opts.today) && transDocDate > opts.today) {
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

  const payload: EwbByIrnPayload = { Irn: irn, Distance: distance };
  if (transporterId) payload.TransId = transporterId;
  if (transporterName.length >= 3) payload.TransName = transporterName;
  if (partB) {
    payload.TransMode = EWB_MODE_CODE[mode];
    if (transDocNo) {
      payload.TransDocNo = transDocNo;
      payload.TransDocDt = ddmmyyyy(transDocDate);
    }
    if (vehicleNo) {
      payload.VehNo = vehicleNo;
      payload.VehType = t.vehicleType === "O" ? "O" : "R";
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
