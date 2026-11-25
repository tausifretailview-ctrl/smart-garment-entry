import React from "react";
import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";
import { formatPlaceOfSupplyFromGstin, normalizeGstTaxType, type GstTaxType } from "@/utils/gstRegisterUtils";
import { roundInvoiceMoney } from "@/utils/invoiceGstRateSlabs";
import { type InvoiceSizePivotRow } from "@/utils/invoiceSizePivot";
import { groupWholesaleSizeRows, wholesaleSizeColumns } from "@/utils/wholesaleSizeInvoice";
import { buildHsnTaxSummary } from "@/utils/hsnTaxSummary";
import { formatCustomerPoRef, type SaleB2BDetails } from "@/utils/industrialMode";

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode?: string;
  hsn?: string;
  sp?: number;
  qty: number;
  rate: number;
  mrp?: number;
  total: number;
  brand?: string;
  color?: string;
  gstPercent?: number;
  discountPercent?: number;
}

export interface WholesaleSizeA4TemplateProps {
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
  /** Ship-to branch picked on the Sale Bill; "same as buyer" when empty. */
  shippingAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  /** Transport line (bill dispatch details, else the party's transport text). */
  customerTransportDetails?: string;
  b2bDetails?: SaleB2BDetails | null;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  subtotal?: number;
  discount?: number;
  saleReturnAdjust?: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  roundOff?: number;
  /** Sale Bill "Charges" (transport / freight), added after tax. */
  otherCharges?: number;
  grandTotal: number;
  termsConditions?: string[];
  declarationText?: string;
  notes?: string;
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
  showBankDetails?: boolean;
  qrCodeUrl?: string;
  upiId?: string;
  sizeColumnHints?: string[] | null;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  documentTitle?: string;
  [key: string]: unknown;
}

const DEFAULT_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "Interest @18% p.a. will be charged on payments not received within the due date.",
  "Any objection in this invoice must be informed in writing within 7 days.",
  "Subject to local jurisdiction only.",
];

const INK = "#111827";
const MUTED = "#4b5563";
const ACCENT = "#0f3d3e";
const SOFT = "#eef5f4";
const LINE = "#374151";
const HAIR = "#d1d5db";

/** Up to this many printed rows (groups + products) the grid stretches to fill one sheet. */
const SINGLE_PAGE_MAX_ROWS = 18;

const printExact: React.CSSProperties = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };

const money = (n: number) =>
  roundInvoiceMoney(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dmy = (date?: Date | string | null): string => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd/MM/yyyy");
};

/**
 * Wholesale Size-wise A4 — garment wholesale tax invoice.
 * Shop logo on top, buyer and ship-to side by side, invoice + transport details, items as
 * product × colour rows with one column per size (grouped under brand / HSN headers), HSN tax
 * summary, bank details, UPI QR and signatory. One bordered A4 sheet; long bills flow onto more
 * pages with the column headings repeated.
 */
export const WholesaleSizeA4Template: React.FC<WholesaleSizeA4TemplateProps> = ({
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
  b2bDetails,
  taxType: taxTypeProp = "inclusive",
  items,
  subtotal,
  discount = 0,
  saleReturnAdjust = 0,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  roundOff = 0,
  otherCharges = 0,
  grandTotal,
  termsConditions,
  declarationText,
  notes,
  bankDetails,
  showBankDetails = true,
  qrCodeUrl,
  upiId,
  sizeColumnHints,
  stampImageBase64,
  stampSize = "medium",
  documentTitle,
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const isNoGst = taxType === "no_gst";
  const isInterState = igstAmount > 0.005 && cgstAmount < 0.005;

  const columns = wholesaleSizeColumns(items, sizeColumnHints);
  const { groups, columnQtyTotals, totalPcs, totalAmount } = groupWholesaleSizeRows(items, columns);
  const showMrp = groups.some((g) => g.rows.some((r) => r.mrp > 0));
  // HSN has its own column; a group row names the brand, once per brand (groups are brand × HSN).
  const showGroupHeaders = groups.some((g) => g.brand);
  const brandStarts = groups.map((g, i) => i === 0 || g.brand !== groups[i - 1].brand);
  const printedRows = groups.reduce(
    (s, g, i) => s + g.rows.length + (showGroupHeaders && brandStarts[i] ? 1 : 0),
    0,
  );
  const fillPage = printedRows <= SINGLE_PAGE_MAX_ROWS;

  const hsnSummary = isNoGst
    ? null
    : buildHsnTaxSummary({
        items: items.map((item) => ({ total: item.total, gstPercent: item.gstPercent, qty: item.qty, hsn: item.hsn })),
        taxType,
        grandTotal,
        saleReturnAdjust,
        isInterState,
        targetTax: cgstAmount + sgstAmount + igstAmount,
      });

  const placeOfSupply = formatPlaceOfSupplyFromGstin(customerGSTIN) || formatPlaceOfSupplyFromGstin(gstNumber) || "";
  const transportName = (b2bDetails?.transporter_name || "").trim() || (b2bDetails ? "" : (customerTransportDetails || "").trim());
  const poRef = formatCustomerPoRef(b2bDetails);
  const shipTo = (shippingAddress || "").trim();

  const terms = (termsConditions || []).filter((t) => t?.trim());
  const printedTerms = terms.length > 0 ? terms : DEFAULT_TERMS;
  const bankName = bankDetails?.bankName || bankDetails?.bank_name || "";
  const bankAc = bankDetails?.accountNumber || bankDetails?.account_number || "";
  const bankIfsc = bankDetails?.ifscCode || bankDetails?.ifsc_code || "";
  const bankHolder = bankDetails?.accountHolder || bankDetails?.account_holder || "";
  const bankBranch = bankDetails?.branch || "";
  const hasBank = Boolean(showBankDetails && (bankName || bankAc || bankIfsc));
  const stampW = stampSize === "small" ? "70px" : stampSize === "large" ? "118px" : "92px";

  // Column widths (%): sizes share what the fixed columns leave, description takes the rest.
  const sizeW = columns.length > 0 ? Math.max(2.2, Math.min(4.4, 35 / columns.length)) : 0;
  const fixed = { sr: 3.6, hsn: 8, gst: 4.4, pcs: 4.8, mrp: showMrp ? 6.4 : 0, rate: 7, amount: 10.2 };
  const descW = Math.max(
    11,
    100 - Object.values(fixed).reduce((a, b) => a + b, 0) - sizeW * columns.length,
  );
  const sizeFont = columns.length > 14 ? "9px" : columns.length > 10 ? "10px" : "11px";
  const colSpanAll = 7 + (showMrp ? 1 : 0) + columns.length;

  const frame = `1.5px solid ${ACCENT}`;
  const line = `1px solid ${LINE}`;
  const cell: React.CSSProperties = {
    borderLeft: line,
    borderRight: line,
    borderBottom: `1px solid ${HAIR}`,
    padding: "3px 3px",
    fontSize: "11.5px",
    color: INK,
    verticalAlign: "middle",
  };
  const num: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const sizeCell: React.CSSProperties = { ...cell, textAlign: "center", fontSize: sizeFont, padding: "3px 1px", fontWeight: 600 };
  const th: React.CSSProperties = {
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    fontSize: "10.5px",
    fontWeight: 700,
    padding: "5px 2px",
    textAlign: "center",
    lineHeight: 1.15,
    ...printExact,
  };
  const label: React.CSSProperties = {
    fontSize: "9.5px",
    fontWeight: 800,
    letterSpacing: "1px",
    textTransform: "uppercase",
    color: ACCENT,
  };
  const metaRow = (k: string, v: React.ReactNode) =>
    v ? (
      <tr key={k}>
        <td style={{ padding: "2px 6px 2px 0", fontSize: "11px", color: MUTED, fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>
          {k}
        </td>
        <td style={{ padding: "2px 0", fontSize: "12px", fontWeight: 700, color: INK }}>{v}</td>
      </tr>
    ) : null;
  const sumRow = (k: string, v: number, opts: { strong?: boolean; minus?: boolean } = {}) => (
    <tr key={k}>
      <td style={{ padding: "3px 8px", fontSize: opts.strong ? "13px" : "11.5px", fontWeight: opts.strong ? 800 : 600, color: opts.strong ? "#fff" : "#374151", borderBottom: `1px solid ${HAIR}` }}>
        {k}
      </td>
      <td style={{ padding: "3px 8px", textAlign: "right", fontSize: opts.strong ? "15px" : "12px", fontWeight: 800, color: opts.strong ? "#fff" : INK, borderBottom: `1px solid ${HAIR}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {opts.minus && v > 0 ? "− " : ""}₹ {money(Math.abs(v))}
      </td>
    </tr>
  );

  const productLabel = (row: InvoiceSizePivotRow) => row.productName;

  return (
    <div
      className={fillPage ? "wholesale-size-a4-invoice-root" : "wholesale-size-a4-invoice-root wsa4-flow"}
      data-testid="wholesale-size-a4"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "6mm",
        fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
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
          .wholesale-size-a4-invoice-root { width: 198mm !important; min-height: 283mm !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; }
          .wsa4-frame { min-height: 283mm !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
          .wsa4-items thead { display: table-header-group; }
          .wsa4-items tr { page-break-inside: avoid; break-inside: avoid; }
          .wsa4-flow, .wsa4-flow .wsa4-frame, .wsa4-flow .wsa4-grid { display: block !important; }
          .wsa4-flow .wsa4-filler { display: none !important; }
          .wsa4-footer { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <div
        className="wsa4-frame"
        style={{ border: frame, flex: 1, display: "flex", flexDirection: "column", boxSizing: "border-box", minHeight: 0 }}
      >
        {/* Shop header: logo, name and details, invoice title */}
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: frame }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, padding: "8px 12px", minWidth: 0 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                data-testid="wsa4-logo"
                style={{ width: "26mm", height: "22mm", objectFit: "contain", flexShrink: 0 }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "24px",
                  fontWeight: 800,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                  color: ACCENT,
                }}
              >
                {businessName}
              </div>
              {address ? (
                <div style={{ marginTop: "4px", fontSize: "11.5px", lineHeight: 1.35, whiteSpace: "pre-line", color: "#1f2937" }}>
                  {address}
                </div>
              ) : null}
              <div style={{ marginTop: "2px", fontSize: "11.5px", color: "#1f2937" }}>
                {[mobile ? `Ph: ${mobile}` : "", email ? `Email: ${email}` : ""].filter(Boolean).join("   •   ")}
              </div>
              {gstNumber ? (
                <div style={{ marginTop: "3px", fontSize: "12px", fontWeight: 800, letterSpacing: "0.6px" }}>GSTIN: {gstNumber}</div>
              ) : null}
            </div>
          </div>
          <div
            style={{
              width: "46mm",
              flexShrink: 0,
              borderLeft: frame,
              background: ACCENT,
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: "4px",
              padding: "6px",
              ...printExact,
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", textAlign: "center" }}>
              {documentTitle || (isNoGst ? "Bill of Supply" : "Tax Invoice")}
            </div>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", opacity: 0.85 }}>ORIGINAL FOR BUYER</div>
          </div>
        </div>

        {/* Buyer · Ship to · Invoice details */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 0.95fr", borderBottom: frame }}>
          <div style={{ padding: "6px 10px", borderRight: line, minWidth: 0 }}>
            <div style={label}>Buyer (Bill To)</div>
            <div style={{ marginTop: "3px", fontSize: "14px", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.2 }}>
              {customerName || "Walk-in Customer"}
            </div>
            {customerAddress ? (
              <div style={{ marginTop: "2px", fontSize: "11px", lineHeight: 1.35, whiteSpace: "pre-line" }}>{customerAddress}</div>
            ) : null}
            <table style={{ borderCollapse: "collapse", marginTop: "3px" }}>
              <tbody>
                {metaRow("GSTIN", customerGSTIN)}
                {metaRow("State", placeOfSupply)}
                {metaRow("Mobile", customerMobile)}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "6px 10px", borderRight: line, minWidth: 0 }} data-testid="wsa4-ship-to">
            <div style={label}>Ship To</div>
            <div style={{ marginTop: "3px", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.2 }}>
              {customerName || "—"}
            </div>
            <div style={{ marginTop: "2px", fontSize: "11px", lineHeight: 1.35, whiteSpace: "pre-line" }}>
              {shipTo || customerAddress || ""}
            </div>
            {!shipTo ? <div style={{ marginTop: "2px", fontSize: "10px", color: MUTED, fontStyle: "italic" }}>Same as buyer</div> : null}
          </div>
          <div style={{ padding: "6px 10px", minWidth: 0, background: SOFT, ...printExact }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {metaRow("Invoice No", <span style={{ fontSize: "14px" }}>{invoiceNumber || "—"}</span>)}
                {metaRow("Date", dmy(invoiceDate))}
                {metaRow("Due Date", dmy(dueDate))}
                {metaRow("Order / PO", poRef)}
                {metaRow("Place of Supply", placeOfSupply)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transport strip */}
        <div
          data-testid="wsa4-transport"
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr",
            borderBottom: frame,
            fontSize: "11.5px",
          }}
        >
          {[
            ["Transport", transportName || (b2bDetails ? (customerTransportDetails || "").trim() : "")],
            ["Vehicle No", b2bDetails?.vehicle_no || ""],
            ["L.R. No", b2bDetails?.lr_no || ""],
            ["L.R. Date", dmy(b2bDetails?.lr_date)],
          ].map(([k, v], i) => (
            <div key={k} style={{ padding: "4px 10px", borderLeft: i === 0 ? "none" : line, minWidth: 0 }}>
              <span style={{ color: MUTED, fontWeight: 600 }}>{k}: </span>
              <span style={{ fontWeight: 700 }}>{v || "—"}</span>
            </div>
          ))}
        </div>

        {/* Items: product × colour rows, one column per size */}
        <div className="wsa4-grid" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <table className="wsa4-items" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: `${fixed.sr}%` }} />
              <col style={{ width: `${descW}%` }} />
              <col style={{ width: `${fixed.hsn}%` }} />
              <col style={{ width: `${fixed.gst}%` }} />
              {columns.map((sz) => (
                <col key={sz} style={{ width: `${sizeW}%` }} />
              ))}
              <col style={{ width: `${fixed.pcs}%` }} />
              {showMrp ? <col style={{ width: `${fixed.mrp}%` }} /> : null}
              <col style={{ width: `${fixed.rate}%` }} />
              <col style={{ width: `${fixed.amount}%` }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th} rowSpan={2}>Sr</th>
                <th style={{ ...th, textAlign: "left", paddingLeft: "6px" }} rowSpan={2}>Description of Goods</th>
                <th style={th} rowSpan={2}>HSN</th>
                <th style={th} rowSpan={2}>GST %</th>
                {columns.length > 0 ? (
                  <th style={{ ...th, fontSize: "9.5px", letterSpacing: "1px", padding: "2px" }} colSpan={columns.length}>
                    SIZE-WISE QUANTITY
                  </th>
                ) : null}
                <th style={th} rowSpan={2}>Pcs</th>
                {showMrp ? <th style={th} rowSpan={2}>MRP</th> : null}
                <th style={th} rowSpan={2}>Rate</th>
                <th style={th} rowSpan={2}>Amount ₹</th>
              </tr>
              <tr>
                {columns.map((sz) => (
                  <th key={sz} style={{ ...th, fontSize: sizeFont, padding: "3px 0", background: "#1f5556" }}>
                    {sz}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let sr = 0;
                return groups.map((g, gi) => (
                  <React.Fragment key={`${g.brand}|${g.hsn}|${gi}`}>
                    {showGroupHeaders && brandStarts[gi] ? (
                      <tr>
                        <td
                          colSpan={colSpanAll}
                          data-testid="wsa4-group"
                          style={{
                            ...cell,
                            background: SOFT,
                            fontSize: "11px",
                            fontWeight: 800,
                            letterSpacing: "0.4px",
                            borderTop: `1px solid ${LINE}`,
                            ...printExact,
                          }}
                        >
                          {g.brand || "ITEMS"}
                        </td>
                      </tr>
                    ) : null}
                    {g.rows.map((row) => {
                      sr += 1;
                      return (
                        <tr key={row.key} data-testid="wsa4-row">
                          <td style={{ ...cell, textAlign: "center" }}>{sr}</td>
                          <td style={{ ...cell, fontWeight: 700, wordBreak: "break-word" }}>
                            {productLabel(row)}
                            {row.color ? (
                              <span data-testid="wsa4-color" style={{ fontWeight: 600, color: "#374151" }}>{` – ${row.color}`}</span>
                            ) : null}
                          </td>
                          <td style={{ ...cell, textAlign: "center", fontSize: "10.5px", wordBreak: "break-word" }} data-testid="wsa4-hsn-cell">
                            {g.hsn || ""}
                          </td>
                          <td style={{ ...cell, textAlign: "center" }}>{row.gstPercent ? `${row.gstPercent}` : ""}</td>
                          {columns.map((sz) => (
                            <td key={sz} style={sizeCell}>
                              {row.qtyBySize[sz] ? row.qtyBySize[sz] : ""}
                            </td>
                          ))}
                          <td style={{ ...num, textAlign: "center", fontWeight: 800 }}>{row.totalPairs}</td>
                          {showMrp ? <td style={num}>{row.mrp > 0 ? money(row.mrp) : ""}</td> : null}
                          <td style={num}>{money(row.netRate)}</td>
                          <td style={{ ...num, fontWeight: 700 }}>{money(row.amount)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ));
              })()}
            </tbody>
          </table>
          {/* Column lines run down to the totals on a one-page bill */}
          <table className="wsa4-filler" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", flex: 1 }}>
            <colgroup>
              <col style={{ width: `${fixed.sr}%` }} />
              <col style={{ width: `${descW}%` }} />
              <col style={{ width: `${fixed.hsn}%` }} />
              <col style={{ width: `${fixed.gst}%` }} />
              {columns.map((sz) => (
                <col key={sz} style={{ width: `${sizeW}%` }} />
              ))}
              <col style={{ width: `${fixed.pcs}%` }} />
              {showMrp ? <col style={{ width: `${fixed.mrp}%` }} /> : null}
              <col style={{ width: `${fixed.rate}%` }} />
              <col style={{ width: `${fixed.amount}%` }} />
            </colgroup>
            <tbody>
              <tr style={{ height: "100%" }}>
                {Array.from({ length: colSpanAll }, (_, i) => (
                  <td key={i} style={{ borderLeft: line, borderRight: line, padding: 0 }} />
                ))}
              </tr>
            </tbody>
          </table>
          {/* Size totals */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: `${fixed.sr + descW + fixed.hsn + fixed.gst}%` }} />
              {columns.map((sz) => (
                <col key={sz} style={{ width: `${sizeW}%` }} />
              ))}
              <col style={{ width: `${fixed.pcs}%` }} />
              {showMrp ? <col style={{ width: `${fixed.mrp}%` }} /> : null}
              <col style={{ width: `${fixed.rate}%` }} />
              <col style={{ width: `${fixed.amount}%` }} />
            </colgroup>
            <tbody>
              <tr data-testid="wsa4-total-row">
                <td style={{ ...cell, borderTop: frame, borderBottom: frame, background: SOFT, fontWeight: 800, textAlign: "right", paddingRight: "8px", ...printExact }}>
                  TOTAL
                </td>
                {columns.map((sz) => (
                  <td key={sz} style={{ ...sizeCell, borderTop: frame, borderBottom: frame, background: SOFT, fontWeight: 800, ...printExact }}>
                    {columnQtyTotals[sz] || ""}
                  </td>
                ))}
                <td style={{ ...num, textAlign: "center", borderTop: frame, borderBottom: frame, background: SOFT, fontWeight: 800, ...printExact }}>
                  {totalPcs}
                </td>
                {showMrp ? <td style={{ ...cell, borderTop: frame, borderBottom: frame, background: SOFT, ...printExact }} /> : null}
                <td style={{ ...cell, borderTop: frame, borderBottom: frame, background: SOFT, ...printExact }} />
                <td style={{ ...num, borderTop: frame, borderBottom: frame, background: SOFT, fontWeight: 800, ...printExact }}>
                  {money(totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer: HSN tax summary, bank, terms · totals, QR, signatory */}
        <div className="wsa4-footer" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr" }}>
          <div style={{ borderRight: line, minWidth: 0 }}>
            {hsnSummary && hsnSummary.rows.length > 0 ? (
              <table data-testid="wsa4-hsn" style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                <thead>
                  <tr>
                    {["HSN", "GST %", "Taxable", ...(isInterState ? ["IGST"] : ["CGST", "SGST"]), "Total Tax"].map((h) => (
                      <th key={h} style={{ ...th, fontSize: "9.5px", padding: "3px 2px", background: "#1f5556" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hsnSummary.rows.map((r) => (
                    <tr key={`${r.hsn}|${r.gstPercent}`}>
                      <td style={{ ...cell, textAlign: "center" }}>{r.hsn}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{r.gstPercent}</td>
                      <td style={num}>{money(r.taxable)}</td>
                      {isInterState ? (
                        <td style={num}>{money(r.igst)}</td>
                      ) : (
                        <>
                          <td style={num}>{money(r.cgst)}</td>
                          <td style={num}>{money(r.sgst)}</td>
                        </>
                      )}
                      <td style={{ ...num, fontWeight: 700 }}>{money(r.tax)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} style={{ ...cell, fontWeight: 800, textAlign: "right", borderTop: line }}>Total</td>
                    <td style={{ ...num, fontWeight: 800, borderTop: line }}>{money(hsnSummary.total.taxable)}</td>
                    {isInterState ? (
                      <td style={{ ...num, fontWeight: 800, borderTop: line }}>{money(hsnSummary.total.igst)}</td>
                    ) : (
                      <>
                        <td style={{ ...num, fontWeight: 800, borderTop: line }}>{money(hsnSummary.total.cgst)}</td>
                        <td style={{ ...num, fontWeight: 800, borderTop: line }}>{money(hsnSummary.total.sgst)}</td>
                      </>
                    )}
                    <td style={{ ...num, fontWeight: 800, borderTop: line }}>{money(hsnSummary.total.tax)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
            <div style={{ padding: "5px 10px", borderTop: line, fontSize: "11px" }}>
              <span style={{ color: MUTED, fontWeight: 600 }}>Amount in words: </span>
              <span style={{ fontWeight: 800, textTransform: "uppercase" }} data-testid="wsa4-words">
                {numberToWords(Math.round(grandTotal))}
              </span>
            </div>
            {hasBank ? (
              <div style={{ padding: "5px 10px", borderTop: line, fontSize: "11px", lineHeight: 1.45 }} data-testid="wsa4-bank">
                <div style={label}>Bank Details</div>
                {bankHolder ? <div>A/c Name: <b>{bankHolder}</b></div> : null}
                {bankName ? <div>Bank: <b>{bankName}</b>{bankBranch ? `, ${bankBranch}` : ""}</div> : null}
                {bankAc ? <div>A/c No: <b>{bankAc}</b></div> : null}
                {bankIfsc ? <div>IFSC: <b>{bankIfsc}</b></div> : null}
              </div>
            ) : null}
            {notes?.trim() ? (
              <div style={{ padding: "4px 10px", borderTop: line, fontSize: "11px", whiteSpace: "pre-line" }}>
                <b>Remarks: </b>
                {notes}
              </div>
            ) : null}
            <div style={{ padding: "5px 10px", borderTop: line, fontSize: "9.5px", lineHeight: 1.4, color: "#1f2937" }}>
              <div style={label}>Terms &amp; Conditions</div>
              <ol style={{ margin: "2px 0 0", paddingLeft: "14px" }}>
                {printedTerms.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
              {declarationText?.trim() ? <div style={{ marginTop: "3px", fontStyle: "italic" }}>{declarationText}</div> : null}
              <div style={{ marginTop: "3px", color: MUTED }}>This is a computer generated invoice.</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="wsa4-totals">
              <tbody>
                {subtotal != null && Math.abs(subtotal - grandTotal) > 0.005 ? sumRow("Sub Total", subtotal) : null}
                {discount > 0.005 ? sumRow("Less: Discount", discount, { minus: true }) : null}
                {saleReturnAdjust > 0.005 ? sumRow("Less: Sale Return", saleReturnAdjust, { minus: true }) : null}
                {!isNoGst && taxableAmount != null ? sumRow("Taxable Value", taxableAmount) : null}
                {!isNoGst && !isInterState && cgstAmount > 0.005 ? sumRow("CGST", cgstAmount) : null}
                {!isNoGst && !isInterState && sgstAmount > 0.005 ? sumRow("SGST", sgstAmount) : null}
                {!isNoGst && isInterState ? sumRow("IGST", igstAmount) : null}
                {otherCharges > 0.005 ? sumRow("Add: Transport Charges", otherCharges) : null}
                {Math.abs(roundOff) > 0.004 ? sumRow("Round Off", roundOff) : null}
              </tbody>
            </table>
            <table style={{ width: "100%", borderCollapse: "collapse", background: ACCENT, ...printExact }}>
              <tbody>{sumRow("BILL AMOUNT", grandTotal, { strong: true })}</tbody>
            </table>
            <div style={{ display: "flex", flex: 1, borderTop: line }}>
              {qrCodeUrl ? (
                <div style={{ padding: "6px", borderRight: line, textAlign: "center", width: "34mm", flexShrink: 0 }}>
                  <img src={qrCodeUrl} alt="" style={{ width: "26mm", height: "26mm" }} data-testid="wsa4-qr" />
                  <div style={{ fontSize: "9px", fontWeight: 700, marginTop: "2px" }}>Scan &amp; Pay</div>
                  {upiId ? <div style={{ fontSize: "8.5px", color: MUTED, wordBreak: "break-all" }}>{upiId}</div> : null}
                </div>
              ) : null}
              <div style={{ flex: 1, padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", minWidth: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textAlign: "right" }}>For {businessName}</div>
                {stampImageBase64 ? (
                  <img src={stampImageBase64} alt="" style={{ width: stampW, maxHeight: "24mm", objectFit: "contain" }} />
                ) : (
                  <div style={{ height: "16mm" }} />
                )}
                <div style={{ fontSize: "10.5px", fontWeight: 700, borderTop: `1px solid ${LINE}`, paddingTop: "2px" }}>Authorised Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
