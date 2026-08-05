import React from "react";
import {
  normalizeGstTaxType,
  splitLineGstFromTotal,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";

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

export interface A4GstClassicInvoiceTemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceTime?: string;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  customerTransportDetails?: string;
  salesman?: string;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  declarationText?: string;
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
  showHSN?: boolean;
  showBankDetails?: boolean;
  notes?: string;
  customHeaderText?: string;
  documentTitle?: string;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  minItemRows?: number;
  [key: string]: unknown;
}

const DEFAULT_TERMS = [
  "GOODS ONCE SOLD WILL NOT BE TAKEN BACK.",
  "INTEREST @ 24% P.A. WILL BE CHARGED IF THE PAYMENT IS NOT MADE WITHIN THE STIPULATED TIME.",
  "SUBJECT TO LOCAL JURISDICTION ONLY.",
  "THIS IS A COMPUTER GENERATED INVOICE.",
];

const DEFAULT_DECLARATION =
  "Declaration: we hereby certify that our registration certificate under the Goods and Service Tax Act 2017 is in force on the date on which the Sale of Goods specified in this Tax Invoice is made by us and that the transaction of Sale covered by this Tax Invoice has been effected by us and it shall be accounted for in the turnover of sales while filling of return and the due tax if any payable on the Sale has been paid or shall be paid.";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const dash = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "");

const numberToIndianWords = (num: number): string => {
  if (num === 0) return "Zero";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convertChunk = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertChunk(n % 100) : "");
  };
  const absNum = Math.abs(Math.round(num));
  const rupees = Math.floor(absNum);
  const paise = Math.round((absNum - rupees) * 100);
  let result = "";
  if (rupees === 0) {
    result = "Zero";
  } else {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const hundred = rupees % 1000;
    if (crore > 0) result += convertChunk(crore) + " Crore ";
    if (lakh > 0) result += convertChunk(lakh) + " Lakh ";
    if (thousand > 0) result += convertChunk(thousand) + " Thousand ";
    if (hundred > 0) result += convertChunk(hundred);
  }
  result = result.trim();
  if (paise > 0) result += " and " + convertChunk(paise) + " Paise";
  return result + " Only";
};

const panFromGstin = (gstin?: string) =>
  gstin && gstin.length >= 12 ? gstin.substring(2, 12) : "";

/**
 * Classic A4 GST Tax Invoice — textile/wholesale layout with header QR.
 * Fits one A4 page; footer (bank / terms / declaration) pinned to page bottom.
 */
export const A4GstClassicInvoiceTemplate: React.FC<A4GstClassicInvoiceTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  salesman,
  taxType: taxTypeProp = "inclusive",
  items,
  discount,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  totalTax,
  roundOff,
  grandTotal,
  declarationText,
  termsConditions,
  bankDetails,
  qrCodeUrl,
  showHSN = true,
  showBankDetails = true,
  notes,
  customHeaderText,
  documentTitle,
  stampImageBase64,
  stampSize = "medium",
  minItemRows = 6,
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const isNoGst = taxType === "no_gst";
  const isInterState = (igstAmount || 0) > 0.005 && (cgstAmount || 0) < 0.005;

  const lineRows = items.map((item, index) => {
    const gstPct = isNoGst ? 0 : item.gstPercent || 0;
    const { taxable, gst: gstAmt } = isNoGst
      ? { taxable: item.total || 0, gst: 0 }
      : splitLineGstFromTotal(item.total, gstPct);
    const safeQty = item.qty > 0 ? item.qty : 1;
    const unitPrice = taxable / safeQty;
    const discPct = Number(item.discountPercent) || 0;
    return {
      index: index + 1,
      item,
      taxable,
      unitPrice,
      gstPct,
      gstAmt,
      discPct,
      uom: item.uom || "Pcs",
    };
  });

  const totalQty = lineRows.reduce((s, r) => s + (Number(r.item.qty) || 0), 0);
  const lineTaxableTotal = lineRows.reduce((s, r) => s + r.taxable, 0);
  const blankRows = Math.max(0, (minItemRows || 6) - lineRows.length);

  const rateMap = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  lineRows.forEach((row) => {
    if (row.gstPct <= 0) return;
    const cur = rateMap.get(row.gstPct) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable += row.taxable;
    if (isInterState) cur.igst += row.gstAmt;
    else {
      cur.cgst += row.gstAmt / 2;
      cur.sgst += row.gstAmt / 2;
    }
    rateMap.set(row.gstPct, cur);
  });
  const taxSummaryRows = Array.from(rateMap.entries()).sort((a, b) => a[0] - b[0]);

  const terms =
    termsConditions && termsConditions.filter((t) => t?.trim()).length > 0
      ? termsConditions.filter((t) => t?.trim())
      : DEFAULT_TERMS;
  const declaration = declarationText?.trim() || DEFAULT_DECLARATION;

  const bankName = bankDetails?.bankName || bankDetails?.bank_name || "";
  const bankAc = bankDetails?.accountNumber || bankDetails?.account_number || "";
  const bankIfsc = bankDetails?.ifscCode || bankDetails?.ifsc_code || "";
  const bankHolder = bankDetails?.accountHolder || bankDetails?.account_holder || "";

  // This template is marketed as A4 Tax Invoice (QR) — always Tax Invoice unless credit note / custom title.
  const titleText =
    grandTotal < 0
      ? "CREDIT NOTE"
      : documentTitle?.trim() || "TAX INVOICE";

  const stampW =
    stampSize === "small" ? "90px" : stampSize === "large" ? "140px" : "115px";
  const stampH =
    stampSize === "small" ? "55px" : stampSize === "large" ? "80px" : "65px";

  const b = "1px solid #000";
  const ink: React.CSSProperties = { color: "#000", fontWeight: 600 };
  const cell: React.CSSProperties = {
    border: b,
    padding: "4px 5px",
    fontSize: "12px",
    verticalAlign: "top",
    lineHeight: 1.35,
    color: "#000",
    fontWeight: 600,
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    textAlign: "center",
    backgroundColor: "#e8e8e8",
    fontSize: "12px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const totLabel: React.CSSProperties = {
    flex: 1,
    borderRight: b,
    padding: "5px 7px",
    fontWeight: 700,
    fontSize: "12px",
    color: "#000",
  };
  const totVal: React.CSSProperties = {
    width: "42%",
    padding: "5px 7px",
    textAlign: "right",
    fontWeight: 700,
    fontSize: "12px",
    color: "#000",
  };

  const cgstRate =
    lineTaxableTotal > 0 && cgstAmount > 0
      ? Math.round((cgstAmount / lineTaxableTotal) * 1000) / 10
      : 0;
  const sgstRate = cgstRate;
  const igstRate =
    lineTaxableTotal > 0 && igstAmount > 0
      ? Math.round((igstAmount / lineTaxableTotal) * 1000) / 10
      : 0;

  const gstAmountDisplay = isNoGst
    ? 0
    : totalTax > 0
      ? totalTax
      : cgstAmount + sgstAmount + igstAmount;

  const station =
    customerAddress
      ?.split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(-2)
      .join(", ")
      .toUpperCase() || "";

  return (
    <div
      className="a4-gst-classic-invoice-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "4mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
        color: "#000",
        background: "#fff",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 4mm; }
          .a4-gst-classic-invoice-root {
            width: 202mm !important;
            min-height: 289mm !important;
            padding: 0 !important;
          }
          .a4-gst-classic-footer { page-break-inside: avoid; margin-top: auto !important; }
          .a4-gst-classic-invoice-root,
          .a4-gst-classic-invoice-root * {
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div
        style={{
          border: b,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            borderBottom: b,
            padding: "7px 10px",
            backgroundColor: "#f0f0f0",
            flexShrink: 0,
          }}
        >
          <div />
          <div
            style={{
              fontWeight: 800,
              fontSize: "20px",
              letterSpacing: "1px",
              textAlign: "center",
              color: "#000",
            }}
          >
            {titleText}
          </div>
          <div style={{ textAlign: "right", fontWeight: 700, fontSize: "13px", color: "#000" }}>
            Original Copy
          </div>
        </div>

        {/* Header: logo + company + QR */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            borderBottom: b,
            padding: "8px 10px",
            alignItems: "flex-start",
            flexShrink: 0,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{ width: "78px", height: "78px", objectFit: "contain", flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: "78px", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 800,
                textTransform: "uppercase",
                lineHeight: 1.15,
                color: "#000",
              }}
            >
              {businessName}
            </div>
            <div
              style={{
                fontSize: "12px",
                marginTop: "3px",
                whiteSpace: "pre-line",
                lineHeight: 1.4,
                fontWeight: 600,
                color: "#000",
              }}
            >
              {address}
            </div>
            <div style={{ fontSize: "12px", marginTop: "3px", fontWeight: 600, color: "#000" }}>
              {mobile && <span>Tel / Mob: {mobile}</span>}
              {mobile && email && <span> &nbsp;|&nbsp; </span>}
              {email && <span>Email: {email}</span>}
            </div>
            <div style={{ fontSize: "13px", marginTop: "3px", fontWeight: 700, color: "#000" }}>
              GSTIN: {dash(gstNumber) || "—"}
              {customHeaderText?.trim() ? ` || ${customHeaderText.trim()}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="UPI QR"
                style={{
                  width: "92px",
                  height: "92px",
                  display: "block",
                  border: "1px solid #000",
                }}
              />
            ) : (
              <div
                style={{
                  width: "92px",
                  height: "92px",
                  border: "1px dashed #666",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#000",
                }}
              >
                QR
              </div>
            )}
            <div style={{ fontSize: "11px", marginTop: "3px", fontWeight: 700, color: "#000" }}>
              Scan to Pay
            </div>
          </div>
        </div>

        {/* Billed / Shipped / Invoice meta */}
        <div style={{ display: "flex", borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, borderRight: b, padding: "7px 9px", ...ink }}>
            <div
              style={{
                fontWeight: 800,
                textDecoration: "underline",
                marginBottom: "4px",
                fontSize: "13px",
              }}
            >
              Billed To
            </div>
            <div style={{ fontWeight: 800, fontSize: "14px" }}>{customerName || "Walk-in Customer"}</div>
            {customerAddress && (
              <div style={{ whiteSpace: "pre-line", marginTop: "3px", lineHeight: 1.4, fontSize: "12px" }}>
                {customerAddress}
              </div>
            )}
            {customerMobile && <div style={{ marginTop: "3px", fontSize: "12px" }}>Ph: {customerMobile}</div>}
            <div style={{ marginTop: "3px", fontSize: "12px" }}>GSTIN: {dash(customerGSTIN) || "—"}</div>
            {customerGSTIN && <div style={{ fontSize: "12px" }}>PAN No: {panFromGstin(customerGSTIN)}</div>}
          </div>
          <div style={{ flex: 1, borderRight: b, padding: "7px 9px", ...ink }}>
            <div
              style={{
                fontWeight: 800,
                textDecoration: "underline",
                marginBottom: "4px",
                fontSize: "13px",
              }}
            >
              Shipped To
            </div>
            <div style={{ fontWeight: 800, fontSize: "14px" }}>{customerName || "Walk-in Customer"}</div>
            {customerAddress && (
              <div style={{ whiteSpace: "pre-line", marginTop: "3px", lineHeight: 1.4, fontSize: "12px" }}>
                {customerAddress}
              </div>
            )}
            {customerMobile && <div style={{ marginTop: "3px", fontSize: "12px" }}>Ph: {customerMobile}</div>}
            <div style={{ marginTop: "3px", fontSize: "12px" }}>GSTIN: {dash(customerGSTIN) || "—"}</div>
          </div>
          <div style={{ width: "32%", padding: "7px 9px", fontSize: "12px", fontWeight: 600, color: "#000" }}>
            <div><b>Invoice No.:</b> {invoiceNumber}</div>
            <div><b>Date of Invoice:</b> {formatDate(invoiceDate)}</div>
            <div><b>E-Way Bill No.:</b> —</div>
            <div><b>Agent:</b> {dash(salesman) || "—"}</div>
            <div><b>Supplier Ref.:</b> —</div>
            <div><b>Station:</b> {station || "—"}</div>
            <div><b>Narration:</b> {dash(notes) || "—"}</div>
            <div><b>No. Of Bales:</b> {invoiceNumber} X 1</div>
          </div>
        </div>

        {/* Transport */}
        <div
          style={{
            display: "flex",
            borderBottom: b,
            padding: "6px 9px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#000",
            gap: "16px",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <b>Transport:</b> {dash(customerTransportDetails) || "—"}
          </div>
          <div style={{ width: "22%" }}><b>L.R No.:</b> —</div>
          <div style={{ width: "22%" }}><b>L.R Date:</b> —</div>
        </div>

        {/* Items — grows to push footer down */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", height: "100%" }}>
            <colgroup>
              <col style={{ width: "30px" }} />
              <col />
              {showHSN ? <col style={{ width: "78px" }} /> : null}
              <col style={{ width: "52px" }} />
              <col style={{ width: "42px" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "46px" }} />
              <col style={{ width: "82px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={hCell}>S.N.</th>
                <th style={{ ...hCell, textAlign: "left" }}>Description of Goods</th>
                {showHSN && <th style={hCell}>HSN/SAC Code</th>}
                <th style={hCell}>Qty.</th>
                <th style={hCell}>Unit</th>
                <th style={hCell}>Price</th>
                <th style={hCell}>Dis.%</th>
                <th style={hCell}>Amount(₹)</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((row) => (
                <tr key={row.index}>
                  <td style={{ ...cell, textAlign: "center" }}>{row.index}</td>
                  <td style={cell}>
                    <div style={{ fontWeight: 700 }}>{row.item.particulars}</div>
                    {(row.item.size || row.item.color) && (
                      <div style={{ fontSize: "11px", color: "#000", fontWeight: 600 }}>
                        {[row.item.color, row.item.size].filter(Boolean).join(" / ")}
                      </div>
                    )}
                  </td>
                  {showHSN && (
                    <td style={{ ...cell, textAlign: "center" }}>{dash(row.item.hsn) || "—"}</td>
                  )}
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{fmt(row.item.qty)}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{row.uom}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmt(row.unitPrice)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmt(row.discPct)}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{fmt(row.taxable)}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`blank-${i}`} style={{ height: i === blankRows - 1 ? "100%" : "18px" }}>
                  <td style={cell}>&nbsp;</td>
                  <td style={cell} />
                  {showHSN && <td style={cell} />}
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer pinned to A4 bottom */}
        <div className="a4-gst-classic-footer" style={{ marginTop: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "7px 9px" }}>
              <div style={{ fontWeight: 800, marginBottom: "5px", fontSize: "13px", color: "#000" }}>
                Total Qty: {fmt(totalQty)} Pcs
              </div>
              {!isNoGst && taxSummaryRows.length > 0 && (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "4px",
                    fontSize: "11px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={hCell}>Tax Rate</th>
                      <th style={hCell}>Taxable Amt.</th>
                      {isInterState ? (
                        <th style={hCell}>IGST Amt.</th>
                      ) : (
                        <>
                          <th style={hCell}>CGST Amt.</th>
                          <th style={hCell}>SGST Amt.</th>
                        </>
                      )}
                      <th style={hCell}>Total Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxSummaryRows.map(([rate, row]) => (
                      <tr key={rate}>
                        <td style={{ ...cell, textAlign: "center", fontSize: "11px" }}>{rate}%</td>
                        <td style={{ ...cell, textAlign: "right", fontSize: "11px" }}>{fmt(row.taxable)}</td>
                        {isInterState ? (
                          <td style={{ ...cell, textAlign: "right", fontSize: "11px" }}>{fmt(row.igst)}</td>
                        ) : (
                          <>
                            <td style={{ ...cell, textAlign: "right", fontSize: "11px" }}>{fmt(row.cgst)}</td>
                            <td style={{ ...cell, textAlign: "right", fontSize: "11px" }}>{fmt(row.sgst)}</td>
                          </>
                        )}
                        <td style={{ ...cell, textAlign: "right", fontSize: "11px" }}>
                          {fmt(row.cgst + row.sgst + row.igst)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#000" }}>
                Rupees {numberToIndianWords(grandTotal)}
              </div>
            </div>
            <div style={{ width: "40%" }}>
              <div style={{ display: "flex", borderBottom: b }}>
                <div style={totLabel}>Sub Total</div>
                <div style={totVal}>{fmt(taxableAmount || lineTaxableTotal)}</div>
              </div>
              {discount > 0 && (
                <div style={{ display: "flex", borderBottom: b }}>
                  <div style={totLabel}>Less: Discount</div>
                  <div style={totVal}>{fmt(discount)}</div>
                </div>
              )}
              {/* Always show GST breakdown after Sub Total */}
              <div style={{ display: "flex", borderBottom: b }}>
                <div style={totLabel}>GST Amount</div>
                <div style={totVal}>{fmt(gstAmountDisplay)}</div>
              </div>
              {isInterState ? (
                <div style={{ display: "flex", borderBottom: b }}>
                  <div style={totLabel}>
                    Add: IGST{igstRate > 0 ? ` @ ${igstRate.toFixed(2)}%` : ""}
                  </div>
                  <div style={totVal}>{fmt(isNoGst ? 0 : igstAmount)}</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", borderBottom: b }}>
                    <div style={totLabel}>
                      Add: CGST{cgstRate > 0 ? ` @ ${cgstRate.toFixed(2)}%` : ""}
                    </div>
                    <div style={totVal}>{fmt(isNoGst ? 0 : cgstAmount)}</div>
                  </div>
                  <div style={{ display: "flex", borderBottom: b }}>
                    <div style={totLabel}>
                      Add: SGST{sgstRate > 0 ? ` @ ${sgstRate.toFixed(2)}%` : ""}
                    </div>
                    <div style={totVal}>{fmt(isNoGst ? 0 : sgstAmount)}</div>
                  </div>
                </>
              )}
              {Math.abs(roundOff) >= 0.005 && (
                <div style={{ display: "flex", borderBottom: b }}>
                  <div style={totLabel}>
                    {roundOff >= 0 ? "Add" : "Less"}: Rounded Off
                  </div>
                  <div style={totVal}>{fmt(Math.abs(roundOff))}</div>
                </div>
              )}
              <div style={{ display: "flex", backgroundColor: "#e8e8e8" }}>
                <div
                  style={{
                    ...totLabel,
                    fontSize: "14px",
                    fontWeight: 800,
                    padding: "7px",
                  }}
                >
                  Grand Total
                </div>
                <div
                  style={{
                    ...totVal,
                    fontSize: "15px",
                    fontWeight: 800,
                    padding: "7px",
                  }}
                >
                  ₹ {fmt(grandTotal)}
                </div>
              </div>
            </div>
          </div>

          {/* Bank details — bold */}
          {showBankDetails && (bankName || bankAc || bankIfsc) && (
            <div
              style={{
                borderTop: b,
                padding: "6px 9px",
                fontSize: "12px",
                fontWeight: 800,
                color: "#000",
                backgroundColor: "#f5f5f5",
                letterSpacing: "0.2px",
              }}
            >
              <b>Bank Account Details: </b>
              {bankHolder ? `${bankHolder.toUpperCase()} | ` : ""}
              {bankName ? `${bankName.toUpperCase()} ` : ""}
              {bankAc ? `A/C NO : ${bankAc}` : ""}
              {bankIfsc ? ` || IFSC CODE : ${bankIfsc}` : ""}
            </div>
          )}

          {/* Terms / Stamp / Sign — terms bold */}
          <div style={{ display: "flex", borderTop: b, minHeight: "96px" }}>
            <div
              style={{
                flex: 1.2,
                borderRight: b,
                padding: "7px 9px",
                fontSize: "11px",
                fontWeight: 700,
                color: "#000",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  textDecoration: "underline",
                  marginBottom: "4px",
                  fontSize: "12px",
                }}
              >
                Terms &amp; Conditions
              </div>
              {terms.map((t, i) => (
                <div key={i} style={{ marginBottom: "2px", fontWeight: 700 }}>
                  {i + 1}. {t}
                </div>
              ))}
            </div>
            <div
              style={{
                width: "26%",
                borderRight: b,
                padding: "6px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {stampImageBase64 ? (
                <img
                  src={stampImageBase64}
                  alt=""
                  style={{ width: stampW, maxHeight: stampH, objectFit: "contain" }}
                />
              ) : (
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#000", marginTop: "16px" }}>
                  Company Seal
                </div>
              )}
            </div>
            <div
              style={{
                width: "30%",
                padding: "7px 9px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                minHeight: "96px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "12px", color: "#000" }}>For {businessName}</div>
              <div style={{ flex: 1, minHeight: "44px" }} aria-hidden="true" />
              <div style={{ fontWeight: 800, fontSize: "12px", color: "#000" }}>Authorised Signatory</div>
            </div>
          </div>

          {/* Declaration — bold */}
          <div
            style={{
              borderTop: b,
              padding: "5px 9px",
              fontSize: "10px",
              lineHeight: 1.4,
              fontWeight: 700,
              color: "#000",
            }}
          >
            {declaration}
            {!isNoGst && gstAmountDisplay > 0 ? ` | Total Tax: ₹ ${fmt(gstAmountDisplay)}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
};
