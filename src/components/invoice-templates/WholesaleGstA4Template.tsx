import React from "react";
import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";
import {
  formatPlaceOfSupplyFromGstin,
  normalizeGstTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import {
  buildInvoiceGstBreakdown,
  formatGstHalfRateLabel,
  roundInvoiceMoney,
} from "@/utils/invoiceGstRateSlabs";

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
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  gstPercent?: number;
  discountPercent?: number;
  itemNotes?: string;
  uom?: string;
}

export interface WholesaleGstA4TemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | string | null;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  discount: number;
  saleReturnAdjust?: number;
  roundOff: number;
  grandTotal: number;
  termsConditions?: string[];
  customFooterText?: string;
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
  showHSN?: boolean;
  showBankDetails?: boolean;
  notes?: string;
  documentTitle?: string;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const DEFAULT_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "Seller is not responsible for any loss or damage of goods in transit.",
  "Disputes, if any, are subject to the seller's local court jurisdiction.",
  "Payment delay will be charged interest at 24% per annum.",
  "Warranty is as per company policy only.",
  "Goods lost in transit are the sole responsibility of the buyer.",
];

const fmt = (n: number) =>
  roundInvoiceMoney(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dash = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "");

const formatInvoiceDate = (date?: Date | string | null): string => {
  if (!date) return "â€”";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "â€”";
  return format(d, "dd MMM yyyy");
};

/** Brand palette â€” deep navy prints as a clean dark grey on B/W lasers. */
const INK = "#111827";
const MUTED = "#4b5563";
const ACCENT = "#1e3a5f";
const SOFT = "#eef2f7";
const GRID = "#6b7280";
const HAIR = "#d1d5db";

/**
 * Up to this many item rows the bill fits one sheet, so the item grid is
 * stretched down to the totals band. Longer bills print as plain flowing
 * blocks: Chrome mis-positions flex content that breaks across printed pages.
 */
/** Printable height inside the frame: 297mm âˆ’ 2Ã—6mm page margin âˆ’ frame lines. */
const PAGE_CONTENT_MM = 281;

const wrappedLines = (text: string | undefined, charsPerLine: number) =>
  String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / charsPerLine)), 0);

/** Printed height (mm) of one item row: wrapped name + colour/size line, or the GST % line. */
const estimateRowMm = (item: InvoiceItem) => {
  const nameLines = Math.max(1, Math.ceil(String(item.particulars || "").trim().length / 29));
  const hasVariant = Boolean(dash(item.color) || dash(item.size));
  return 2.3 + Math.max(nameLines * 4 + (hasVariant ? 3.4 : 0), 7.4);
};

/**
 * True when the whole bill (header, items, bank/tax band, terms) fits one A4
 * sheet â€” then the item grid is stretched down to the totals band. Deliberately
 * errs towards "does not fit": longer bills print as plain flowing blocks,
 * because Chrome mis-positions flex content that breaks across printed pages.
 * Heights are measured from Chrome print output of this layout.
 */
const fitsOnePage = (opts: {
  items: InvoiceItem[];
  slabCount: number;
  hasRoundOff: boolean;
  terms: string[];
  businessName: string;
  address?: string;
  customerAddress?: string;
  hasWordsOverflow: boolean;
}) => {
  const title = 9;
  const seller = Math.max(32, 24 + wrappedLines(opts.address, 60) * 4.5) + (opts.businessName.length > 28 ? 8 : 0);
  const billTo = Math.max(21.5, 16 + wrappedLines(opts.customerAddress, 70) * 3.9);
  const tableChrome = 23.5;
  const rows = opts.items.reduce((n, item) => n + estimateRowMm(item), 0);
  const taxSummary =
    6 + (opts.slabCount > 0 ? 4 + opts.slabCount * 4.7 : 6) + (opts.hasRoundOff ? 6 : 0) + 9.8;
  const bankBand = Math.max(36, taxSummary);
  const words = opts.hasWordsOverflow ? 12.5 : 8;
  const termsBand = Math.max(28, 9 + opts.terms.reduce((n, t) => n + wrappedLines(t, 70), 0) * 3.6);
  const footNote = 5;
  return (
    title + seller + billTo + tableChrome + rows + bankBand + words + termsBand + footNote <= PAGE_CONTENT_MM
  );
};

const printExact: React.CSSProperties = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

/**
 * Wholesale GST A4 â€” B2B tax invoice with per-rate CGST/SGST rows.
 * Full A4 portrait sheet inside one bordered frame; the item grid stretches so
 * its column lines run down to the totals band. Settings-driven logo / bank /
 * UPI / terms. No third-party watermark.
 */
export const WholesaleGstA4Template: React.FC<WholesaleGstA4TemplateProps> = ({
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
  customerMobile,
  customerGSTIN,
  taxType: taxTypeProp = "inclusive",
  items,
  saleReturnAdjust = 0,
  roundOff,
  grandTotal,
  termsConditions,
  customFooterText,
  bankDetails,
  qrCodeUrl,
  upiId,
  showHSN = true,
  showBankDetails = true,
  documentTitle,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const breakdown = buildInvoiceGstBreakdown({
    items,
    taxType,
    grandTotal,
    saleReturnAdjust,
    sellerGstin: gstNumber,
    buyerGstin: customerGSTIN,
  });
  const { slabs, isInterState, taxableTotal, lines } = breakdown;

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalTax = lines.reduce((s: number, l: { gst?: number }) => s + (Number(l.gst) || 0), 0);
  const totalAmount = lines.reduce((s: number, l: { amount?: number }) => s + (Number(l.amount) || 0), 0);
  const placeOfSupply =
    formatPlaceOfSupplyFromGstin(customerGSTIN) ||
    formatPlaceOfSupplyFromGstin(gstNumber) ||
    "â€”";

  const terms =
    termsConditions && termsConditions.filter((t) => t?.trim()).length > 0
      ? termsConditions.filter((t) => t?.trim())
      : DEFAULT_TERMS;

  const bankName = bankDetails?.bankName || bankDetails?.bank_name || "";
  const bankAc = bankDetails?.accountNumber || bankDetails?.account_number || "";
  const bankIfsc = bankDetails?.ifscCode || bankDetails?.ifsc_code || "";
  const bankHolder = bankDetails?.accountHolder || bankDetails?.account_holder || "";
  const bankBranch = bankDetails?.branch || "";
  const hasBank = Boolean(showBankDetails && (bankName || bankAc || bankIfsc || bankHolder || bankBranch));

  const titleText =
    grandTotal < 0 ? "CREDIT NOTE" : documentTitle?.trim() || "TAX INVOICE";

  const stampW = stampSize === "small" ? "72px" : stampSize === "large" ? "120px" : "96px";

  const hasRoundOff = Math.abs(Number(roundOff) || 0) >= 0.005;
  const fillPage = fitsOnePage({
    items,
    slabCount: slabs.length,
    hasRoundOff,
    terms,
    businessName: businessName || "",
    address,
    customerAddress,
    hasWordsOverflow: numberToWords(grandTotal).length > 95,
  });

  const frameLine = `1.5px solid ${ACCENT}`;
  const b = `1px solid ${GRID}`;

  // Item grid: column lines only, hairline between rows.
  const cell: React.CSSProperties = {
    borderLeft: b,
    borderRight: b,
    borderBottom: `1px solid ${HAIR}`,
    padding: "4px 5px",
    fontSize: "12px",
    verticalAlign: "top",
    lineHeight: 1.22,
    color: INK,
  };
  const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
  const hCell: React.CSSProperties = {
    borderLeft: "1px solid #3d5a80",
    borderRight: "1px solid #3d5a80",
    padding: "7px 5px",
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.3px",
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.2,
    color: "#fff",
    background: ACCENT,
    ...printExact,
  };
  const totalCell: React.CSSProperties = {
    ...cell,
    borderTop: `1.5px solid ${ACCENT}`,
    borderBottom: `1.5px solid ${ACCENT}`,
    padding: "6px",
    fontWeight: 800,
    fontSize: "12.5px",
    verticalAlign: "middle",
    background: SOFT,
    ...printExact,
  };
  const fillerCell: React.CSSProperties = {
    borderLeft: b,
    borderRight: b,
    padding: 0,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "10.5px",
    fontWeight: 800,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: ACCENT,
  };
  const metaBox: React.CSSProperties = {
    padding: "4px 10px",
    borderBottom: `1px solid ${HAIR}`,
    minWidth: 0,
  };
  const metaLabel: React.CSSProperties = {
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: MUTED,
  };
  const metaValue: React.CSSProperties = {
    marginTop: "0px",
    fontSize: "13.5px",
    fontWeight: 700,
    color: INK,
  };
  const sumLabel: React.CSSProperties = {
    padding: "3px 12px",
    fontSize: "12.5px",
    fontWeight: 500,
    color: "#374151",
    borderBottom: `1px solid ${HAIR}`,
  };
  const sumValue: React.CSSProperties = {
    ...sumLabel,
    textAlign: "right",
    fontWeight: 700,
    color: INK,
    whiteSpace: "nowrap",
  };
  const gstHead: React.CSSProperties = {
    padding: "1px 0",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    color: MUTED,
    textAlign: "left",
    borderBottom: `1px dotted ${HAIR}`,
  };
  const gstCell: React.CSSProperties = {
    padding: "1px 0",
    color: INK,
    whiteSpace: "nowrap",
  };
  const partyLabel: React.CSSProperties = {
    fontWeight: 500,
    color: MUTED,
    paddingRight: "10px",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  };

  const colWidths = showHSN
    ? ["4.5%", undefined, "8.5%", "10.5%", "8%", "12%", "11%", "12.5%"]
    : ["4.5%", undefined, "11%", "9%", "13%", "12%", "13.5%"];
  const colGroup = (
    <colgroup>
      {colWidths.map((w, i) => (
        <col key={i} style={w ? { width: w } : undefined} />
      ))}
    </colgroup>
  );
  const gridTable: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  };
  const edge = (i: number, n: number): React.CSSProperties =>
    i === 0 ? { borderLeft: "none" } : i === n - 1 ? { borderRight: "none" } : {};

  return (
    <div
      className={
        fillPage ? "wholesale-gst-a4-invoice-root" : "wholesale-gst-a4-invoice-root wholesale-gst-a4-flow"
      }
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "6mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
        color: INK,
        background: "#fff",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @page { size: A4 portrait; margin: 6mm; }
        @media print {
          .wholesale-gst-a4-invoice-root {
            width: 198mm !important;
            min-height: 283mm !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .wholesale-gst-a4-page-frame {
            min-height: 283mm !important;
            -webkit-box-decoration-break: clone;
            box-decoration-break: clone;
          }
          .wholesale-gst-a4-items thead {
            display: table-header-group;
          }
          .wholesale-gst-a4-items tr.wholesale-gst-a4-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .wholesale-gst-a4-flow,
          .wholesale-gst-a4-flow .wholesale-gst-a4-page-frame,
          .wholesale-gst-a4-flow .wholesale-gst-a4-grid {
            display: block !important;
          }
          .wholesale-gst-a4-flow .wholesale-gst-a4-filler {
            display: none !important;
          }
          .wholesale-gst-a4-footer {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .wholesale-gst-a4-invoice-root,
          .wholesale-gst-a4-invoice-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div
        className="wholesale-gst-a4-page-frame"
        style={{
          border: frameLine,
          outline: `0.5px solid ${ACCENT}`,
          outlineOffset: "1.5px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          minHeight: 0,
        }}
      >
        {/* Title strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            padding: "7px 14px",
            background: ACCENT,
            color: "#fff",
            ...printExact,
          }}
        >
          <div />
          <div
            style={{
              fontSize: "17px",
              fontWeight: 800,
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: "#fff",
            }}
          >
            {titleText}
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                border: "1px solid rgba(255,255,255,0.75)",
                borderRadius: "3px",
                padding: "2px 8px",
                color: "#fff",
              }}
            >
              Original for Recipient
            </span>
          </div>
        </div>

        {/* Seller + invoice details */}
        <div style={{ display: "flex", borderBottom: frameLine }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "8px 16px",
              borderRight: b,
              minWidth: 0,
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                style={{ width: "23mm", height: "23mm", objectFit: "contain", flexShrink: 0 }}
              />
            ) : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "24px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  lineHeight: 1.12,
                  color: ACCENT,
                }}
              >
                {businessName}
              </div>
              {gstNumber ? (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: "4px",
                    padding: "1px 10px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.6px",
                    color: ACCENT,
                    background: SOFT,
                    border: `1px solid ${ACCENT}`,
                    borderRadius: "3px",
                    ...printExact,
                  }}
                >
                  GSTIN : {gstNumber}
                </div>
              ) : null}
              {address ? (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "12.5px",
                    fontWeight: 400,
                    whiteSpace: "pre-line",
                    lineHeight: 1.35,
                    color: "#1f2937",
                  }}
                >
                  {address}
                </div>
              ) : null}
              {mobile || email ? (
                <div style={{ marginTop: "2px", fontSize: "12.5px", lineHeight: 1.35, color: "#1f2937" }}>
                  {mobile ? (
                    <span>
                      <span style={{ color: MUTED }}>Mobile: </span>
                      <strong>{mobile}</strong>
                    </span>
                  ) : null}
                  {mobile && email ? <span style={{ color: HAIR }}>{"   |   "}</span> : null}
                  {email ? (
                    <span>
                      <span style={{ color: MUTED }}>Email: </span>
                      {email}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ width: "74mm", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                padding: "6px 12px",
                background: SOFT,
                borderBottom: `1px solid ${HAIR}`,
                ...printExact,
              }}
            >
              <div style={metaLabel}>Invoice No.</div>
              <div style={{ marginTop: "1px", fontSize: "17px", fontWeight: 800, color: ACCENT, letterSpacing: "0.3px" }}>
                {invoiceNumber || "â€”"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1 }}>
              <div style={{ ...metaBox, borderRight: `1px solid ${HAIR}` }}>
                <div style={metaLabel}>Invoice Date</div>
                <div style={metaValue}>{formatInvoiceDate(invoiceDate)}</div>
              </div>
              <div style={metaBox}>
                <div style={metaLabel}>Due Date</div>
                <div style={metaValue}>{formatInvoiceDate(dueDate)}</div>
              </div>
              <div style={{ ...metaBox, gridColumn: "1 / span 2", borderBottom: "none" }}>
                <div style={metaLabel}>Place of Supply</div>
                <div style={metaValue}>{placeOfSupply}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div style={{ display: "flex", borderBottom: frameLine }}>
          <div style={{ flex: 1, padding: "7px 16px 8px", minWidth: 0 }}>
            <div style={sectionLabel}>Bill To</div>
            <div
              style={{
                marginTop: "2px",
                fontSize: "17px",
                fontWeight: 800,
                lineHeight: 1.25,
                textTransform: "uppercase",
                color: INK,
              }}
            >
              {customerName || "Walk-in Customer"}
            </div>
            {customerAddress ? (
              <div
                style={{
                  marginTop: "2px",
                  fontSize: "12.5px",
                  lineHeight: 1.35,
                  whiteSpace: "pre-line",
                  color: "#1f2937",
                }}
              >
                {customerAddress}
              </div>
            ) : null}
          </div>
          <div style={{ width: "74mm", flexShrink: 0, padding: "7px 12px 8px", borderLeft: b, display: "flex", alignItems: "center" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "12.5px", lineHeight: 1.55 }}>
              <tbody>
                {customerGSTIN ? (
                  <tr>
                    <td style={partyLabel}>GSTIN</td>
                    <td style={{ fontWeight: 800, letterSpacing: "0.4px" }}>{customerGSTIN}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={partyLabel}>State</td>
                  <td style={{ fontWeight: 700 }}>{placeOfSupply}</td>
                </tr>
                {customerMobile ? (
                  <tr>
                    <td style={partyLabel}>Phone</td>
                    <td style={{ fontWeight: 700 }}>{customerMobile}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Item grid â€” stretches down to the totals band */}
        <div className="wholesale-gst-a4-grid" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <table className="wholesale-gst-a4-items" style={gridTable}>
            {colGroup}
            <thead>
              <tr>
                <th style={{ ...hCell, borderLeft: "none" }}>#</th>
                <th style={{ ...hCell, textAlign: "left" }}>Item Description</th>
                {showHSN ? <th style={hCell}>HSN/SAC</th> : null}
                <th style={hCell}>Rate / Item</th>
                <th style={hCell}>Qty</th>
                <th style={hCell}>Taxable Value</th>
                <th style={hCell}>GST</th>
                <th style={{ ...hCell, borderRight: "none" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const line = lines[index];
                const variant = [item.color, item.size].filter((v) => dash(v)).join(" / ");
                return (
                  <tr key={`${item.sr}-${index}`} className="wholesale-gst-a4-row">
                    <td style={{ ...cell, borderLeft: "none", textAlign: "center", color: MUTED }}>{index + 1}</td>
                    <td style={{ ...cell, wordBreak: "break-word" }}>
                      <div style={{ fontWeight: 700, fontSize: "12.5px" }}>{item.particulars}</div>
                      {variant ? (
                        <div style={{ fontSize: "10.5px", color: MUTED }}>{variant}</div>
                      ) : null}
                    </td>
                    {showHSN ? (
                      <td style={{ ...cell, textAlign: "center" }}>{dash(item.hsn) || "â€”"}</td>
                    ) : null}
                    <td style={num}>{fmt(line.unitRate)}</td>
                    <td style={{ ...cell, textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {item.qty}
                      {item.uom ? <span style={{ fontWeight: 400, color: MUTED }}> {item.uom}</span> : null}
                    </td>
                    <td style={num}>{fmt(line.taxable)}</td>
                    <td style={num}>
                      {fmt(line.gst)}
                      <div style={{ fontSize: "10.5px", color: MUTED }}>
                        {line.gstPercent > 0 ? `@ ${line.gstPercent}%` : "Nil"}
                      </div>
                    </td>
                    <td style={{ ...num, borderRight: "none", fontWeight: 700, fontSize: "12.5px" }}>
                      {fmt(line.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Empty grid behind the remaining space keeps the column lines running
              down the sheet. Absolutely positioned, so it never adds height and
              a full page of items is not pushed onto a second sheet. */}
          <div
            className="wholesale-gst-a4-filler"
            aria-hidden="true"
            style={{ flex: 1, position: "relative", minHeight: "4mm" }}
          >
            <table style={{ ...gridTable, position: "absolute", top: 0, left: 0, height: "100%" }}>
              {colGroup}
              <tbody>
                <tr>
                  {colWidths.map((_, i) => (
                    <td key={i} style={{ ...fillerCell, ...edge(i, colWidths.length) }} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <table style={gridTable}>
            {colGroup}
            <tbody>
              <tr className="wholesale-gst-a4-row">
                <td style={{ ...totalCell, borderLeft: "none", textAlign: "right" }} colSpan={showHSN ? 4 : 3}>
                  Total
                  <span style={{ fontWeight: 500, fontSize: "11.5px", color: MUTED, marginLeft: "8px" }}>
                    ({items.length} {items.length === 1 ? "item" : "items"})
                  </span>
                </td>
                <td style={{ ...totalCell, textAlign: "center" }}>{totalQty}</td>
                <td style={{ ...totalCell, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(taxableTotal)}</td>
                <td style={{ ...totalCell, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(totalTax)}</td>
                <td style={{ ...totalCell, borderRight: "none", textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmt(totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="wholesale-gst-a4-footer">
          {/* Bank Â· UPI QR  |  Per-rate GST summary + grand total */}
          <div style={{ display: "flex", borderBottom: b }}>
            <div style={{ flex: 1, display: "flex", borderRight: b, minWidth: 0 }}>
              <div style={{ flex: 1, display: "flex" }}>
                <div style={{ flex: 1, padding: "8px 14px", minWidth: 0 }}>
                  <div style={{ ...sectionLabel, marginBottom: "4px" }}>Bank Details</div>
                  {hasBank ? (
                    <table style={{ borderCollapse: "collapse", fontSize: "12.5px", lineHeight: 1.45 }}>
                      <tbody>
                        {[
                          ["Bank Name", bankName],
                          ["A/c Holder", bankHolder],
                          ["A/c No.", bankAc],
                          ["IFSC Code", bankIfsc],
                          ["Branch", bankBranch],
                        ]
                          .filter(([, v]) => v)
                          .map(([label, value]) => (
                            <tr key={label}>
                              <td style={{ color: MUTED, paddingRight: "6px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                                {label}
                              </td>
                              <td style={{ paddingRight: "6px", color: MUTED, verticalAlign: "top" }}>:</td>
                              <td style={{ fontWeight: 700, wordBreak: "break-word" }}>{value}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>Add bank details in Settings â†’ Sale</div>
                  )}
                </div>
                <div
                  style={{
                    width: "36mm",
                    flexShrink: 0,
                    padding: "6px 6px",
                    borderLeft: b,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="UPI QR" style={{ width: "25mm", height: "25mm", objectFit: "contain" }} />
                  ) : (
                    <div
                      style={{
                        width: "25mm",
                        height: "25mm",
                        border: `1px dashed ${HAIR}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10.5px",
                        color: "#9ca3af",
                      }}
                    >
                      UPI QR
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "10.5px",
                      marginTop: "3px",
                      fontWeight: 700,
                      wordBreak: "break-all",
                      color: "#374151",
                      lineHeight: 1.25,
                    }}
                  >
                    <div style={{ ...sectionLabel, fontSize: "9.5px" }}>Scan &amp; Pay</div>
                    {upiId || "Any UPI app"}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ width: "74mm", flexShrink: 0, display: "flex", flexDirection: "column" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={sumLabel}>Taxable Amount</td>
                    <td style={sumValue}>â‚¹{fmt(taxableTotal)}</td>
                  </tr>
                  {slabs.length === 0 ? (
                    <tr>
                      <td style={sumLabel}>Tax</td>
                      <td style={sumValue}>â‚¹{fmt(0)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={2} style={{ padding: "3px 8px 4px", borderBottom: `1px solid ${HAIR}` }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                          <thead>
                            <tr>
                              <th style={gstHead}>GST Rate</th>
                              {isInterState ? (
                                <th style={{ ...gstHead, textAlign: "right" }}>IGST</th>
                              ) : (
                                <>
                                  <th style={{ ...gstHead, textAlign: "right" }}>CGST</th>
                                  <th style={{ ...gstHead, textAlign: "right" }}>SGST</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {slabs.map((slab) => (
                              <tr key={`gst-${slab.gstPercent}`}>
                                <td style={gstCell}>
                                  <strong>{slab.gstPercent}%</strong>
                                  {isInterState ? null : (
                                    <span style={{ color: MUTED, fontSize: "10.5px" }}>
                                      {" "}
                                      ({formatGstHalfRateLabel(slab.gstPercent)} + {formatGstHalfRateLabel(slab.gstPercent)})
                                    </span>
                                  )}
                                </td>
                                {isInterState ? (
                                  <td style={{ ...gstCell, textAlign: "right", fontWeight: 700 }}>â‚¹{fmt(slab.igst)}</td>
                                ) : (
                                  <>
                                    <td style={{ ...gstCell, textAlign: "right", fontWeight: 700 }}>â‚¹{fmt(slab.cgst)}</td>
                                    <td style={{ ...gstCell, textAlign: "right", fontWeight: 700 }}>â‚¹{fmt(slab.sgst)}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  {hasRoundOff ? (
                    <tr>
                      <td style={sumLabel}>Round Off</td>
                      <td style={sumValue}>
                        {roundOff < 0 ? "âˆ’" : ""}
                        {fmt(Math.abs(roundOff))}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "7px 12px",
                  background: ACCENT,
                  color: "#fff",
                  ...printExact,
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#fff" }}>
                  Grand Total
                </span>
                <span style={{ fontSize: "19px", fontWeight: 800, whiteSpace: "nowrap", color: "#fff" }}>
                  â‚¹{fmt(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Amount in words */}
          <div
            style={{
              padding: "6px 14px",
              borderBottom: b,
              fontSize: "12px",
              lineHeight: 1.35,
              background: SOFT,
              ...printExact,
            }}
          >
            <span style={{ ...sectionLabel, marginRight: "8px" }}>Amount in Words</span>
            <span style={{ fontWeight: 700, fontStyle: "italic" }}>{numberToWords(grandTotal)}</span>
          </div>
          {/* Terms Â· Receiver Â· Signatory */}
          <div style={{ display: "flex", minHeight: "28mm" }}>
            <div style={{ flex: 1, padding: "6px 14px 7px", borderRight: b, minWidth: 0 }}>
              <div style={{ ...sectionLabel, marginBottom: "2px" }}>Terms &amp; Conditions</div>
              <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "10px", lineHeight: 1.35, color: "#374151" }}>
                {terms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
            <div
              style={{
                width: "28mm",
                flexShrink: 0,
                padding: "8px 6px",
                borderRight: b,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                textAlign: "center",
              }}
            >
              <div style={{ borderTop: `1px solid ${GRID}`, paddingTop: "4px", fontSize: "11px", fontWeight: 600, color: "#374151" }}>
                Receiver&apos;s Sign
              </div>
            </div>
            <div
              style={{
                width: "46mm",
                flexShrink: 0,
                padding: "7px 8px 8px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "11px", color: INK, lineHeight: 1.25 }}>For {businessName}</div>
              <div
                style={{
                  flex: 1,
                  minHeight: "12mm",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {stampImageBase64 ? (
                  <img src={stampImageBase64} alt="" style={{ width: stampW, maxWidth: "100%", maxHeight: "56px", objectFit: "contain" }} />
                ) : null}
              </div>
              <div style={{ borderTop: `1px solid ${GRID}`, paddingTop: "4px", fontWeight: 700, fontSize: "11px", color: "#374151" }}>
                Authorised Signatory
              </div>
            </div>
          </div>

          <div
            style={{
              borderTop: b,
              padding: "3px 12px",
              fontSize: "10px",
              color: "#6b7280",
              textAlign: "center",
              letterSpacing: "0.3px",
            }}
          >
            {customFooterText?.trim() || "This is a computer generated invoice."}
          </div>
        </div>
      </div>
    </div>
  );
};
