import React, { useLayoutEffect, useRef, useState } from "react";
import { normalizeGstTaxType, type GstTaxType } from "@/utils/gstRegisterUtils";
import { roundInvoiceMoney } from "@/utils/invoiceGstRateSlabs";
import {
  KRUNAL_A4_COPY_LABELS,
  computeKrunalLines,
  estimateKrunalRowMm,
  krunalAmountInWords,
  krunalStateLabel,
  type KrunalLine,
} from "@/utils/krunalA4Invoice";
import { planMotasPages } from "@/components/invoice-templates/MotasA4Template";

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  mrp?: number;
  total: number;
  color?: string;
  gstPercent?: number;
  discountPercent?: number;
  uom?: string;
}

export interface KrunalA4TemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | string;
  customerName: string;
  customerAddress?: string;
  /** Ship-to address picked on the Sale Bill; blank = same as Bill To. */
  shippingAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  customerTransportDetails?: string;
  salesman?: string;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  discount: number;
  saleReturnAdjust?: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  roundOff: number;
  grandTotal: number;
  otherCharges?: number;
  pointsRedemptionValue?: number;
  termsConditions?: string[];
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
    branch?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  qrCodeUrl?: string;
  upiId?: string;
  showBankDetails?: boolean;
  notes?: string;
  documentTitle?: string;
  customFooterText?: string;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  /** Copies printed one after another; the online invoice shows only the first. */
  copyLabels?: readonly string[];
  [key: string]: unknown;
}

const DEFAULT_TERMS = ["Goods once sold will not be taken back.", "Subject to local jurisdiction only."];

/** Inside the 6 mm page padding: 297 − 12. */
const KRUNAL_FRAME_MM = 285;

const INK = "#000";
const LINE = "1px solid #000";
const HAIR = "1px solid #9ca3af";

const fmt = (n: number) =>
  roundInvoiceMoney(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = (n: number) => roundInvoiceMoney(n).toFixed(2);
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));
const clean = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "");
const dmy = (d?: Date | string | null) => {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

/**
 * Krunal A4 — tax invoice in the KRUNAL ENTERPRISES bill-book layout. Explicit A4 sheets: the shop
 * header and Bill To / Ship To repeat on every page, items continue across pages, and the totals,
 * tax summary, bank, terms and signatures close the last page. The whole set prints twice:
 * ORIGINAL FOR RECIPIENT, then DUPLICATE FOR SUPPLIER (PDFs keep only the original).
 */
export const KrunalA4Template: React.FC<KrunalA4TemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  dueDate,
  customerName,
  customerAddress,
  shippingAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  salesman,
  taxType: taxTypeProp = "inclusive",
  items,
  discount = 0,
  saleReturnAdjust = 0,
  taxableAmount = 0,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  roundOff,
  grandTotal,
  otherCharges = 0,
  pointsRedemptionValue = 0,
  termsConditions,
  bankDetails,
  qrCodeUrl,
  upiId,
  showBankDetails = true,
  notes,
  documentTitle,
  customFooterText,
  stampImageBase64,
  stampSize = "medium",
  copyLabels = KRUNAL_A4_COPY_LABELS,
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const isNoGst = taxType === "no_gst";
  const { lines, slabs, isInterState: interByGstin, totals } = computeKrunalLines(items, {
    taxType: taxTypeProp,
    grandTotal,
    saleReturnAdjust,
    discount,
    sellerGstin: gstNumber,
    buyerGstin: customerGSTIN,
  });
  const billTaxes = (cgstAmount || 0) + (sgstAmount || 0) + (igstAmount || 0);
  const isInterState = billTaxes > 0.005 ? (igstAmount || 0) > 0.005 && (cgstAmount || 0) < 0.005 : interByGstin;

  // Bill totals come from the bill (they include a flat bill discount); line columns from the lines.
  const taxableShown = taxableAmount > 0.005 ? roundInvoiceMoney(taxableAmount) : totals.taxable;
  const discountShown = roundInvoiceMoney(Math.max(0, totals.gross - taxableShown));
  const taxShown = billTaxes > 0.005 ? roundInvoiceMoney(billTaxes) : totals.tax;
  const igstShown = isInterState ? (igstAmount > 0.005 ? igstAmount : taxShown) : 0;
  const cgstShown = isInterState ? 0 : cgstAmount > 0.005 ? cgstAmount : taxShown / 2;
  const sgstShown = isInterState ? 0 : sgstAmount > 0.005 ? sgstAmount : taxShown / 2;
  // Tax summary per rate, scaled to the bill when a flat bill discount lowered the taxable value.
  const scale = totals.taxable > 0.005 ? taxableShown / totals.taxable : 1;
  const taxRows = slabs.map((s) => ({
    rate: s.gstPercent,
    taxable: roundInvoiceMoney(s.taxable * scale),
    cgst: isInterState ? 0 : roundInvoiceMoney((s.gst * scale) / 2),
    sgst: isInterState ? 0 : roundInvoiceMoney((s.gst * scale) / 2),
    igst: isInterState ? roundInvoiceMoney(s.gst * scale) : 0,
  }));
  const singleRate = slabs.length === 1 ? slabs[0].gstPercent : null;

  const terms =
    termsConditions && termsConditions.filter((t) => t?.trim()).length > 0
      ? termsConditions.filter((t) => t?.trim())
      : DEFAULT_TERMS;
  const bankName = clean(bankDetails?.bankName || bankDetails?.bank_name);
  const bankAc = clean(bankDetails?.accountNumber || bankDetails?.account_number);
  const bankIfsc = clean(bankDetails?.ifscCode || bankDetails?.ifsc_code);
  const bankHolder = clean(bankDetails?.accountHolder || bankDetails?.account_holder);
  const bankBranch = clean(bankDetails?.branch);
  const hasBank = Boolean(showBankDetails && (bankName || bankAc || bankIfsc || bankHolder || bankBranch));
  const stampW = stampSize === "small" ? "70px" : stampSize === "large" ? "120px" : "95px";

  const titleText = grandTotal < 0 ? "CREDIT NOTE" : clean(documentTitle) || "TAX INVOICE";
  const shipTo = clean(shippingAddress) || clean(customerAddress);
  const buyerState = krunalStateLabel(customerGSTIN);
  const sellerState = krunalStateLabel(gstNumber);
  const pointsValue = Math.max(0, Number(pointsRedemptionValue) || 0);
  const taxHeading = isNoGst ? "GST" : isInterState ? "IGST" : "CGST + SGST";

  // ---- styles -------------------------------------------------------------------------------
  const gridTable: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
  const colWidths = ["4.2%", undefined, "7.6%", "4.6%", "4.6%", "7.4%", "8.4%", "5.4%", "7.6%", "5%", "7.4%", "9%"];
  const colGroup = (
    <colgroup>
      {colWidths.map((w, i) => (
        <col key={i} style={w ? { width: w } : undefined} />
      ))}
    </colgroup>
  );
  const edge = (i: number, n: number): React.CSSProperties =>
    i === 0 ? { borderLeft: "none" } : i === n - 1 ? { borderRight: "none" } : {};
  const th: React.CSSProperties = {
    borderLeft: LINE,
    borderRight: LINE,
    borderBottom: LINE,
    padding: "2px 2px",
    fontSize: "10px",
    fontWeight: 700,
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.15,
    color: INK,
  };
  const td: React.CSSProperties = {
    borderLeft: LINE,
    borderRight: LINE,
    padding: "2px 3px",
    fontSize: "10px",
    lineHeight: 1.25,
    verticalAlign: "top",
    color: INK,
  };
  const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const label: React.CSSProperties = { fontSize: "10.5px", fontWeight: 700, whiteSpace: "nowrap", paddingRight: "6px", verticalAlign: "top" };
  const value: React.CSSProperties = { fontSize: "10.5px", verticalAlign: "top" };

  // ---- header (repeats on every page) -------------------------------------------------------
  const partyRows = (rows: Array<[string, string]>) => (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <tbody>
        {rows
          .filter(([, v]) => clean(v))
          .map(([k, v]) => (
            <tr key={k}>
              <td style={{ ...label, width: "16mm", paddingTop: "1px", paddingBottom: "1px" }}>{k}</td>
              <td style={{ ...value, paddingTop: "1px", paddingBottom: "1px", whiteSpace: "pre-line" }}>
                <span style={{ fontWeight: 700 }}>: </span>
                {v}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  const header = (
    <div className="krunal-a4-header">
      {/* Shop | invoice no and date */}
      <div style={{ display: "flex", borderBottom: LINE }}>
        <div style={{ flex: 1, minWidth: 0, padding: "4px 8px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ width: "18mm", height: "18mm", objectFit: "contain" }} /> : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "21px", fontWeight: 800, lineHeight: 1.15, textTransform: "uppercase" }}>{businessName}</div>
            {clean(address) ? (
              <div style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1.3, whiteSpace: "pre-line", textTransform: "uppercase" }}>
                {address}
              </div>
            ) : null}
            <table style={{ borderCollapse: "collapse", marginTop: "2px", width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ ...label, width: "13mm" }}>GSTIN</td>
                  <td style={{ ...value, fontSize: "12px" }}>: {gstNumber || "—"}</td>
                  <td style={{ ...label, width: "15mm" }}>Email Id</td>
                  <td style={{ ...value }}>{email ? `: ${email}` : ""}</td>
                </tr>
                <tr>
                  <td style={label}>State</td>
                  <td style={{ ...value, fontSize: "12px" }}>{sellerState ? `: ${sellerState}` : ""}</td>
                  <td style={label}>Phone</td>
                  <td style={value}>{mobile ? `: ${mobile}` : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ width: "68mm", borderLeft: LINE, padding: "6px 8px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr>
                <td style={{ fontSize: "13px", fontWeight: 800, whiteSpace: "nowrap", paddingBottom: "6px" }}>Invoice No.</td>
                <td style={{ fontSize: "13px", fontWeight: 800, paddingBottom: "6px" }} data-testid="krunal-invoice-no">
                  : {invoiceNumber}
                </td>
              </tr>
              <tr>
                <td style={{ fontSize: "13px", fontWeight: 800 }}>Date</td>
                <td style={{ fontSize: "13px", fontWeight: 800 }}>: {dmy(invoiceDate)}</td>
              </tr>
              {dueDate && dmy(dueDate) !== dmy(invoiceDate) ? (
                <tr>
                  <td style={{ fontSize: "11px", fontWeight: 700, paddingTop: "3px" }}>Due Date</td>
                  <td style={{ fontSize: "11px", paddingTop: "3px" }}>: {dmy(dueDate)}</td>
                </tr>
              ) : null}
              {clean(salesman) ? (
                <tr>
                  <td style={{ fontSize: "11px", fontWeight: 700, paddingTop: "3px" }}>Salesman</td>
                  <td style={{ fontSize: "11px", paddingTop: "3px" }}>: {salesman}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {/* Bill To | Ship To */}
      <div style={{ display: "flex", borderBottom: LINE }}>
        <div style={{ flex: 1, minWidth: 0, padding: "3px 8px", borderRight: LINE }}>
          <div style={{ fontSize: "11px", fontWeight: 800, textDecoration: "underline", marginBottom: "1px" }}>Billing Details (Bill To)</div>
          {partyRows([
            ["Name", customerName || "Walk-in Customer"],
            ["Address", clean(customerAddress)],
            ["Mobile", clean(customerMobile)],
            ["GSTIN", clean(customerGSTIN)],
            ["State", buyerState],
          ])}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: "3px 8px" }} data-testid="krunal-ship-to">
          <div style={{ fontSize: "11px", fontWeight: 800, textDecoration: "underline", marginBottom: "1px" }}>Shipping Details (Ship To)</div>
          {partyRows([
            ["Name", customerName || "Walk-in Customer"],
            ["Address", shipTo],
            ["GSTIN", clean(customerGSTIN)],
            ["State", buyerState],
            ["Transport", clean(customerTransportDetails)],
          ])}
        </div>
      </div>
    </div>
  );

  const tableHead = (
    <thead>
      <tr>
        {[
          ["SlNo"],
          ["Item Description"],
          ["HSN/SAC"],
          ["Qty"],
          ["Unit"],
          ["Basic", "Rate"],
          ["Gross", "Amount"],
          ["Dis %"],
          ["Dis.", "Amount"],
        ].map((parts, i) => (
          <th key={i} rowSpan={2} style={{ ...th, ...edge(i, 12) }}>
            {parts.map((p, j) => (
              <div key={j}>{p}</div>
            ))}
          </th>
        ))}
        <th colSpan={2} style={{ ...th, borderBottom: HAIR }}>{taxHeading}</th>
        <th rowSpan={2} style={{ ...th, ...edge(11, 12) }}>Amount</th>
      </tr>
      <tr>
        <th style={{ ...th, fontSize: "9px" }}>Tax Per</th>
        <th style={{ ...th, fontSize: "9px" }}>Tax Amount</th>
      </tr>
    </thead>
  );

  const renderRow = (l: KrunalLine) => {
    const n = 12;
    return (
      <tr key={l.sr}>
        <td style={{ ...td, textAlign: "center", ...edge(0, n) }}>{l.sr}</td>
        <td style={{ ...td, wordBreak: "break-word" }}>{l.description}</td>
        <td style={td}>{l.hsn}</td>
        <td style={{ ...num, textAlign: "center" }}>{qtyText(l.qty)}</td>
        <td style={{ ...td, textAlign: "center" }}>{l.unit}</td>
        <td style={num}>{plain(l.basicRate)}</td>
        <td style={num}>{plain(l.gross)}</td>
        <td style={num}>{plain(l.discPct)}</td>
        <td style={num}>{plain(l.discAmt)}</td>
        <td style={num}>{plain(l.taxPct)}</td>
        <td style={num}>{plain(l.taxAmt)}</td>
        <td style={{ ...num, ...edge(n - 1, n) }}>{plain(l.amount)}</td>
      </tr>
    );
  };

  // ---- closing (last page) ------------------------------------------------------------------
  const sumRows: Array<[string, string, boolean?]> = [
    ["Total Amount", fmt(totals.gross)],
    ["Discount Amount", fmt(discountShown)],
    ["Pre Tax", fmt(0)],
    ["Taxable Amount", fmt(taxableShown)],
    ...(isInterState
      ? ([
          ["IGST Rate", singleRate != null ? `${plain(singleRate)}%` : "—"],
          ["IGST Amt", fmt(igstShown)],
        ] as Array<[string, string]>)
      : ([
          ["CGST Amt", fmt(cgstShown)],
          ["SGST Amt", fmt(sgstShown)],
        ] as Array<[string, string]>)),
    ["Cess Amount", fmt(0)],
    ["Post Tax", fmt(otherCharges || 0)],
    ["TCS", fmt(0)],
    ...(saleReturnAdjust > 0.005 ? ([["Less: Sale Return", `-${fmt(saleReturnAdjust)}`]] as Array<[string, string]>) : []),
    ...(pointsValue > 0.005 ? ([["Less: Points", `-${fmt(pointsValue)}`]] as Array<[string, string]>) : []),
    ["Round Off Amount", fmt(Number(roundOff) || 0)],
  ];

  const taxCell: React.CSSProperties = { border: LINE, padding: "1px 3px", fontSize: "9px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const taxHead: React.CSSProperties = { ...taxCell, textAlign: "center", fontWeight: 700, fontSize: "8.5px" };
  const taxTotal = taxRows.reduce(
    (s, r) => ({ taxable: s.taxable + r.taxable, cgst: s.cgst + r.cgst, sgst: s.sgst + r.sgst, igst: s.igst + r.igst }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  );

  const closing = (
    <div className="krunal-a4-closing">
      {/* Item totals, aligned with the item columns */}
      <table style={gridTable}>
        {colGroup}
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...td, borderTop: LINE, borderBottom: LINE, borderLeft: "none", fontWeight: 700, textAlign: "center", paddingTop: "3px", paddingBottom: "3px" }}>
              No of Items : {lines.length}
            </td>
            <td style={{ ...td, borderTop: LINE, borderBottom: LINE, fontWeight: 700, textAlign: "center" }}>Total</td>
            <td style={{ ...num, borderTop: LINE, borderBottom: LINE, fontWeight: 700, textAlign: "center" }} data-testid="krunal-total-qty">
              {qtyText(totals.qty)}
            </td>
            <td style={{ ...td, borderTop: LINE, borderBottom: LINE }} />
            <td style={{ ...td, borderTop: LINE, borderBottom: LINE }} />
            <td style={{ ...num, borderTop: LINE, borderBottom: LINE, fontWeight: 700 }}>{plain(totals.gross)}</td>
            <td style={{ ...td, borderTop: LINE, borderBottom: LINE }} />
            <td style={{ ...num, borderTop: LINE, borderBottom: LINE, fontWeight: 700 }}>{plain(totals.lineDiscount)}</td>
            <td style={{ ...td, borderTop: LINE, borderBottom: LINE }} />
            <td style={{ ...num, borderTop: LINE, borderBottom: LINE, fontWeight: 700 }}>{plain(totals.tax)}</td>
            <td style={{ ...num, borderTop: LINE, borderBottom: LINE, borderRight: "none", fontWeight: 700 }}>{plain(totals.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", borderBottom: LINE }}>
        {/* Bank and terms */}
        <div style={{ width: "40%", flexShrink: 0, borderRight: LINE, display: "flex", flexDirection: "column" }}>
          {hasBank ? (
            <div style={{ padding: "3px 6px", borderBottom: LINE }}>
              <div style={{ fontSize: "10.5px", fontWeight: 800, marginBottom: "2px" }}>Bank Details:</div>
              <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                  {(
                    [
                      ["Bank Name", bankName],
                      ["A/c Name", bankHolder],
                      ["A/c No", bankAc],
                      ["IFSC Code", bankIfsc],
                      ["Branch Name", bankBranch],
                    ] as Array<[string, string]>
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ ...label, fontSize: "10px" }}>{k}</td>
                        <td style={{ fontSize: "10px" }}>: {v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ padding: "3px 6px", flex: 1 }}>
            <div style={{ fontSize: "10.5px", fontWeight: 800, marginBottom: "2px" }}>Terms &amp; condition :</div>
            <ol style={{ margin: 0, paddingLeft: "14px", fontSize: "10px", lineHeight: 1.3 }}>
              {terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
            {clean(notes) ? (
              <div style={{ marginTop: "3px", fontSize: "10px", whiteSpace: "pre-line" }}>
                <strong>Note: </strong>
                {notes}
              </div>
            ) : null}
          </div>
        </div>

        {/* QR | totals; amount in words and tax summary below */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderBottom: LINE }}>
            <div style={{ width: "30mm", padding: "3px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: LINE }}>
              {qrCodeUrl ? <img src={qrCodeUrl} alt="UPI QR" style={{ width: "27mm", height: "27mm" }} /> : null}
              {upiId ? <div style={{ fontSize: "8px", marginTop: "1px", wordBreak: "break-all", textAlign: "center" }}>{upiId}</div> : null}
            </div>
            <table style={{ flex: 1, borderCollapse: "collapse" }} data-testid="krunal-totals">
              <tbody>
                {sumRows.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ fontSize: "10px", padding: "0.5px 5px" }}>{k}</td>
                    <td style={{ fontSize: "10px", padding: "0.5px 2px", width: "3mm", textAlign: "center" }}>:</td>
                    <td style={{ fontSize: "10px", padding: "0.5px 5px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontSize: "12px", fontWeight: 800, padding: "2px 5px", borderTop: LINE }}>Grand Total ₹</td>
                  <td style={{ fontSize: "12px", fontWeight: 800, borderTop: LINE, textAlign: "center" }}>:</td>
                  <td style={{ fontSize: "12px", fontWeight: 800, padding: "2px 5px", textAlign: "right", borderTop: LINE }} data-testid="krunal-grand-total">
                    {fmt(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: "2px 5px", fontSize: "10px", borderBottom: LINE }}>
            <strong>Amount In Words : </strong>
            {krunalAmountInWords(grandTotal)}
          </div>
          {!isNoGst ? (
            <div style={{ padding: "3px 5px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["TAXABLE AMT", "CGST %", "CGST AMT", "SGST %", "SGST AMT", "IGST %", "IGST AMT"].map((h) => (
                      <th key={h} style={taxHead}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {taxRows.map((r) => (
                    <tr key={r.rate}>
                      <td style={taxCell}>{fmt(r.taxable)}</td>
                      <td style={taxCell}>{plain(isInterState ? 0 : r.rate / 2)}</td>
                      <td style={taxCell}>{fmt(r.cgst)}</td>
                      <td style={taxCell}>{plain(isInterState ? 0 : r.rate / 2)}</td>
                      <td style={taxCell}>{fmt(r.sgst)}</td>
                      <td style={taxCell}>{plain(isInterState ? r.rate : 0)}</td>
                      <td style={taxCell}>{fmt(r.igst)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...taxCell, fontWeight: 700, textAlign: "center" }}>Total</td>
                    <td style={{ ...taxCell, fontWeight: 700, textAlign: "center" }}>CGST</td>
                    <td style={{ ...taxCell, fontWeight: 700 }}>{fmt(taxTotal.cgst)}</td>
                    <td style={{ ...taxCell, fontWeight: 700, textAlign: "center" }}>SGST</td>
                    <td style={{ ...taxCell, fontWeight: 700 }}>{fmt(taxTotal.sgst)}</td>
                    <td style={{ ...taxCell, fontWeight: 700, textAlign: "center" }}>IGST</td>
                    <td style={{ ...taxCell, fontWeight: 700 }}>{fmt(taxTotal.igst)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {/* Signatures */}
      <div style={{ display: "flex", minHeight: "21mm" }}>
        <div style={{ width: "40%", flexShrink: 0, boxSizing: "border-box", borderRight: LINE, padding: "4px 6px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontSize: "10px" }}>RECEIVED THE MATERIAL IN GOOD CONDITION</div>
          <div style={{ fontSize: "10px" }}>RECEIVER'S SIGNATURE AND SEAL</div>
        </div>
        <div style={{ flex: 1, padding: "4px 6px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 800 }}>For {businessName}</div>
          {stampImageBase64 ? <img src={stampImageBase64} alt="" style={{ width: stampW, maxHeight: "16mm", objectFit: "contain" }} /> : null}
          <div style={{ fontSize: "10.5px", fontWeight: 700 }}>Authorised Signatory</div>
        </div>
      </div>
    </div>
  );

  // ---- pages: measure once per content change, then fill each sheet ---------------------------
  const layoutKey = JSON.stringify([
    lines.map((l) => [l.description, l.hsn]),
    businessName,
    address,
    email,
    mobile,
    gstNumber,
    logoUrl,
    customerName,
    customerAddress,
    shipTo,
    customerMobile,
    customerGSTIN,
    customerTransportDetails,
    salesman,
    terms,
    notes,
    hasBank,
    bankName,
    bankAc,
    bankBranch,
    taxRows.length,
    sumRows.length,
    qrCodeUrl,
    upiId,
    stampImageBase64,
  ]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    key: string;
    sizes: { headerMm: number; theadMm: number; closingMm: number; rowsMm: number[] } | null;
  } | null>(null);
  const needsMeasure = measured?.key !== layoutKey;

  useLayoutEffect(() => {
    if (!needsMeasure) return;
    const box = measureRef.current;
    const px = (el: Element | null | undefined) => ((el as HTMLElement | null)?.offsetHeight || 0) * (25.4 / 96);
    const headerMm = px(box?.querySelector(".krunal-a4-titlebar")) + px(box?.querySelector(".krunal-a4-header"));
    const theadMm = px(box?.querySelector("thead"));
    const closingMm = px(box?.querySelector(".krunal-a4-closing"));
    const rowsMm = Array.from(box?.querySelectorAll("tbody.krunal-a4-measure-rows > tr") || []).map((tr) => px(tr));
    const ok = headerMm > 0 && theadMm > 0 && closingMm > 0 && rowsMm.length === lines.length && rowsMm.every((h) => h > 0);
    setMeasured({ key: layoutKey, sizes: ok ? { headerMm, theadMm, closingMm, rowsMm } : null });
  }, [needsMeasure, layoutKey, lines.length]);

  const sizes = measured?.key === layoutKey ? measured.sizes : null;
  const pages = sizes
    ? planMotasPages(sizes.rowsMm, {
        headerMm: sizes.headerMm,
        theadMm: sizes.theadMm,
        closingMm: sizes.closingMm,
        frameMm: KRUNAL_FRAME_MM,
        slackMm: 3,
      })
    : planMotasPages(
        lines.map((l) => estimateKrunalRowMm(l.description)),
        { headerMm: 62, theadMm: 9, closingMm: 95, frameMm: KRUNAL_FRAME_MM, slackMm: 6 },
      );
  const pageCount = pages.length;

  const titleBar = (copyLabel: string) => (
    <div className="krunal-a4-titlebar" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", padding: "0 2px 2px" }}>
      <span />
      <span style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "0.5px" }}>{titleText}</span>
      <span style={{ fontSize: "9.5px", fontWeight: 600, textAlign: "right" }} data-testid="krunal-copy-label">
        {copyLabel}
      </span>
    </div>
  );

  const copies = copyLabels.length > 0 ? copyLabels : KRUNAL_A4_COPY_LABELS;

  return (
    <div className="krunal-a4-invoice-root" style={{ position: "relative", width: "210mm", background: "#fff", color: INK }}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .krunal-a4-invoice-root { width: 210mm !important; margin: 0 !important; padding: 0 !important; }
          .krunal-a4-page { margin: 0 !important; box-shadow: none !important; }
          .krunal-a4-page:not(:last-child) { page-break-after: always; break-after: page; }
          .krunal-a4-measure { display: none !important; }
          .krunal-a4-invoice-root,
          .krunal-a4-invoice-root * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      {needsMeasure ? (
        <div
          ref={measureRef}
          className="krunal-a4-measure"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            top: 0,
            width: "198mm",
            visibility: "hidden",
            pointerEvents: "none",
            fontFamily: "Arial, Helvetica, sans-serif",
            color: INK,
          }}
        >
          {titleBar(copies[0])}
          <div style={{ border: LINE }}>
            {header}
            <table style={gridTable}>
              {colGroup}
              {tableHead}
              <tbody className="krunal-a4-measure-rows">{lines.map(renderRow)}</tbody>
            </table>
            {closing}
          </div>
        </div>
      ) : null}
      {copies.map((copyLabel, c) =>
        pages.map((pageIdx, p) => {
          const isLast = p === pageCount - 1;
          return (
            <div
              key={`${c}-${p}`}
              className="krunal-a4-page"
              data-copy={c === 0 ? "original" : "duplicate"}
              // PDF (WhatsApp / download) carries the original only; print gives every copy.
              data-pdf-skip={c > 0 ? "true" : undefined}
              style={{
                width: "210mm",
                height: "297mm",
                padding: "6mm",
                boxSizing: "border-box",
                overflow: "hidden",
                background: "#fff",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: INK,
              }}
            >
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                {titleBar(copyLabel)}
                <div style={{ flex: 1, minHeight: 0, border: LINE, display: "flex", flexDirection: "column" }}>
                  {header}
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <table style={gridTable}>
                      {colGroup}
                      {tableHead}
                      <tbody>{pageIdx.map((i) => renderRow(lines[i]))}</tbody>
                    </table>
                    {/* Column lines run down to the totals (last page) or the page foot. */}
                    <div aria-hidden="true" style={{ flex: 1, position: "relative", minHeight: "1mm" }}>
                      <table style={{ ...gridTable, position: "absolute", top: 0, left: 0, height: "100%" }}>
                        {colGroup}
                        <tbody>
                          <tr>
                            {colWidths.map((_, i) => (
                              <td key={i} style={{ borderLeft: LINE, borderRight: LINE, padding: 0, ...edge(i, colWidths.length) }} />
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {isLast ? closing : null}
                  </div>
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: "5mm", fontSize: "9px", padding: "0 2px" }}
                >
                  <span />
                  <span style={{ fontWeight: 600 }}>{clean(customFooterText) || "THIS IS A COMPUTER GENERATED INVOICE"}</span>
                  <span style={{ textAlign: "right" }} data-testid="krunal-page-no">
                    {isLast ? "" : "Continued..  "}
                    {`Page ${p + 1} Of ${pageCount}`}
                  </span>
                </div>
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
};

export default KrunalA4Template;
