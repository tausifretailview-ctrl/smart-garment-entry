import { describe, expect, it } from "vitest";
import {
  buildEwbByIrnPayload,
  cleanVehicleNo,
  ewbAlreadyGenerated,
  ewbDistance,
  ewbReplyInfo,
  ewbValidityDays,
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
