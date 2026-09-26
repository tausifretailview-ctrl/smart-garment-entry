import React from "react";
import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";
import {
  formatPlaceOfSupplyFromGstin,
  normalizeGstTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import { roundInvoiceMoney } from "@/utils/invoiceGstRateSlabs";
import {
  pivotSaleItemsBySize,
  resolveInvoiceSizeColumns,
} from "@/utils/invoiceSizePivot";

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
  color?: string;
  gstPercent?: number;
  discountPercent?: number;
}

export interface KlearA4TemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  customerTransportDetails?: string;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  discount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
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
  showBankDetails?: boolean;
  sizeColumnHints?: string[] | null;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const DEFAULT_TERMS = [
  "Subject to the seller's local court jurisdiction.",
  "Goods once sold will not be taken back.",
];

const fmt = (n: number) =>
  roundInvoiceMoney(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatInvoiceDate = (date?: Date | string | null): string => {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy");
};

/** Brand palette — deep navy prints as a clean dark grey on B/W lasers. */
const INK = "#111827";
const ACCENT = "#1e3a5f";
const SOFT = "#eef2f7";
const GRID = "#4b5563";
const HAIR = "#d1d5db";

/**
 * Up to this many product rows the bill fits one sheet, so the item grid is
 * stretched to the totals band. Longer bills print as plain flowing blocks:
 * Chrome mis-positions flex content that breaks across printed pages.
 */
const SINGLE_PAGE_MAX_ROWS = 14;

const printExact: React.CSSProperties = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

/**
 * Klear A4 — footwear wholesale tax invoice with size-column pivot.
 * Full A4 portrait sheet inside one bordered frame; the item grid stretches so
 * its column lines run down to the totals band (like a printed bill book).
 * Separate item table from Wholesale GST A4; footer/bank/UPI conventions match.
 */
export const KlearA4Template: React.FC<KlearA4TemplateProps> = ({
  businessName,
  address,
  mobile,
  gstNumber,
  email,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  taxType: taxTypeProp = "inclusive",
  items,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  roundOff,
  grandTotal,
  termsConditions,
  customFooterText,
  bankDetails,
  qrCodeUrl,
  upiId,
  showBankDetails = true,
  sizeColumnHints,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const isNoGst = taxType === "no_gst";
  const isInterState = (igstAmount || 0) > 0.005 && (cgstAmount || 0) < 0.005;
  const columns = resolveInvoiceSizeColumns(
    items.map((item) => ({
      particulars: item.particulars,
      size: item.size,
      qty: item.qty,
      total: item.total,
      rate: item.rate,
    })),
    sizeColumnHints,
  );
  const pivot = pivotSaleItemsBySize(
    items.map((item) => ({
      particulars: item.particulars,
      color: item.color,
      hsn: item.hsn,
      gstPercent: item.gstPercent,
      mrp: item.mrp || item.sp,
      discountPercent: item.discountPercent,
      rate: item.rate,
      size: item.size,
      qty: item.qty,
      total: item.total,
    })),
    columns,
  );
  // Informational MRP gap (sum of MRP×qty − Net×qty). Not sale.discount —
  // that header discount is already in line nets / grandTotal.
  const splDiscount = pivot.merchandiseDiscount;
  const placeOfSupply =
    formatPlaceOfSupplyFromGstin(customerGSTIN) ||
    formatPlaceOfSupplyFromGstin(gstNumber) ||
    "—";

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
  const stampW = stampSize === "small" ? "72px" : stampSize === "large" ? "120px" : "96px";

  const frameLine = `1.5px solid ${ACCENT}`;
  const b = `1px solid ${GRID}`;
  const colLine = `1px solid ${GRID}`;

  // Item grid: column lines only, hairline between rows (bill-book look).
  const cell: React.CSSProperties = {
    borderLeft: colLine,
    borderRight: colLine,
    borderBottom: `1px solid ${HAIR}`,
    padding: "4px 4px",
    fontSize: "12px",
    verticalAlign: "middle",
    color: INK,
  };
  const hCell: React.CSSProperties = {
    border: `1px solid ${ACCENT}`,
    borderLeft: "1px solid #3d5a80",
    borderRight: "1px solid #3d5a80",
    padding: "6px 3px",
    fontSize: "11px",
    fontWeight: 700,
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.2,
    color: "#fff",
    background: ACCENT,
    ...printExact,
  };
  const sizeHCell: React.CSSProperties = {
    ...hCell,
    fontSize: "12px",
    padding: "6px 1px",
  };
  const totalCell: React.CSSProperties = {
    ...cell,
    borderTop: `1.5px solid ${ACCENT}`,
    borderBottom: `1.5px solid ${ACCENT}`,
    fontWeight: 800,
    background: SOFT,
    ...printExact,
  };
  const fillerCell: React.CSSProperties = {
    borderLeft: colLine,
    borderRight: colLine,
    padding: 0,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: ACCENT,
  };
  const metaLabel: React.CSSProperties = {
    padding: "3px 0",
    fontSize: "12px",
    fontWeight: 600,
    color: "#4b5563",
    whiteSpace: "nowrap",
    width: "34mm",
  };
  const metaValue: React.CSSProperties = {
    padding: "3px 0",
    fontSize: "13px",
    fontWeight: 700,
    color: INK,
    borderBottom: `1px dotted ${HAIR}`,
  };
  const sumLabel: React.CSSProperties = {
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: 600,
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

  const productLabel = (row: { productName: string; color: string }) => {
    const color = row.color.trim();
    if (!color) return row.productName;
    return row.productName.toUpperCase().includes(color.toUpperCase())
      ? row.productName
      : `${row.productName} ${color}`;
  };

  const fillPage = pivot.rows.length <= SINGLE_PAGE_MAX_ROWS;

  const sizeColWidth = Math.max(2.6, Math.min(4, 30 / Math.max(columns.length, 1)));

  const colGroup = (
    <colgroup>
      <col style={{ width: "4%" }} />
      <col style={{ width: "17%" }} />
      <col style={{ width: "9%" }} />
      <col style={{ width: "5%" }} />
      <col style={{ width: "7.5%" }} />
      {columns.map((sz) => (
        <col key={sz} style={{ width: `${sizeColWidth}%` }} />
      ))}
      <col style={{ width: "5.5%" }} />
      <col style={{ width: "5%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "10.5%" }} />
    </colgroup>
  );
  const gridTable: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  };

  return (
    <div
      className={fillPage ? "klear-a4-invoice-root" : "klear-a4-invoice-root klear-a4-flow"}
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "6mm",
        fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
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
          .klear-a4-invoice-root {
            width: 198mm !important;
            min-height: 283mm !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .klear-a4-page-frame {
            min-height: 283mm !important;
            -webkit-box-decoration-break: clone;
            box-decoration-break: clone;
          }
          .klear-a4-items thead {
            display: table-header-group;
          }
          .klear-a4-items tr.klear-a4-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .klear-a4-flow,
          .klear-a4-flow .klear-a4-page-frame,
          .klear-a4-flow .klear-a4-grid {
            display: block !important;
          }
          .klear-a4-flow .klear-a4-filler {
            display: none !important;
          }
          .klear-a4-footer {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      <div
        className="klear-a4-page-frame"
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
            padding: "6px 12px",
            background: ACCENT,
            color: "#fff",
            ...printExact,
          }}
        >
          <div />
          <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "3px", textTransform: "uppercase" }}>
            Tax Invoice
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                border: "1px solid rgba(255,255,255,0.7)",
                borderRadius: "3px",
                padding: "2px 8px",
              }}
            >
              Credit Memo
            </span>
          </div>
        </div>

        {/* Business header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "9px 16px 8px",
            borderBottom: frameLine,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{ width: "22mm", height: "22mm", objectFit: "contain", flexShrink: 0 }}
            />
          ) : null}
          <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "26px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "1.5px",
                lineHeight: 1.1,
                color: ACCENT,
              }}
            >
              {businessName}
            </div>
            {address ? (
              <div
                style={{
                  marginTop: "5px",
                  fontSize: "13px",
                  fontWeight: 600,
                  whiteSpace: "pre-line",
                  lineHeight: 1.4,
                  color: "#1f2937",
                }}
              >
                {address}
              </div>
            ) : null}
            {mobile || email ? (
              <div style={{ marginTop: "3px", fontSize: "13px", fontWeight: 600, lineHeight: 1.4, color: "#1f2937" }}>
                {mobile ? <span>Mob.: {mobile}</span> : null}
                {email ? (
                  <span>
                    {mobile ? "   •   " : ""}Email: {email}
                  </span>
                ) : null}
              </div>
            ) : null}
            {gstNumber ? (
              <div
                style={{
                  display: "inline-block",
                  marginTop: "6px",
                  padding: "2px 12px",
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.8px",
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
          </div>
          {logoUrl ? <div style={{ width: "22mm", flexShrink: 0 }} /> : null}
        </div>

        {/* Party + bill details */}
        <div style={{ display: "flex", borderBottom: frameLine }}>
          <div style={{ flex: 1.25, padding: "8px 14px 10px", borderRight: b, minWidth: 0 }}>
            <div style={sectionLabel}>Billed To</div>
            <div
              style={{
                marginTop: "4px",
                fontSize: "16px",
                fontWeight: 800,
                lineHeight: 1.25,
                textTransform: "uppercase",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#4b5563", marginRight: "6px" }}>M/s.</span>
              {customerName || "Walk-in Customer"}
            </div>
            <table style={{ borderCollapse: "collapse", marginTop: "4px", fontSize: "12px", lineHeight: 1.4 }}>
              <tbody>
                {customerAddress ? (
                  <tr>
                    <td style={{ fontWeight: 600, color: "#4b5563", paddingRight: "8px", verticalAlign: "top" }}>Add.</td>
                    <td style={{ whiteSpace: "pre-line" }}>{customerAddress}</td>
                  </tr>
                ) : null}
                {customerGSTIN ? (
                  <tr>
                    <td style={{ fontWeight: 600, color: "#4b5563", paddingRight: "8px" }}>GSTIN</td>
                    <td style={{ fontWeight: 800, letterSpacing: "0.4px" }}>{customerGSTIN}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={{ fontWeight: 600, color: "#4b5563", paddingRight: "8px" }}>State</td>
                  <td style={{ fontWeight: 700 }}>{placeOfSupply}</td>
                </tr>
                {customerMobile ? (
                  <tr>
                    <td style={{ fontWeight: 600, color: "#4b5563", paddingRight: "8px" }}>Mob.</td>
                    <td style={{ fontWeight: 700 }}>{customerMobile}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1, padding: "8px 14px 10px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  flex: 1,
                  background: SOFT,
                  border: `1px solid ${HAIR}`,
                  borderRadius: "3px",
                  padding: "4px 8px",
                  ...printExact,
                }}
              >
                <div style={sectionLabel}>Bill No</div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: INK }}>{invoiceNumber || "—"}</div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: SOFT,
                  border: `1px solid ${HAIR}`,
                  borderRadius: "3px",
                  padding: "4px 8px",
                  ...printExact,
                }}
              >
                <div style={sectionLabel}>Date</div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: INK }}>{formatInvoiceDate(invoiceDate)}</div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Transport", customerTransportDetails?.trim() || ""],
                  ["LR. No.", ""],
                  ["LR. Date", ""],
                  ["No. of Cartons", ""],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={metaLabel}>{label} :</td>
                    <td style={metaValue}>{value || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Item grid — stretches to the totals band */}
        <div className="klear-a4-grid" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <table className="klear-a4-items" style={gridTable}>
            {colGroup}
            <thead>
              <tr>
                <th style={{ ...hCell, borderLeft: "none" }}>Sr</th>
                <th style={{ ...hCell, textAlign: "left", paddingLeft: "6px" }}>Product Name</th>
                <th style={hCell}>HSN</th>
                <th style={hCell}>GST %</th>
                <th style={hCell}>MRP</th>
                {columns.map((sz) => (
                  <th key={sz} style={sizeHCell}>{sz}</th>
                ))}
                <th style={hCell}>Total Pairs</th>
                <th style={hCell}>Disc %</th>
                <th style={hCell}>Net Rate</th>
                <th style={{ ...hCell, borderRight: "none" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((row, idx) => (
                <tr key={row.key} className="klear-a4-row">
                  <td style={{ ...cell, borderLeft: "none", textAlign: "center", color: "#6b7280" }}>{idx + 1}</td>
                  <td style={{ ...cell, fontWeight: 700, paddingLeft: "6px", wordBreak: "break-word" }}>
                    {productLabel(row)}
                  </td>
                  <td style={{ ...cell, textAlign: "center", fontSize: "11px", letterSpacing: "-0.2px" }}>
                    {row.hsn || "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "center", fontSize: "11px" }}>
                    {row.gstPercent ? `${row.gstPercent}%` : "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                    {row.mrp ? roundInvoiceMoney(row.mrp).toLocaleString("en-IN") : "—"}
                  </td>
                  {columns.map((sz) => {
                    const qty = row.qtyBySize[sz] || 0;
                    return (
                      <td key={sz} style={{ ...cell, textAlign: "center", fontWeight: 700, padding: "4px 1px" }}>
                        {qty || ""}
                      </td>
                    );
                  })}
                  <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{row.totalPairs}</td>
                  <td style={{ ...cell, textAlign: "center", fontSize: "11px" }}>
                    {row.discountPercent ? `${roundInvoiceMoney(row.discountPercent)}%` : ""}
                  </td>
                  <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.netRate)}</td>
                  <td style={{ ...cell, borderRight: "none", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {fmt(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Empty grid behind the remaining space keeps the column lines running
              down the sheet. Absolutely positioned, so it never adds height and
              a full page of items is not pushed onto a second sheet. */}
          <div className="klear-a4-filler" aria-hidden="true" style={{ flex: 1, position: "relative", minHeight: "6mm" }}>
            <table style={{ ...gridTable, position: "absolute", top: 0, left: 0, height: "100%" }}>
              {colGroup}
              <tbody>
                <tr>
                <td style={{ ...fillerCell, borderLeft: "none" }} />
                <td style={fillerCell} />
                <td style={fillerCell} />
                <td style={fillerCell} />
                <td style={fillerCell} />
                {columns.map((sz) => (
                  <td key={sz} style={fillerCell} />
                ))}
                <td style={fillerCell} />
                <td style={fillerCell} />
                <td style={fillerCell} />
                <td style={{ ...fillerCell, borderRight: "none" }} />
                </tr>
              </tbody>
            </table>
          </div>
          <table style={gridTable}>
            {colGroup}
            <tbody>
              <tr className="klear-a4-row">
                <td style={{ ...totalCell, borderLeft: "none", textAlign: "right", paddingRight: "8px" }} colSpan={5}>
                  Total
                </td>
                {columns.map((sz) => (
                  <td key={sz} style={{ ...totalCell, textAlign: "center", padding: "5px 1px" }}>
                    {pivot.columnQtyTotals[sz] || ""}
                  </td>
                ))}
                <td style={{ ...totalCell, textAlign: "center" }}>{pivot.totalPairs}</td>
                <td style={totalCell} />
                <td style={totalCell} />
                <td style={{ ...totalCell, borderRight: "none", textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmt(pivot.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="klear-a4-footer">
          {/* Bank · QR · Totals */}
          <div style={{ display: "flex", borderBottom: b }}>
            <div style={{ flex: 1, padding: "8px 14px", borderRight: b, minWidth: 0 }}>
              <div style={{ ...sectionLabel, marginBottom: "5px" }}>Bank Details</div>
              {hasBank ? (
                <table style={{ borderCollapse: "collapse", fontSize: "12px", lineHeight: 1.5 }}>
                  <tbody>
                    {[
                      ["BANK NAME", bankName],
                      ["A/C NO.", bankAc],
                      ["BRANCH", bankBranch],
                      ["IFSC CODE", bankIfsc],
                      ["A/C HOLDER", bankHolder],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <tr key={label}>
                          <td style={{ fontWeight: 600, color: "#4b5563", paddingRight: "6px", whiteSpace: "nowrap" }}>
                            {label}
                          </td>
                          <td style={{ paddingRight: "6px" }}>:</td>
                          <td style={{ fontWeight: 800 }}>{value}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Add bank details in Settings → Sale</div>
              )}
            </div>
            <div
              style={{
                width: "36mm",
                padding: "6px",
                borderRight: b,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="UPI QR" style={{ width: "26mm", height: "26mm" }} />
              ) : (
                <div
                  style={{
                    width: "26mm",
                    height: "26mm",
                    border: `1px dashed ${HAIR}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    color: "#9ca3af",
                  }}
                >
                  UPI QR
                </div>
              )}
              <div style={{ fontSize: "10px", marginTop: "3px", fontWeight: 600, wordBreak: "break-all", color: "#374151" }}>
                {upiId || "Scan to pay"}
              </div>
            </div>
            <div style={{ width: "72mm", display: "flex", flexDirection: "column" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {splDiscount > 0.005 ? (
                    <tr>
                      <td style={sumLabel}>SPL DISCOUNT</td>
                      <td style={sumValue}>₹{fmt(splDiscount)}</td>
                    </tr>
                  ) : null}
                  {!isNoGst && isInterState ? (
                    <tr>
                      <td style={sumLabel}>IGST</td>
                      <td style={sumValue}>₹{fmt(igstAmount)}</td>
                    </tr>
                  ) : !isNoGst ? (
                    <>
                      <tr>
                        <td style={sumLabel}>CGST</td>
                        <td style={sumValue}>₹{fmt(cgstAmount)}</td>
                      </tr>
                      <tr>
                        <td style={sumLabel}>SGST</td>
                        <td style={sumValue}>₹{fmt(sgstAmount)}</td>
                      </tr>
                    </>
                  ) : null}
                  {Math.abs(Number(roundOff) || 0) >= 0.005 ? (
                    <tr>
                      <td style={sumLabel}>ROUND OFF</td>
                      <td style={sumValue}>
                        {roundOff < 0 ? "−" : ""}
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
                  padding: "8px 10px",
                  background: ACCENT,
                  color: "#fff",
                  ...printExact,
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>
                  Bill Amount
                </span>
                <span style={{ fontSize: "16px", fontWeight: 800, whiteSpace: "nowrap" }}>₹{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Amount in words */}
          <div
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              borderBottom: b,
              background: SOFT,
              ...printExact,
            }}
          >
            <span style={{ fontWeight: 700, color: ACCENT }}>Amount in words: </span>
            <span style={{ fontWeight: 700, fontStyle: "italic" }}>{numberToWords(grandTotal)}</span>
          </div>

          {/* Terms · Buyer · Seller */}
          <div style={{ display: "flex", minHeight: "24mm" }}>
            <div style={{ flex: 1.3, padding: "7px 14px", borderRight: b, minWidth: 0 }}>
              <div style={{ ...sectionLabel, marginBottom: "3px" }}>Terms &amp; Conditions</div>
              <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", lineHeight: 1.45, color: "#1f2937" }}>
                {terms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
            <div
              style={{
                flex: 0.8,
                padding: "7px 10px",
                borderRight: b,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, fontStyle: "italic" }}>Buyer&apos;s Signature</div>
              <div style={{ borderTop: `1px dotted ${GRID}`, margin: "0 6px" }} />
            </div>
            <div
              style={{
                flex: 1,
                padding: "7px 10px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "13px", color: ACCENT }}>For {businessName}</div>
              <div style={{ flex: 1, minHeight: "12mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {stampImageBase64 ? (
                  <img src={stampImageBase64} alt="" style={{ width: stampW, maxHeight: "56px", objectFit: "contain" }} />
                ) : null}
              </div>
              <div style={{ fontWeight: 600, fontSize: "11px", fontStyle: "italic", color: "#374151" }}>
                (Authorised Signatory)
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "3px 10px",
              fontSize: "10px",
              color: "#fff",
              textAlign: "center",
              letterSpacing: "0.4px",
              background: ACCENT,
              ...printExact,
            }}
          >
            {customFooterText?.trim() || "This is a computer generated invoice."}
          </div>
        </div>
      </div>
    </div>
  );
};
