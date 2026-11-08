import { describe, expect, it } from "vitest";
import {
  buildDirectEwbPayload,
  godownEwbAddress,
  godownTransferEwbLines,
  godownTransferEwbPlaces,
} from "../../supabase/functions/_shared/ewayBill";
import { ewbDocOf, ewbMatchesSearch, ewbRegisterExcelRows, type EwayBillRegisterRow } from "./ewayBill";

const SHOP = "Shree Steel, Gala 4, Masjid Bunder, Mumbai 400009";
const main = { name: "Main", godown_type: "main", address: null, pincode: null };
const bhiwandi = { name: "Bhiwandi", godown_type: "godown", address: "Plot 12, Kalher, Bhiwandi", pincode: "421302" };

describe("e-way bill for godown transfers (Phase 3 step 3b)", () => {
  it("uses each godown's address with its PIN; Main falls back to the shop address", () => {
    expect(godownEwbAddress(main, SHOP)).toBe(SHOP);
    expect(godownEwbAddress(bhiwandi, SHOP)).toBe("Plot 12, Kalher, Bhiwandi 421302");
    // The PIN saved on the godown wins over one typed in its address.
    expect(godownEwbAddress({ ...bhiwandi, address: "Plot 12, Kalher, Bhiwandi 400001" }, SHOP)).toBe("Plot 12, Kalher, Bhiwandi 421302");
    expect(godownEwbAddress({ ...bhiwandi, address: null }, SHOP)).toBe("421302");
    expect(godownEwbAddress({ ...bhiwandi, address: null, pincode: null }, SHOP)).toBe("");
  });

  it("says which godown needs a PIN or town before anything is sent", () => {
    const ok = godownTransferEwbPlaces(main, bhiwandi, SHOP);
    expect(ok).toEqual({ ok: true, from: SHOP, to: "Plot 12, Kalher, Bhiwandi 421302" });
    const noPin = godownTransferEwbPlaces(main, { ...bhiwandi, pincode: null }, SHOP);
    expect(noPin).toMatchObject({ ok: false, field: "toPin" });
    expect((noPin as { error: string }).error).toContain("Bhiwandi has no 6-digit PIN code");
    const noTown = godownTransferEwbPlaces({ ...bhiwandi, name: "Vasai", address: null }, main, SHOP);
    expect(noTown).toMatchObject({ ok: false, field: "seller" });
    expect((noTown as { error: string }).error).toContain("Vasai needs an address ending with its town");
  });

  it("sends the goods at their value with no GST", () => {
    const { lines, netAmount } = godownTransferEwbLines([
      { description: "MS Pipe", hsn: "7306", qty: 960.5, unit: "KGS", value: 58590.5 },
      { description: "GI Elbow", hsn: "7307", qty: 40, unit: "", value: 1200 },
      { description: "No rate", hsn: "7307", qty: 5, unit: "NOS", value: 0 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ description: "MS Pipe", hsn: "7306", qty: 960.5, unit: "KGS", taxable: 58590.5, gstPercent: 0, gstAmount: 0 });
    expect(lines[1].unit).toBe("PCS");
    expect(netAmount).toBe(59790.5);
  });

  it("builds an own-use delivery challan from one godown to the other on the shop GSTIN", () => {
    const where = godownTransferEwbPlaces(bhiwandi, main, SHOP) as { from: string; to: string };
    const { lines, netAmount } = godownTransferEwbLines([{ description: "MS Pipe", hsn: "7306", qty: 960.5, unit: "KGS", value: 58590.5 }]);
    const r = buildDirectEwbPayload({
      docNo: "GT/26-27/4",
      docDate: "2026-11-03",
      today: "2026-11-03",
      seller: { gstin: "27AAACR1234A1Z5", name: "Shree Steel", address: where.from },
      buyer: { gstin: "27AAACR1234A1Z5", name: "Shree Steel", address: where.to },
      shipTo: null,
      lines,
      netAmount,
      transport: { mode: "road", vehicleNo: "MH04AB1234", distanceKm: "35" },
      doc: { type: "CHL", subSupplyType: "5", subSupplyDesc: null, noun: "transfer" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = (r as { payload: Record<string, unknown> & { itemList: Record<string, unknown>[] } }).payload;
    expect(p).toMatchObject({
      supplyType: "O",
      subSupplyType: "5",
      docType: "CHL",
      docNo: "GT/26-27/4",
      fromGstin: "27AAACR1234A1Z5",
      fromPlace: "Bhiwandi",
      fromPincode: 421302,
      toGstin: "27AAACR1234A1Z5",
      toPlace: "Mumbai",
      toPincode: 400009,
      toStateCode: 27,
      totalValue: 58590.5,
      cgstValue: 0,
      sgstValue: 0,
      igstValue: 0,
      otherValue: 0,
      totInvValue: 58590.5,
      vehicleNo: "MH04AB1234",
    });
    expect(p.itemList[0]).toMatchObject({ hsnCode: 7306, quantity: 960.5, qtyUnit: "KGS", cgstRate: 0, sgstRate: 0, igstRate: 0 });
  });

  it("register rows show the transfer", () => {
    const row = {
      id: "e3",
      sale_id: null,
      challan_id: null,
      purchase_return_id: null,
      godown_move_id: "m1",
      sub_supply_type: "5",
      sub_supply_desc: null,
      ewb_no: "141008536850",
      ewb_date: "2026-11-03T06:00:00.000Z",
      valid_till: null,
      status: "active",
      test_mode: true,
      trans_mode: "road",
      distance_km: 35,
      transporter_id: null,
      transporter_name: null,
      vehicle_no: "MH04AB1234",
      vehicle_type: "R",
      trans_doc_no: null,
      trans_doc_date: null,
      doc_no: "GT/26-27/4",
      doc_date: "2026-11-03",
      doc_type: "CHL",
      irn: null,
      generated_via: "direct",
      created_at: "2026-11-03T06:00:00.000Z",
      sales: null,
      delivery_challans: null,
      purchase_returns: null,
      godown_moves: { id: "m1", move_no: "GT/26-27/4", move_date: "2026-11-03", total_value: 58590.5 },
    } as EwayBillRegisterRow;
    expect(ewbDocOf(row)).toEqual({ kind: "godown_transfer", id: "m1", number: "GT/26-27/4", date: "2026-11-03", party: "Own godown", value: 58590.5 });
    expect(ewbMatchesSearch(row, "GT/26-27/4")).toBe(true);
    expect(ewbRegisterExcelRows([row])[0]).toMatchObject({ Document: "Godown transfer", "Bill No": "GT/26-27/4", Value: 58591 });
    // Saved before the step 3b SQL's join could be read: still a godown transfer, not a challan.
    expect(ewbDocOf({ ...row, godown_moves: null }).kind).toBe("godown_transfer");
  });
});
