import { describe, expect, it } from "vitest";
import {
  buildEwbByIrnPayload,
  buildEwbCancelPayload,
  buildEwbExtendPayload,
  buildEwbVehiclePayload,
  ewbApiData,
  ewbApiErrorText,
  ewbApiValidUpto,
  ewbExtendWindow,
  parseEwbApiDateTime,
  cleanVehicleNo,
  ewbAlreadyGenerated,
  ewbDistance,
  ewbReplyInfo,
  ewbValidityDays,
  ewayBillEnabled,
  ewayBillSwitchOn,
  buildDirectEwbPayload,
  ewbGenReplyInfo,
  ewbPinIn,
  ewbTownIn,
} from "../../supabase/functions/_shared/ewayBill";
import {
  ewbAlertKind,
  ewbCancelUntil,
  ewbExtendUntil,
  ewbFormFromB2b,
  ewbHsnSummary,
  ewbInRegisterView,
  ewbMatchesSearch,
  ewbModeName,
  ewbPlaceOf,
  ewbRegisterExcelRows,
  ewbTransportInput,
  ewbValidity,
  formatEwbNo,
  formatIstDateTime,
  istDayRange,
  parseEwbRegisterView,
  summarizeEwbAlerts,
  type EwayBillRegisterRow,
} from "./ewayBill";

const IRN = "a".repeat(64);
const base = { irn: IRN, docDate: "2026-11-02", today: "2026-11-02" };

describe("e-way bill from IRN: request (Phase 2 step 4)", () => {
  it("road with a vehicle is Part A + Part B, empty values left out", () => {
    const r = buildEwbByIrnPayload({
      ...base,
      transport: { mode: "road", distanceKm: "142", vehicleNo: "mh 04-ab 1234", transporterName: "", transDocNo: "", transDocDate: "" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partAOnly).toBe(false);
    expect(r.payload).toEqual({ Irn: IRN, Distance: 142, TransMode: "1", VehNo: "MH04AB1234", VehType: "R" });
  });

  it("blank distance is 0 so the IRP works it out from the PIN codes", () => {
    const r = buildEwbByIrnPayload({ ...base, transport: { mode: "road", distanceKm: "", vehicleNo: "MH04AB1234" } });
    expect(r.ok && r.payload.Distance).toBe(0);
  });

  it("LR number goes as dd/mm/yyyy with the vehicle, transporter id and name", () => {
    const r = buildEwbByIrnPayload({
      ...base,
      transport: {
        mode: "road",
        distanceKm: 20,
        vehicleNo: "MH04AB1234",
        vehicleType: "O",
        transporterId: "27aaacv1234a1z5",
        transporterName: "VRL Logistics",
        transDocNo: "LR 5582",
        transDocDate: "2026-11-02",
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({
      TransId: "27AAACV1234A1Z5",
      TransName: "VRL Logistics",
      TransDocNo: "LR5582",
      TransDocDt: "02/11/2026",
      VehType: "O",
    });
  });

  it("transporter id alone is Part A only (vehicle added later)", () => {
    const r = buildEwbByIrnPayload({ ...base, transport: { mode: "road", transporterId: "27AAACV1234A1Z5" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partAOnly).toBe(true);
    expect(r.payload).toEqual({ Irn: IRN, Distance: 0, TransId: "27AAACV1234A1Z5" });
  });

  it("road without vehicle or transporter is refused", () => {
    const r = buildEwbByIrnPayload({ ...base, transport: { mode: "road" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("vehicle");
  });

  it("rail / air / ship need the document number and date", () => {
    const noDoc = buildEwbByIrnPayload({ ...base, transport: { mode: "air", vehicleNo: "MH04AB1234" } });
    expect(noDoc.ok).toBe(false);
    if (!noDoc.ok) expect(noDoc.field).toBe("transDoc");
    const ok = buildEwbByIrnPayload({ ...base, transport: { mode: "rail", transDocNo: "RR991", transDocDate: "2026-11-02" } });
    expect(ok.ok && ok.payload).toEqual({ Irn: IRN, Distance: 0, TransMode: "2", TransDocNo: "RR991", TransDocDt: "02/11/2026" });
  });

  it("checks distance, transporter id, document date and the IRN", () => {
    const t = { mode: "road" as const, vehicleNo: "MH04AB1234" };
    const far = buildEwbByIrnPayload({ ...base, transport: { ...t, distanceKm: 4001 } });
    expect(!far.ok && far.field).toBe("distance");
    const half = buildEwbByIrnPayload({ ...base, transport: { ...t, distanceKm: "12.5" } });
    expect(!half.ok && half.field).toBe("distance");
    const badId = buildEwbByIrnPayload({ ...base, transport: { ...t, transporterId: "ABC" } });
    expect(!badId.ok && badId.field).toBe("transporter");
    const early = buildEwbByIrnPayload({ ...base, transport: { ...t, transDocNo: "55", transDocDate: "2026-11-01" } });
    expect(!early.ok && early.field).toBe("transDocDate");
    const later = buildEwbByIrnPayload({ ...base, transport: { ...t, transDocNo: "55", transDocDate: "2026-11-03" } });
    expect(!later.ok && later.field).toBe("transDocDate");
    const noDate = buildEwbByIrnPayload({ ...base, transport: { ...t, transDocNo: "55" } });
    expect(!noDate.ok && noDate.field).toBe("transDocDate");
    const noIrn = buildEwbByIrnPayload({ ...base, irn: null, transport: t });
    expect(!noIrn.ok && noIrn.field).toBe("irn");
  });

  it("export bill needs the port address, sent as ExpShipDtls", () => {
    const t = { mode: "road" as const, vehicleNo: "MH04AB1234" };
    const missing = buildEwbByIrnPayload({ ...base, isExport: true, transport: t, exportPort: { addr1: "JNPT" } });
    expect(!missing.ok && missing.field).toBe("port");
    const r = buildEwbByIrnPayload({
      ...base,
      isExport: true,
      transport: t,
      exportPort: { addr1: "JNPT, Sheva", addr2: "", place: "Navi Mumbai", pin: "400707", stateCode: "27" },
    });
    expect(r.ok && r.payload.ExpShipDtls).toEqual({ Addr1: "JNPT, Sheva", Loc: "Navi Mumbai", Pin: 400707, Stcd: "27" });
    const domestic = buildEwbByIrnPayload({ ...base, transport: t, exportPort: { addr1: "JNPT, Sheva" } });
    expect(domestic.ok && domestic.payload.ExpShipDtls).toBe(undefined);
  });
});

describe("e-way bill replies", () => {
  it("reads the EWB number, date and validity from the IRP reply", () => {
    const reply = {
      status_cd: "1",
      data: { EwbNo: 141008536848, EwbDt: "2026-11-02 13:49:00", EwbValidTill: "2026-11-03 23:59:00", Remarks: null },
    };
    expect(ewbReplyInfo(reply)).toEqual({
      ewbNo: "141008536848",
      ewbDate: "2026-11-02 13:49:00",
      validTill: "2026-11-03 23:59:00",
      status: "",
    });
  });

  it("accepts data sent as a JSON string, and reads a cancelled status", () => {
    const reply = { status_cd: "1", data: JSON.stringify({ EwbNo: "141008536848", Status: "CNL" }) };
    expect(ewbReplyInfo(reply)?.status).toBe("CNL");
  });

  it("no EWB number means no e-way bill", () => {
    expect(ewbReplyInfo({ status_cd: "0", error: { message: "Invalid" } })).toBe(null);
    expect(ewbReplyInfo({ data: { EwbNo: "123" } })).toBe(null);
  });

  it("spots 'already generated for this IRN' so the bill reads it back", () => {
    expect(ewbAlreadyGenerated({}, "4002: EwayBill is already generated for this IRN")).toBe(true);
    expect(ewbAlreadyGenerated({ ErrorDetails: [{ ErrorCode: "4002", ErrorMessage: "x" }] }, "x")).toBe(true);
    expect(ewbAlreadyGenerated({}, "Invalid vehicle number")).toBe(false);
  });
});

describe("e-way bill helpers", () => {
  it("distance, vehicle number and validity days", () => {
    expect(ewbDistance(null)).toBe(0);
    expect(ewbDistance("250")).toBe(250);
    expect(ewbDistance("-1")).toBe(null);
    expect(cleanVehicleNo(" mh-04 ab 1234 ")).toBe("MH04AB1234");
    expect(ewbValidityDays(142)).toBe(1);
    expect(ewbValidityDays(201)).toBe(2);
    expect(ewbValidityDays(45, "O")).toBe(3);
    expect(ewbValidityDays(0)).toBe(null);
  });

  it("dialog starts from the transport details saved on the bill", () => {
    const form = ewbFormFromB2b({
      transport_mode: "rail",
      vehicle_no: "MH04AB1234",
      transporter_id: "27AAACV1234A1Z5",
      transporter_name: "VRL",
      lr_no: "RR1",
      lr_date: "2026-11-02",
      distance_km: 300,
    });
    expect(form).toMatchObject({ mode: "rail", distanceKm: "300", vehicleNo: "MH04AB1234", transDocNo: "RR1", transDocDate: "2026-11-02" });
    expect(ewbTransportInput({ ...form, distanceKm: " " }).distanceKm).toBe(null);
    expect(ewbFormFromB2b(null).mode).toBe("road");
  });

  it("formats the number and validity for the list", () => {
    expect(formatEwbNo("141008536848")).toBe("1410 0853 6848");
    expect(formatIstDateTime("2026-11-03T18:29:00.000Z")).toBe("03/11/2026 23:59");
    const now = new Date("2026-11-02T08:00:00Z");
    expect(ewbValidity({ status: "active", valid_till: "2026-11-03T18:29:00.000Z" }, now).tone).toBe("ok");
    expect(ewbValidity({ status: "active", valid_till: "2026-11-02T12:00:00.000Z" }, now).tone).toBe("soon");
    expect(ewbValidity({ status: "active", valid_till: "2026-11-01T18:29:00.000Z" }, now).tone).toBe("expired");
    expect(ewbValidity({ status: "active", valid_till: null }, now).tone).toBe("partA");
    expect(ewbValidity({ status: "cancelled", valid_till: null }, now).label).toBe("Cancelled");
  });
});

describe("e-way bill register and alerts (Phase 2 step 5a)", () => {
  const now = new Date("2026-11-02T08:00:00Z"); // 13:30 India time
  const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();
  const active = (validTill: string | null, made = at(-20)) => ({ status: "active", valid_till: validTill, ewb_date: made });

  it("sorts each e-way bill into what needs doing", () => {
    expect(ewbAlertKind(active(at(5)), now)).toBe("soon");
    expect(ewbAlertKind(active(at(30)), now)).toBe(null);
    expect(ewbAlertKind(active(at(-2)), now)).toBe("extend");
    expect(ewbAlertKind(active(at(-9)), now)).toBe(null);
    expect(ewbAlertKind(active(null), now)).toBe("partA");
    expect(ewbAlertKind(active(null, at(-16 * 24)), now)).toBe(null);
    expect(ewbAlertKind({ status: "cancelled", valid_till: at(2), ewb_date: at(-1) }, now)).toBe(null);
  });

  it("counts the alerts and finds the next one to lapse", () => {
    const s = summarizeEwbAlerts([active(at(6)), active(at(3)), active(at(-1)), active(null), active(at(48))], now);
    expect(s).toMatchObject({ soon: 2, extend: 1, partA: 1, total: 4 });
    expect(s.nextExpiry).toBe(at(3));
  });

  it("extend and cancel deadlines", () => {
    expect(ewbExtendUntil("2026-11-02T18:29:00.000Z")).toBe("2026-11-03T02:29:00.000Z");
    expect(ewbExtendUntil(null)).toBe(null);
    expect(ewbCancelUntil({ status: "active", ewb_date: at(-20) }, now)).toBe(at(4));
    expect(ewbCancelUntil({ status: "active", ewb_date: at(-25) }, now)).toBe(null);
    expect(ewbCancelUntil({ status: "cancelled", ewb_date: at(-1) }, now)).toBe(null);
  });

  it("register views: valid, alerts, expired, cancelled", () => {
    expect(parseEwbRegisterView("soon")).toBe("soon");
    expect(parseEwbRegisterView("junk")).toBe("all");
    expect(ewbInRegisterView(active(at(30)), "active", now)).toBe(true);
    expect(ewbInRegisterView(active(at(5)), "active", now)).toBe(true);
    expect(ewbInRegisterView(active(at(-30)), "expired", now)).toBe(true);
    expect(ewbInRegisterView(active(at(-2)), "extend", now)).toBe(true);
    expect(ewbInRegisterView({ status: "cancelled", valid_till: null, ewb_date: at(-1) }, "cancelled", now)).toBe(true);
    expect(ewbInRegisterView(active(null), "partA", now)).toBe(true);
    expect(ewbInRegisterView(active(null), "expired", now)).toBe(false);
  });

  it("India date range for the register query", () => {
    expect(istDayRange("2026-11-01", "2026-11-30")).toEqual({
      start: "2026-10-31T18:30:00.000Z",
      end: "2026-11-30T18:29:59.999Z",
    });
  });

  const row = (over: Partial<EwayBillRegisterRow> = {}): EwayBillRegisterRow => ({
    id: "e1",
    sale_id: "s1",
    ewb_no: "141008536848",
    ewb_date: "2026-11-02T08:19:00.000Z",
    valid_till: "2026-11-03T18:29:00.000Z",
    status: "active",
    test_mode: true,
    trans_mode: "road",
    distance_km: 142,
    transporter_id: "27AAACV1234A1Z5",
    transporter_name: "VRL Logistics",
    vehicle_no: "MH04AB1234",
    vehicle_type: "R",
    trans_doc_no: "LR5582",
    trans_doc_date: "2026-11-02",
    doc_no: "INV/26-27/101",
    doc_date: "2026-11-02",
    irn: "a".repeat(64),
    generated_via: "irn",
    created_at: "2026-11-02T08:19:05.000Z",
    sales: {
      id: "s1",
      sale_number: "INV/26-27/101",
      sale_date: "2026-11-02",
      customer_id: "c1",
      customer_name: "Shree Steel Traders",
      net_amount: 125000.4,
      irn: "a".repeat(64),
      einvoice_status: "generated",
      einvoice_test_mode: true,
    },
    ...over,
  });

  it("search finds EWB number with spaces, vehicle typed loosely, bill and customer", () => {
    const r = row();
    expect(ewbMatchesSearch(r, "1410 0853")).toBe(true);
    expect(ewbMatchesSearch(r, "mh 04-ab")).toBe(true);
    expect(ewbMatchesSearch(r, "26-27/101")).toBe(true);
    expect(ewbMatchesSearch(r, "steel")).toBe(true);
    expect(ewbMatchesSearch(r, "vrl")).toBe(true);
    expect(ewbMatchesSearch(r, "gujarat")).toBe(false);
    expect(ewbMatchesSearch(r, "  ")).toBe(true);
  });

  it("Excel row carries the EWB, bill, transport and status", () => {
    const [x] = ewbRegisterExcelRows([row()], now);
    expect(x).toMatchObject({
      "EWB No": "141008536848",
      "EWB Date": "02/11/2026 13:49",
      "Valid Till": "03/11/2026 23:59",
      "Bill No": "INV/26-27/101",
      "Bill Date": "02/11/2026",
      Customer: "Shree Steel Traders",
      Value: 125000,
      Mode: "Road",
      "Vehicle No": "MH04AB1234",
      "LR / Doc Date": "02/11/2026",
      "Distance km": 142,
      Sandbox: "Yes",
    });
    expect(String(x.Status)).toContain("Valid till");
  });

  it("print helpers: mode, HSN order, place and PIN", () => {
    expect(ewbModeName("rail")).toBe("Rail");
    expect(ewbModeName("3")).toBe("Air");
    expect(ewbModeName(null)).toBe("");
    expect(
      ewbHsnSummary([
        { hsn_code: "7326", line_total: 1000 },
        { hsn_code: "7308", line_total: 5000 },
        { hsn_code: "7326", line_total: 4500 },
        { hsn_code: "", line_total: 99 },
      ]),
    ).toEqual(["7326", "7308"]);
    expect(ewbPlaceOf("Gala 4, MIDC Road, Bhiwandi - 421302")).toEqual({ place: "Bhiwandi", pin: "421302" });
    expect(ewbPlaceOf("Plot 12, Chakan, Pune 410501")).toEqual({ place: "Pune", pin: "410501" });
    expect(ewbPlaceOf("")).toEqual({ place: "", pin: "" });
  });
});

describe("e-way bill API: vehicle, cancel, extend (Phase 2 step 5b)", () => {
  const EWB = "141008536848";
  const today = "2026-11-02";

  it("vehicle update: road with a reason, empty values left out", () => {
    const r = buildEwbVehiclePayload({
      ewbNo: "1410 0853 6848",
      today,
      docDate: "2026-11-01",
      input: { mode: "road", vehicleNo: "mh 12-ab 1234", fromPlace: "Bhiwandi", fromStateCode: "27", reasonCode: "1" },
    });
    expect(r).toEqual({
      ok: true,
      payload: {
        ewbNo: 141008536848,
        fromPlace: "Bhiwandi",
        fromState: 27,
        reasonCode: "1",
        reasonRem: "Vehicle broke down",
        transMode: "1",
        vehicleNo: "MH12AB1234",
      },
    });
  });

  it("vehicle update: rail needs RR no and date; 'Other' needs a remark", () => {
    const base = { ewbNo: EWB, today, input: { mode: "rail" as const, fromPlace: "Pune", fromStateCode: 27, reasonCode: "4" } };
    const noDoc = buildEwbVehiclePayload(base);
    expect(!noDoc.ok && noDoc.field).toBe("transDoc");
    const ok = buildEwbVehiclePayload({ ...base, input: { ...base.input, transDocNo: "RR 991", transDocDate: "2026-11-02" } });
    expect(ok.ok && ok.payload).toMatchObject({ transMode: "2", transDocNo: "RR991", transDocDate: "02/11/2026", reasonRem: "First time" });
    const other = buildEwbVehiclePayload({ ewbNo: EWB, today, input: { mode: "road", vehicleNo: "MH12AB1234", fromPlace: "Pune", fromStateCode: 27, reasonCode: "3" } });
    expect(!other.ok && other.field).toBe("remark");
    const noState = buildEwbVehiclePayload({ ewbNo: EWB, today, input: { mode: "road", vehicleNo: "MH12AB1234", fromPlace: "Pune", reasonCode: "4" } });
    expect(!noState.ok && noState.field).toBe("state");
    const badNo = buildEwbVehiclePayload({ ewbNo: "123", today, input: { mode: "road" } });
    expect(!badNo.ok && badNo.field).toBe("ewbNo");
  });

  it("cancel: within 24 hours, with a reason", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const r = buildEwbCancelPayload({ ewbNo: EWB, reasonCode: 2, ewbDate: "2026-11-02T08:00:00Z", now });
    expect(r).toEqual({ ok: true, payload: { ewbNo: 141008536848, cancelRsnCode: 2, cancelRmrk: "Order cancelled" } });
    const late = buildEwbCancelPayload({ ewbNo: EWB, reasonCode: 2, ewbDate: "2026-11-01T11:00:00Z", now });
    expect(!late.ok && late.field).toBe("window");
    const other = buildEwbCancelPayload({ ewbNo: EWB, reasonCode: "4", ewbDate: "2026-11-02T08:00:00Z", now });
    expect(!other.ok && other.field).toBe("remark");
    const noReason = buildEwbCancelPayload({ ewbNo: EWB, reasonCode: null, now });
    expect(!noReason.ok && noReason.field).toBe("reason");
  });

  it("extend: only 8 hours either side of lapsing", () => {
    expect(ewbExtendWindow("2026-11-02T18:29:00.000Z")).toEqual({ from: "2026-11-02T10:29:00.000Z", to: "2026-11-03T02:29:00.000Z" });
    const input = { consignment: "M" as const, mode: "road" as const, vehicleNo: "MH12AB1234", fromPlace: "Surat", fromPincode: "395003", fromStateCode: "24", remainingKm: "120", reasonCode: 5 };
    const early = buildEwbExtendPayload({ ewbNo: EWB, input, validTill: "2026-11-02T18:29:00.000Z", today, now: new Date("2026-11-02T09:00:00Z") });
    expect(!early.ok && early.field).toBe("window");
    const partA = buildEwbExtendPayload({ ewbNo: EWB, input, validTill: null, today });
    expect(!partA.ok && partA.field).toBe("window");
    const ok = buildEwbExtendPayload({ ewbNo: EWB, input, validTill: "2026-11-02T18:29:00.000Z", distanceKm: 300, today, now: new Date("2026-11-02T15:00:00Z") });
    expect(ok).toEqual({
      ok: true,
      payload: {
        ewbNo: 141008536848,
        fromPlace: "Surat",
        fromPincode: 395003,
        fromState: 24,
        remainingDistance: 120,
        extnRsnCode: 5,
        extnRemarks: "Accident",
        consignmentStatus: "M",
        transMode: "1",
        vehicleNo: "MH12AB1234",
      },
    });
    const far = buildEwbExtendPayload({ ewbNo: EWB, input: { ...input, remainingKm: 400 }, validTill: "2026-11-02T18:29:00.000Z", distanceKm: 300, today, now: new Date("2026-11-02T15:00:00Z") });
    expect(!far.ok && far.field).toBe("distance");
  });

  it("extend: goods stopped in a warehouse go as transit with the address", () => {
    const now = new Date("2026-11-02T20:00:00Z");
    const base = { consignment: "T" as const, mode: "road" as const, fromPlace: "Surat", fromPincode: 395003, fromStateCode: 24, remainingKm: 80, reasonCode: 1, transitType: "W" as const };
    const noAddr = buildEwbExtendPayload({ ewbNo: EWB, input: base, validTill: "2026-11-02T18:29:00.000Z", today, now });
    expect(!noAddr.ok && noAddr.field).toBe("address");
    const ok = buildEwbExtendPayload({
      ewbNo: EWB,
      input: { ...base, address1: "Godown 4", address2: "Ring Road", address3: "Surat" },
      validTill: "2026-11-02T18:29:00.000Z",
      today,
      now,
    });
    expect(ok.ok && ok.payload).toMatchObject({ consignmentStatus: "T", transMode: "5", transitType: "W", addressLine1: "Godown 4" });
    expect(ok.ok && "vehicleNo" in ok.payload).toBe(false);
  });

  it("reads replies: accepted data, refusals with NIC codes, and dates", () => {
    expect(ewbApiData({ status_cd: "1", data: JSON.stringify({ validUpto: "03/11/2026 11:59:00 PM" }) })).toEqual({ validUpto: "03/11/2026 11:59:00 PM" });
    expect(ewbApiData({ status_cd: "0", error: { message: "x" } })).toBe(null);
    expect(ewbApiValidUpto({ validUpto: "03/11/2026 11:59:00 PM" })).toBe("2026-11-03T18:29:00.000Z");
    expect(parseEwbApiDateTime("03/11/2026 12:05:00 AM")).toBe("2026-11-02T18:35:00.000Z");
    expect(parseEwbApiDateTime("2026-11-03 23:59:00")).toBe("2026-11-03T18:29:00.000Z");
    expect(parseEwbApiDateTime("junk")).toBe(null);
    expect(ewbApiErrorText({ status_cd: "0", error: { message: '{"errorCodes":"315,"}' } }, "Failed")).toBe(
      "Its validity has lapsed, so it can't be cancelled. (code 315)",
    );
    expect(ewbApiErrorText({ status_cd: "0", error: { message: "Invalid vehicle number" } }, "Failed")).toBe("Invalid vehicle number");
    expect(ewbApiErrorText({}, "Failed")).toBe("Failed");
  });
});

describe("E-Way Bill switch (Settings > Sale > E-Way Bill)", () => {
  it("is off for normal shops until they turn it on, with or without E-Invoice", () => {
    expect(ewayBillSwitchOn(undefined, false)).toBe(false);
    expect(ewayBillSwitchOn({ enabled: true }, false)).toBe(false);
    expect(ewayBillSwitchOn({ enabled: true, ewb_enabled: true }, false)).toBe(true);
    expect(ewayBillEnabled({ enabled: false, ewb_enabled: true }, false)).toBe(true);
    expect(ewayBillEnabled({ ewb_enabled: true }, false)).toBe(true);
  });

  it("stays on for Industrial mode shops with E-Invoice unless they turn it off", () => {
    expect(ewayBillSwitchOn({ enabled: true }, true)).toBe(true);
    expect(ewayBillSwitchOn({ enabled: false }, true)).toBe(false);
    expect(ewayBillSwitchOn({ enabled: true, ewb_enabled: false }, true)).toBe(false);
    expect(ewayBillEnabled(null, true)).toBe(false);
    expect(ewayBillEnabled({ enabled: "yes", ewb_enabled: "yes" }, false)).toBe(false);
  });
});

describe("direct e-way bill (bill without an e-invoice)", () => {
  const seller = { gstin: "27AAACR1234A1Z5", name: "Ezzy Textiles", address: "Shop 4, Main Road, Bhiwandi 421302" };
  const lines = [
    { description: "Cotton shirt", hsn: "6205", qty: 10, unit: "PCS", taxable: 50000, gstPercent: 5, gstAmount: 2500 },
    { description: "Linen shirt", hsn: "6205", qty: 2, unit: "PCS", taxable: 4000, gstPercent: 5, gstAmount: 200 },
    { description: "Jeans", hsn: "62034200", qty: 5, unit: "PCS", taxable: 10000, gstPercent: 12, gstAmount: 1200 },
    { description: "Stitching", hsn: "998821", qty: 1, unit: "OTH", taxable: 100, gstPercent: 18, gstAmount: 18 },
  ];
  const base = {
    docNo: "INV/26-27/101",
    docDate: "2026-11-02",
    today: "2026-11-02",
    seller,
    buyer: { gstin: "24AABCS1234B1Z2", name: "Shah Traders", address: "Ring Road, Surat 395002" },
    lines,
    netAmount: 68018,
    transport: { mode: "road" as const, vehicleNo: "MH 04 AB 1234", distanceKm: "280" },
  };

  it("reads PIN and town from an address", () => {
    expect(ewbPinIn("Ring Road, Surat 395002")).toBe(395002);
    expect(ewbPinIn("Phone 9876543210")).toBe(null);
    expect(ewbTownIn("Shop 4, Main Road, Bhiwandi 421302")).toBe("Bhiwandi");
    expect(ewbTownIn("")).toBe("");
  });

  it("groups goods by HSN and rate, charges IGST across states and keeps services in other value", () => {
    const r = buildDirectEwbPayload(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.interState).toBe(true);
    expect(r.partAOnly).toBe(false);
    const p = r.payload;
    expect(p).toMatchObject({
      supplyType: "O",
      subSupplyType: "1",
      docType: "INV",
      docDate: "02/11/2026",
      fromGstin: "27AAACR1234A1Z5",
      fromPlace: "Bhiwandi",
      fromPincode: 421302,
      fromStateCode: 27,
      toGstin: "24AABCS1234B1Z2",
      toPlace: "Surat",
      toPincode: 395002,
      toStateCode: 24,
      actToStateCode: 24,
      totalValue: 64000,
      igstValue: 3900,
      cgstValue: 0,
      otherValue: 118,
      totInvValue: 68018,
      transMode: "1",
      transDistance: "280",
      vehicleNo: "MH04AB1234",
      vehicleType: "R",
    });
    expect(p.itemList).toHaveLength(2);
    expect(p.itemList[0]).toMatchObject({ productName: "Cotton shirt and 1 more", hsnCode: 6205, quantity: 12, igstRate: 5, taxableAmount: 54000 });
  });

  it("bills a buyer without GSTIN as URP in the state the goods go to", () => {
    const r = buildDirectEwbPayload({ ...base, buyer: { gstin: "", name: "Walk-in", address: "Andheri, Mumbai 400053" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ toGstin: "URP", toStateCode: 27, cgstValue: 1950, sgstValue: 1950, igstValue: 0 });
    expect(r.payload.itemList[0]).toMatchObject({ cgstRate: 2.5, sgstRate: 2.5, igstRate: 0 });
    const away = buildDirectEwbPayload({ ...base, buyer: { gstin: null, name: "Walk-in", address: "" }, shipTo: { pin: "560001", place: "Bengaluru", stateCode: "29" } });
    expect(away.ok && away.payload).toMatchObject({ toGstin: "URP", toStateCode: 29, toPincode: 560001, toPlace: "Bengaluru", igstValue: 3900 });
  });

  it("stops with the field to fix", () => {
    const fieldOf = (r: ReturnType<typeof buildDirectEwbPayload>) => (r.ok ? null : r.field);
    expect(fieldOf(buildDirectEwbPayload({ ...base, buyer: { gstin: "", name: "X", address: "No pin here" } }))).toBe("toPin");
    expect(fieldOf(buildDirectEwbPayload({ ...base, seller: { ...seller, address: "Bhiwandi" } }))).toBe("seller");
    expect(fieldOf(buildDirectEwbPayload({ ...base, lines: [{ ...lines[0], hsn: "62" }] }))).toBe("lines");
    expect(fieldOf(buildDirectEwbPayload({ ...base, lines: [lines[3]] }))).toBe("lines");
    expect(fieldOf(buildDirectEwbPayload({ ...base, docNo: "INV 101 (copy)" }))).toBe("docNo");
    expect(fieldOf(buildDirectEwbPayload({ ...base, transport: { mode: "road" } }))).toBe("vehicle");
    const partA = buildDirectEwbPayload({ ...base, transport: { mode: "road", transporterId: "27ABCDE1234F1Z5" } });
    expect(partA.ok && partA.partAOnly).toBe(true);
    expect(partA.ok && "transMode" in partA.payload).toBe(false);
  });

  it("reads the genewaybill reply", () => {
    expect(ewbGenReplyInfo({ ewayBillNo: 381009876543, ewayBillDate: "02/11/2026 05:30:00 PM", validUpto: "03/11/2026 11:59:00 PM" })).toEqual({
      ewbNo: "381009876543",
      ewbDate: "2026-11-02T12:00:00.000Z",
      validTill: "2026-11-03T18:29:00.000Z",
    });
    expect(ewbGenReplyInfo({ alert: "x" })).toBe(null);
  });
});
