import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { numberToWords } from "@/lib/utils";
import { formatPlaceOfSupplyFromGstin } from "@/utils/gstRegisterUtils";

export type NoteEInvoicePrintLine = {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  taxable: number;
  gstPercent: number;
  gstAmount: number;
};

export type NoteEInvoicePrintProps = {
  /** "DEBIT NOTE" or "CREDIT NOTE". */
  title: string;
  number: string;
  date: string;
  seller: { name: string; address: string; gstin: string; phone?: string; email?: string };
  buyer: { name: string; address?: string | null; gstin: string; phone?: string | null };
  against?: { number: string; date: string | null } | null;
  reason?: string;
  notes?: string | null;
  interState: boolean;
  lines: NoteEInvoicePrintLine[];
  net: number;
  irn: string;
  ackNo?: string | null;
  ackDate?: string | null;
  qrText?: string | null;
  testMode?: boolean | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ddmmyyyy(iso: string | null | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

function ackStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const ink = "#0f172a";
const muted = "#475569";
const rule = "1px solid #cbd5e1";
const th: React.CSSProperties = {
  border: rule,
  padding: "5px 6px",
  fontSize: "9.5px",
  fontWeight: 700,
  background: "#f1f5f9",
  color: ink,
  textAlign: "left",
};
const td: React.CSSProperties = { border: rule, padding: "5px 6px", fontSize: "9.5px", color: ink, verticalAlign: "top" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

/**
 * A4 copy of a debit or credit note that has an IRN: IRN, acknowledgement and the
 * signed QR code on top, then the parties, lines and GST (tax exclusive).
 */
export const NoteEInvoicePrint = React.forwardRef<HTMLDivElement, NoteEInvoicePrintProps>((p, ref) => {
  const [qr, setQr] = useState("");
  const qrWanted = Boolean(p.qrText);

  useEffect(() => {
    let alive = true;
    setQr("");
    if (!p.qrText) return;
    void QRCode.toDataURL(p.qrText, { width: 150, margin: 1, errorCorrectionLevel: "L" })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setQr("error");
      });
    return () => {
      alive = false;
    };
  }, [p.qrText]);

  // Same split as the IRP payload (each line's GST halved), so the printed figures match the IRN.
  const taxable = r2(p.lines.reduce((s, l) => s + l.taxable, 0));
  const gst = r2(p.lines.reduce((s, l) => s + l.gstAmount, 0));
  const half = r2(p.lines.reduce((s, l) => s + r2(l.gstAmount / 2), 0));
  const cgst = p.interState ? 0 : half;
  const sgst = p.interState ? 0 : half;
  const igst = p.interState ? gst : 0;
  const roundOff = r2(p.net - (taxable + cgst + sgst + igst));
  const pos = formatPlaceOfSupplyFromGstin(p.buyer.gstin);
  const againstDate = ddmmyyyy(p.against?.date ?? null);

  return (
    <div
      ref={ref}
      className="invoice-print-root"
      data-qr-pending={qrWanted && !qr ? "true" : "false"}
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
      {/* Title + IRN band */}
      <div style={{ display: "flex", gap: "10px", alignItems: "stretch", border: "1.5px solid #0f172a", padding: "8px 10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "0.06em" }}>{p.title}</span>
            <span style={{ fontSize: "9px", fontWeight: 600, color: muted, letterSpacing: "0.08em" }}>E-INVOICE</span>
            {p.testMode ? (
              <span style={{ fontSize: "8.5px", fontWeight: 700, color: "#b45309", border: "1px solid #f59e0b", padding: "0 4px", borderRadius: 3 }}>
                SANDBOX - NOT VALID
              </span>
            ) : null}
          </div>
          <div style={{ marginTop: 6, fontSize: "9.5px" }}>
            <div>
              <strong>IRN:</strong>{" "}
              <span style={{ fontFamily: "'Consolas', 'Courier New', monospace", wordBreak: "break-all" }}>{p.irn}</span>
            </div>
            <div style={{ display: "flex", gap: "16px", marginTop: 2 }}>
              {p.ackNo ? (
                <span>
                  <strong>Ack No:</strong> {p.ackNo}
                </span>
              ) : null}
              {p.ackDate ? (
                <span>
                  <strong>Ack Date:</strong> {ackStamp(p.ackDate)}
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: 6, fontSize: "10.5px" }}>
            <span>
              <strong>No:</strong> {p.number}
            </span>
            <span>
              <strong>Date:</strong> {ddmmyyyy(p.date)}
            </span>
            {p.against?.number ? (
              <span>
                <strong>Against Invoice:</strong> {p.against.number}
                {againstDate ? ` dt. ${againstDate}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        {qrWanted ? (
          <div style={{ width: "34mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {qr && qr !== "error" ? (
              <img src={qr} alt="e-invoice QR" style={{ width: "32mm", height: "32mm" }} />
            ) : (
              <span style={{ fontSize: "8px", color: muted }}>QR code</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Parties */}
      <div style={{ display: "flex", borderLeft: rule, borderRight: rule, borderBottom: rule }}>
        <div style={{ flex: 1, padding: "7px 10px", borderRight: rule }}>
          <div style={{ fontSize: "8.5px", fontWeight: 700, color: muted, letterSpacing: "0.08em" }}>FROM</div>
          <div style={{ fontSize: "12px", fontWeight: 800, marginTop: 2 }}>{p.seller.name}</div>
          <div style={{ color: muted, whiteSpace: "pre-line" }}>{p.seller.address}</div>
          <div style={{ marginTop: 2 }}>
            <strong>GSTIN:</strong> {p.seller.gstin}
          </div>
          {p.seller.phone || p.seller.email ? (
            <div style={{ color: muted }}>{[p.seller.phone, p.seller.email].filter(Boolean).join("  ·  ")}</div>
          ) : null}
        </div>
        <div style={{ flex: 1, padding: "7px 10px" }}>
          <div style={{ fontSize: "8.5px", fontWeight: 700, color: muted, letterSpacing: "0.08em" }}>TO</div>
          <div style={{ fontSize: "12px", fontWeight: 800, marginTop: 2 }}>{p.buyer.name}</div>
          {p.buyer.address ? <div style={{ color: muted, whiteSpace: "pre-line" }}>{p.buyer.address}</div> : null}
          <div style={{ marginTop: 2 }}>
            <strong>GSTIN:</strong> {p.buyer.gstin}
          </div>
          {pos ? (
            <div>
              <strong>Place of supply:</strong> {pos}
            </div>
          ) : null}
          {p.buyer.phone ? <div style={{ color: muted }}>{p.buyer.phone}</div> : null}
        </div>
      </div>

      {/* Lines */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "5%" }}>#</th>
            <th style={th}>Description</th>
            <th style={{ ...th, width: "11%" }}>HSN / SAC</th>
            <th style={{ ...th, width: "7%", textAlign: "right" }}>Qty</th>
            <th style={{ ...th, width: "11%", textAlign: "right" }}>Rate</th>
            <th style={{ ...th, width: "12%", textAlign: "right" }}>Taxable</th>
            <th style={{ ...th, width: "7%", textAlign: "right" }}>GST %</th>
            <th style={{ ...th, width: "11%", textAlign: "right" }}>GST</th>
            <th style={{ ...th, width: "12%", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{l.description}</td>
              <td style={td}>{l.hsn}</td>
              <td style={tdR}>{l.qty}</td>
              <td style={tdR}>{money(l.rate)}</td>
              <td style={tdR}>{money(l.taxable)}</td>
              <td style={tdR}>{l.gstPercent}</td>
              <td style={tdR}>{money(l.gstAmount)}</td>
              <td style={tdR}>{money(l.taxable + l.gstAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", gap: "10px", marginTop: 8 }}>
        <div style={{ flex: 1, fontSize: "9.5px" }}>
          {p.reason ? (
            <div>
              <strong>Reason:</strong> {p.reason}
            </div>
          ) : null}
          {p.notes ? (
            <div style={{ marginTop: 2 }}>
              <strong>Notes:</strong> {p.notes}
            </div>
          ) : null}
          <div style={{ marginTop: 6 }}>
            <strong>Amount in words:</strong> {numberToWords(Math.round(p.net))}
          </div>
        </div>
        <table style={{ width: "42%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={td}>Taxable value</td>
              <td style={tdR}>{money(taxable)}</td>
            </tr>
            {p.interState ? (
              <tr>
                <td style={td}>IGST</td>
                <td style={tdR}>{money(igst)}</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td style={td}>CGST</td>
                  <td style={tdR}>{money(cgst)}</td>
                </tr>
                <tr>
                  <td style={td}>SGST</td>
                  <td style={tdR}>{money(sgst)}</td>
                </tr>
              </>
            )}
            {Math.abs(roundOff) >= 0.005 ? (
              <tr>
                <td style={td}>Round off</td>
                <td style={tdR}>{money(roundOff)}</td>
              </tr>
            ) : null}
            <tr>
              <td style={{ ...td, fontWeight: 800, fontSize: "11px", background: "#f1f5f9" }}>Total</td>
              <td style={{ ...tdR, fontWeight: 800, fontSize: "11px", background: "#f1f5f9" }}>₹ {money(p.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28, fontSize: "9.5px" }}>
        <span style={{ color: muted }}>This document carries an IRN from the GST Invoice Registration Portal.</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>For {p.seller.name}</div>
          <div style={{ marginTop: 26, borderTop: rule, paddingTop: 2, color: muted }}>Authorised signatory</div>
        </div>
      </div>
    </div>
  );
});

NoteEInvoicePrint.displayName = "NoteEInvoicePrint";
