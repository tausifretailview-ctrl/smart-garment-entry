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
