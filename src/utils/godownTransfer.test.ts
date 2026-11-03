import { describe, expect, it } from "vitest";
import {
  CHALLAN_COPIES,
  addTransferLine,
  buildGodownChallanHtml,
  canCancelMove,
  cleanTransport,
  mergeGodownQty,
  qtyInGodown,
  setTransferLineQty,
  transferLineProblems,
  transferOrFilter,
  transferTotals,
  type GodownTransferItem,
} from "./godownTransfer";
import { isEntryFullscreenPath, isEntrySidebarOnlyPath, isFillHeightDashboardPath } from "@/lib/entryPageLayout";

const pipe: GodownTransferItem = {
  variant_id: "v1",
  product_name: "MS Pipe",
  brand: "Tata",
  size: "6M",
  color: null,
  barcode: "P1",
  uom: "KGS",
  rate: 61,
};

describe("godown transfer (Phase 3 step 3b)", () => {
  it("keeps the latest godown quantities of searched items", () => {
    let map = mergeGodownQty({}, ["v1", "v2"], [
      { variant_id: "v1", godown_id: "main", qty: "40" },
      { variant_id: "v1", godown_id: "bhw", qty: 12.5 },
      { variant_id: "v2", godown_id: "main", qty: -2 },
    ]);
    expect(qtyInGodown(map, "v1", "bhw")).toBe(12.5);
    expect(qtyInGodown(map, "v2", "main")).toBe(-2);
    // Bhiwandi emptied since: a fresh read drops it.
    map = mergeGodownQty(map, ["v1"], [{ variant_id: "v1", godown_id: "main", qty: 52.5 }]);
    expect(qtyInGodown(map, "v1", "bhw")).toBe(0);
    expect(qtyInGodown(map, "v1", "main")).toBe(52.5);
    expect(qtyInGodown(map, "v2", "main")).toBe(-2);
    expect(qtyInGodown(map, "v1", null)).toBe(0);
  });

  it("adds a scan, raises it on repeat scans and stops at the godown stock", () => {
    let r = addTransferLine([], pipe, 2.5, "Main");
    expect(r.ok && r.lines[0].qty).toBe(1);
    r = addTransferLine(r.lines, pipe, 2.5, "Main");
    expect(r.ok && r.lines[0].qty).toBe(2);
    r = addTransferLine(r.lines, pipe, 2.5, "Main");
    expect(r.ok && r.lines[0].qty).toBe(2.5);
    const full = addTransferLine(r.lines, pipe, 2.5, "Main");
    expect(full.ok).toBe(false);
    expect(!full.ok && (full as { reason: string }).reason).toBe("Only 2.5 of MS Pipe / 6M is in Main");
    expect((addTransferLine([], pipe, 0, "Bhiwandi") as { reason: string }).reason).toBe("No MS Pipe / 6M in Bhiwandi");
    expect((addTransferLine([], pipe, 0.4, "Bhiwandi") as { lines: { qty: number }[] }).lines[0].qty).toBe(0.4);
  });

  it("marks lines over the stock of the From godown, and totals at cost", () => {
    const map = mergeGodownQty({}, ["v1"], [
      { variant_id: "v1", godown_id: "main", qty: 10 },
      { variant_id: "v1", godown_id: "bhw", qty: 3 },
    ]);
    const lines = setTransferLineQty([{ ...pipe, qty: 1 }], "v1", 4.1234);
    expect(lines[0].qty).toBe(4.123);
    expect(transferLineProblems(lines, map, "main", "Main")).toEqual({});
    expect(transferLineProblems(lines, map, "bhw", "Bhiwandi")).toEqual({ v1: "Only 3 in Bhiwandi" });
    expect(transferLineProblems(setTransferLineQty(lines, "v1", 0), map, "main", "Main")).toEqual({ v1: "Enter a quantity above 0" });
    expect(transferTotals(lines)).toEqual({ items: 1, qty: 4.123, value: 251.5 });
  });

  it("cleans transport details and the list filter", () => {
    expect(cleanTransport({ vehicle_no: "mh 04 ab-1234", transporter_name: "  ", lr_no: "" })).toEqual({ vehicle_no: "MH04AB1234" });
    expect(cleanTransport({})).toBeNull();
    expect(transferOrFilter(null, "")).toBeNull();
    expect(transferOrFilter("g1", "GT/26,(1)")).toBe("and(or(from_godown_id.eq.g1,to_godown_id.eq.g1),or(move_no.ilike.%GT/26  1%,note.ilike.%GT/26  1%))");
    expect(canCancelMove({ status: "done", ref_type: "transfer" })).toBe(true);
    expect(canCancelMove({ status: "done", ref_type: "sale" })).toBe(false);
    expect(canCancelMove({ status: "cancelled", ref_type: "transfer" })).toBe(false);
  });

  it("prints a Rule 55 delivery challan with both godowns and the shop GSTIN", () => {
    const place = { address: "Kalher", pincode: "421302", contact_name: null, contact_phone: null };
    const html = buildGodownChallanHtml({
      shop: { name: "Shree Steel", address: "Mumbai", gstin: "27ABCDE1234F1Z5", phone: "" },
      move: { move_no: "GT/26-27/4", move_date: "2026-11-03", note: "For site", status: "done", transport: { vehicle_no: "MH04AB1234" } },
      from: { ...place, name: "Main", godown_type: "main" },
      to: { ...place, name: "Bhiwandi <B>", godown_type: "godown" },
      items: [{ ...pipe, qty: 960.5, value: 58590.5, hsn_code: "7306" }],
      copies: [...CHALLAN_COPIES],
    });
    expect(html).toContain("DELIVERY CHALLAN");
    expect(html).toContain("GT/26-27/4");
    expect(html).toContain("03/11/2026");
    expect(html).toContain("MH04AB1234");
    expect(html).toContain("Bhiwandi &lt;B&gt;");
    expect(html).toContain("7306");
    expect(html).toContain("58,590.50");
    expect(html).toContain("Rule 55");
    expect(html.match(/class="page"/g)?.length).toBe(3);
    expect(html).not.toContain("CANCELLED");
  });

  it("opens the transfer entry full screen like the other entry forms", () => {
    expect(isEntryFullscreenPath("/demo/godown-transfer-entry")).toBe(true);
    expect(isEntrySidebarOnlyPath("/demo/godown-transfer-entry")).toBe(true);
    expect(isEntryFullscreenPath("/demo/godown-transfers")).toBe(false);
    expect(isFillHeightDashboardPath("/demo/godown-transfer-entry")).toBe(false);
    expect(isEntryFullscreenPath("/demo/stock-transfer-entry")).toBe(true);
  });
});
