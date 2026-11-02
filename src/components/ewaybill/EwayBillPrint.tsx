import React, { useLayoutEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { GSTIN_STATE_NAMES } from "@/utils/gstRegisterUtils";
import { ewbDdMmYyyy, ewbModeName, ewbPlaceOf, formatEwbNo, formatIstDateTime, type EwayBillRow } from "@/utils/ewayBill";

export type EwbPrintParty = { name: string; gstin: string; address: string };

export type EwbPrintData = {
  ewb: EwayBillRow;
  doc: { number: string; date: string; value: number; supplyLabel: string; irn: string | null; ackNo: string | null };
  seller: EwbPrintParty;
  buyer: EwbPrintParty;
  hsn: string[];
  printedAt: string;
};

const ink = "#0f172a";
const muted = "#475569";
const rule = "1px solid #cbd5e1";
const cellLabel: React.CSSProperties = { padding: "4px 8px", fontSize: "9.5px", color: muted, width: "34%", verticalAlign: "top", borderBottom: rule };
const cellValue: React.CSSProperties = { padding: "4px 8px", fontSize: "10px", color: ink, fontWeight: 600, verticalAlign: "top", borderBottom: rule };
const th: React.CSSProperties = { border: rule, padding: "4px 6px", fontSize: "9px", fontWeight: 700, background: "#f1f5f9", textAlign: "left" };
const td: React.CSSProperties = { border: rule, padding: "5px 6px", fontSize: "9.5px", verticalAlign: "top" };

function stateOf(gstin: string): string {
  return GSTIN_STATE_NAMES[String(gstin ?? "").slice(0, 2)] ?? "";
}

/** "Bhiwandi, Maharashtra - 421302" from the address and the GSTIN's state. */
function placeLine(p: EwbPrintParty): string {
  const { place, pin } = ewbPlaceOf(p.address);
  const state = stateOf(p.gstin);
  return [place, state].filter(Boolean).join(", ") + (pin ? ` - ${pin}` : "");
}

function Section({ title }: { title: string }) {
  return (
    <div
      style={{
        marginTop: "8px",
        padding: "3px 8px",
        background: ink,
        color: "#fff",
        fontSize: "9.5px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {title}
    </div>
  );
}

/**
 * Printable e-way bill (Industrial mode, Phase 2 step 5a): EWB number as a barcode,
 * Part A (supplier, recipient, document, value, HSN) and Part B (vehicle or LR).
 * The driver can carry it; the portal's own copy is at ewaybillgst.gov.in.
 */
export const EwayBillPrint = React.forwardRef<HTMLDivElement, { data: EwbPrintData }>(({ data }, ref) => {
  const barRef = useRef<SVGSVGElement>(null);
  const { ewb, doc, seller, buyer } = data;

  useLayoutEffect(() => {
    if (!barRef.current || !/^\d{12}$/.test(ewb.ewb_no)) return;
    try {
      JsBarcode(barRef.current, ewb.ewb_no, {
        format: "CODE128",
        height: 46,
        width: 1.6,
        displayValue: false,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // A bad number just prints without the barcode.
    }
  }, [ewb.ewb_no]);

  const partB = !!ewb.valid_till && (!!ewb.vehicle_no || !!ewb.trans_doc_no);
  const vehicleOrDoc = ewb.vehicle_no
    ? `${ewb.vehicle_no}${ewb.vehicle_type === "O" ? " (ODC)" : ""}`
    : ewb.trans_doc_no
      ? `${ewb.trans_doc_no}${ewb.trans_doc_date ? ` dt. ${ewbDdMmYyyy(ewb.trans_doc_date)}` : ""}`
      : "";
  const transporter = [ewb.transporter_id, ewb.transporter_name].filter(Boolean).join(" · ");
  const fromPlace = ewbPlaceOf(seller.address).place || stateOf(seller.gstin);

  const rows: Array<[string, React.ReactNode]> = [
    ["GSTIN of Supplier", <>{seller.gstin || "—"} <span style={{ fontWeight: 400, color: muted }}>{seller.name}</span></>],
    ["Place of Dispatch", placeLine(seller) || "—"],
    ["GSTIN of Recipient", <>{buyer.gstin || "URP"} <span style={{ fontWeight: 400, color: muted }}>{buyer.name}</span></>],
    ["Place of Delivery", placeLine(buyer) || buyer.address || "—"],
    ["Document No.", doc.number],
    ["Document Date", ewbDdMmYyyy(doc.date)],
    ["Transaction Type", doc.supplyLabel || "Regular"],
    ["Value of Goods", `₹${Math.round(doc.value).toLocaleString("en-IN")}`],
    ["HSN Code", data.hsn.length ? data.hsn.join(", ") : "—"],
    ["Reason for Transportation", "Outward - Supply"],
    ["Transporter", transporter || "—"],
  ];

  return (
    <div
      ref={ref}
      className="invoice-print-root"
      style={{
        width: "190mm",
        margin: "0 auto",
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        color: ink,
        background: "#fff",
        fontSize: "10px",
        lineHeight: 1.35,
      }}
    >
      <div style={{ border: "1.5px solid #0f172a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 12px", borderBottom: rule }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "0.04em" }}>e-Way Bill</span>
              {ewb.test_mode ? (
                <span style={{ fontSize: "8.5px", fontWeight: 700, color: "#b45309", border: "1px solid #f59e0b", padding: "0 4px", borderRadius: 3 }}>
                  SANDBOX · NOT VALID FOR MOVEMENT
                </span>
              ) : null}
              {ewb.status === "cancelled" ? (
                <span style={{ fontSize: "8.5px", fontWeight: 700, color: "#b91c1c", border: "1px solid #ef4444", padding: "0 4px", borderRadius: 3 }}>
                  CANCELLED
                </span>
              ) : null}
            </div>
            <div style={{ marginTop: "2px", fontSize: "9px", color: muted }}>Made from the e-invoice (IRN) of {doc.number}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <svg ref={barRef} style={{ display: "block", height: "46px", maxWidth: "70mm" }} />
            <div style={{ marginTop: "3px", fontFamily: "'Roboto Mono', 'Courier New', monospace", fontSize: "13px", fontWeight: 700, letterSpacing: "0.12em" }}>
              {formatEwbNo(ewb.ewb_no)}
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={cellLabel}>E-Way Bill No.</td>
              <td style={cellValue}>{formatEwbNo(ewb.ewb_no)}</td>
            </tr>
            <tr>
              <td style={cellLabel}>E-Way Bill Date</td>
              <td style={cellValue}>{formatIstDateTime(ewb.ewb_date) || "—"}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Generated By</td>
              <td style={cellValue}>
                {seller.gstin || "—"} <span style={{ fontWeight: 400, color: muted }}>{seller.name}</span>
              </td>
            </tr>
            <tr>
              <td style={cellLabel}>Valid From</td>
              <td style={cellValue}>{partB ? formatIstDateTime(ewb.ewb_date) : "—"}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Valid Until</td>
              <td style={cellValue}>
                {ewb.valid_till ? formatIstDateTime(ewb.valid_till) : "Starts when the vehicle (Part B) is added"}
                {ewb.distance_km ? <span style={{ fontWeight: 400, color: muted }}> · {ewb.distance_km} km</span> : null}
              </td>
            </tr>
            {doc.irn ? (
              <tr>
                <td style={cellLabel}>IRN</td>
                <td style={{ ...cellValue, fontFamily: "'Roboto Mono', 'Courier New', monospace", fontSize: "8.5px", fontWeight: 500, wordBreak: "break-all" }}>
                  {doc.irn}
                  {doc.ackNo ? <div style={{ fontFamily: "inherit", color: muted }}>Ack No. {doc.ackNo}</div> : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <Section title="Part - A" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={cellLabel}>{k}</td>
                <td style={cellValue}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Section title="Part - B" />
        <div style={{ padding: "6px 8px 8px" }}>
          {partB || vehicleOrDoc ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Mode</th>
                  <th style={th}>Vehicle / Trans Doc No &amp; Dt.</th>
                  <th style={th}>From</th>
                  <th style={th}>Entered Date</th>
                  <th style={th}>Entered By</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={td}>{ewbModeName(ewb.trans_mode) || "Road"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{vehicleOrDoc || "—"}</td>
                  <td style={td}>{fromPlace || "—"}</td>
                  <td style={td}>{formatIstDateTime(ewb.ewb_date)}</td>
                  <td style={td}>{seller.gstin || "—"}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: "9.5px", color: "#b45309", fontWeight: 600 }}>
              No vehicle yet. Add the vehicle number on the e-way bill portal before the goods move.
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "8.5px", color: muted }}>
        <span>Check this e-way bill at ewaybillgst.gov.in (Search &gt; EWB) with the number above.</span>
        <span style={{ whiteSpace: "nowrap" }}>Printed {data.printedAt}</span>
      </div>
    </div>
  );
});
EwayBillPrint.displayName = "EwayBillPrint";
