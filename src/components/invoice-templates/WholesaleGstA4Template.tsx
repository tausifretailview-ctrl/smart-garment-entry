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
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy");
};

/**
 * Wholesale GST A4 — B2B tax invoice with per-rate CGST/SGST rows.
 * Settings-driven logo / bank / UPI / terms. No third-party watermark.
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

  const titleText =
    grandTotal < 0 ? "CREDIT NOTE" : documentTitle?.trim() || "TAX INVOICE";

  const stampW = stampSize === "small" ? "72px" : stampSize === "large" ? "120px" : "96px";

  const b = "1px solid #222";
  const cell: React.CSSProperties = {
    border: b,
    padding: "4px 5px",
    fontSize: "10px",
    verticalAlign: "top",
    lineHeight: 1.35,
    color: "#111",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    textAlign: "center",
    backgroundColor: "#f3f4f6",
    fontSize: "9.5px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };

  return (
    <div
      className="wholesale-gst-a4-invoice-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "11px",
        color: "#111",
        background: "#fff",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .wholesale-gst-a4-invoice-root {
            width: 194mm !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .wholesale-gst-a4-footer {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .wholesale-gst-a4-invoice-root,
          .wholesale-gst-a4-invoice-root * {
            color: #111 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
        <div style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "0.8px" }}>{titleText}</div>
        <div style={{ fontSize: "9px", fontWeight: 600, color: "#444" }}>ORIGINAL FOR RECIPIENT</div>
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "8px" }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{ width: "72px", height: "72px", objectFit: "contain", flexShrink: 0 }}
          />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "18px", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.15 }}>
            {businessName}
          </div>
          {gstNumber ? (
            <div style={{ marginTop: "2px", fontWeight: 700 }}>GSTIN: {gstNumber}</div>
          ) : null}
          {address ? (
            <div style={{ marginTop: "2px", whiteSpace: "pre-line", lineHeight: 1.35 }}>{address}</div>
          ) : null}
          <div style={{ marginTop: "2px" }}>
            {mobile ? <span>Mobile: {mobile}</span> : null}
            {mobile && email ? <span> &nbsp;|&nbsp; </span> : null}
            {email ? <span>Email: {email}</span> : null}
          </div>
        </div>
        <table style={{ borderCollapse: "collapse", width: "58mm", flexShrink: 0 }}>
          <tbody>
            {[
              ["Invoice #", invoiceNumber || "—"],
              ["Invoice Date", formatInvoiceDate(invoiceDate)],
              ["Place of Supply", placeOfSupply],
              ["Due Date", formatInvoiceDate(dueDate)],
            ].map(([label, value]) => (
              <tr key={label}>
                <td style={{ ...cell, fontWeight: 700, width: "48%", background: "#f8f8f8" }}>{label}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: b, padding: "7px 8px", marginBottom: "8px" }}>
        <div style={{ fontWeight: 800, fontSize: "10px", marginBottom: "3px", textTransform: "uppercase" }}>
          Customer Details
        </div>
        <div style={{ fontWeight: 800, fontSize: "13px" }}>{customerName || "Walk-in Customer"}</div>
        {customerGSTIN ? <div style={{ marginTop: "2px" }}>GSTIN: {customerGSTIN}</div> : null}
        {customerAddress ? (
          <div style={{ marginTop: "2px" }}>
            <span style={{ fontWeight: 700 }}>Billing Address: </span>
            <span style={{ whiteSpace: "pre-line" }}>{customerAddress}</span>
          </div>
        ) : null}
        {customerMobile ? <div style={{ marginTop: "2px" }}>Ph: {customerMobile}</div> : null}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "22px" }} />
          <col />
          {showHSN ? <col style={{ width: "58px" }} /> : null}
          <col style={{ width: "62px" }} />
          <col style={{ width: "36px" }} />
          <col style={{ width: "78px" }} />
          <col style={{ width: "88px" }} />
          <col style={{ width: "78px" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={hCell}>#</th>
            <th style={{ ...hCell, textAlign: "left" }}>Item</th>
            {showHSN ? <th style={hCell}>HSN/SAC</th> : null}
            <th style={hCell}>Rate/Item</th>
            <th style={hCell}>Qty</th>
            <th style={hCell}>Taxable Value</th>
            <th style={hCell}>Tax Amount</th>
            <th style={hCell}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const line = lines[index];
            const taxLabel =
              line.gstPercent > 0 ? `${fmt(line.gst)} (${line.gstPercent}%)` : fmt(0);
            return (
              <tr key={`${item.sr}-${index}`}>
                <td style={{ ...cell, textAlign: "center" }}>{index + 1}</td>
                <td style={cell}>
                  <div style={{ fontWeight: 700 }}>{item.particulars}</div>
                  {(item.size || item.color) && (
                    <div style={{ fontSize: "9px", color: "#333" }}>
                      {[item.color, item.size].filter(Boolean).join(" / ")}
                    </div>
                  )}
                </td>
                {showHSN ? (
                  <td style={{ ...cell, textAlign: "center" }}>{dash(item.hsn) || "—"}</td>
                ) : null}
                <td style={{ ...cell, textAlign: "right" }}>{fmt(line.unitRate)}</td>
                <td style={{ ...cell, textAlign: "right" }}>
                  {item.qty}
                  {item.uom ? ` ${item.uom}` : ""}
                </td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(line.taxable)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{taxLabel}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{fmt(line.amount)}</td>
              </tr>
            );
          })}
          <tr>
            <td
              colSpan={showHSN ? 8 : 7}
              style={{ ...cell, fontWeight: 700, background: "#f8f8f8" }}
            >
              Total Items / Qty : {items.length} / {totalQty}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <table style={{ borderCollapse: "collapse", width: "78mm" }}>
          <tbody>
            <tr>
              <td style={{ ...cell, fontWeight: 600 }}>Taxable Amount</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>₹{fmt(taxableTotal)}</td>
            </tr>
            {slabs.length === 0 ? (
              <tr>
                <td style={cell}>Tax</td>
                <td style={{ ...cell, textAlign: "right" }}>₹{fmt(0)}</td>
              </tr>
            ) : isInterState ? (
              slabs.map((slab) => (
                <tr key={`igst-${slab.gstPercent}`}>
                  <td style={cell}>IGST {slab.gstPercent}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>₹{fmt(slab.igst)}</td>
                </tr>
              ))
            ) : (
              slabs.flatMap((slab) => [
                <tr key={`cgst-${slab.gstPercent}`}>
                  <td style={cell}>CGST {formatGstHalfRateLabel(slab.gstPercent)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>₹{fmt(slab.cgst)}</td>
                </tr>,
                <tr key={`sgst-${slab.gstPercent}`}>
                  <td style={cell}>SGST {formatGstHalfRateLabel(slab.gstPercent)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>₹{fmt(slab.sgst)}</td>
                </tr>,
              ])
            )}
            {Math.abs(Number(roundOff) || 0) >= 0.005 ? (
              <tr>
                <td style={cell}>Round Off</td>
                <td style={{ ...cell, textAlign: "right" }}>
                  {roundOff < 0 ? "−" : ""}
                  {fmt(Math.abs(roundOff))}
                </td>
              </tr>
            ) : null}
            <tr>
              <td
                style={{
                  ...cell,
                  fontWeight: 800,
                  fontSize: "12px",
                  background: "#111",
                  color: "#fff",
                }}
              >
                Total
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: "right",
                  fontWeight: 800,
                  fontSize: "12px",
                  background: "#111",
                  color: "#fff",
                }}
              >
                ₹{fmt(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "8px", fontSize: "11px" }}>
        <strong>Total amount (in words):</strong> {numberToWords(grandTotal)}
      </div>
      <div
        style={{
          marginTop: "6px",
          padding: "6px 8px",
          border: b,
          background: "#f3f4f6",
          fontWeight: 800,
          fontSize: "13px",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        Amount Payable: ₹{fmt(grandTotal)}
      </div>

      <div className="wholesale-gst-a4-footer" style={{ marginTop: "auto", paddingTop: "12px" }}>
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "stretch",
          minHeight: "110px",
        }}
      >
        <div style={{ flex: 1.2, border: b, padding: "7px 8px", fontSize: "10px" }}>
          <div style={{ fontWeight: 800, marginBottom: "4px" }}>Bank Details</div>
          {hasBank ? (
            <>
              {bankName ? <div>Bank: {bankName}</div> : null}
              {bankHolder ? <div>Account Holder: {bankHolder}</div> : null}
              {bankAc ? <div>Account #: {bankAc}</div> : null}
              {bankIfsc ? <div>IFSC Code: {bankIfsc}</div> : null}
              {bankBranch ? <div>Branch: {bankBranch}</div> : null}
            </>
          ) : (
            <div style={{ color: "#666" }}>Add bank details in Settings → Sale</div>
          )}
        </div>
        <div
          style={{
            width: "34mm",
            border: b,
            padding: "6px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: "88px", height: "88px" }} />
          ) : (
            <div style={{ fontSize: "9px", color: "#666" }}>UPI QR</div>
          )}
          {upiId ? (
            <div style={{ fontSize: "8px", marginTop: "3px", wordBreak: "break-all" }}>{upiId}</div>
          ) : (
            <div style={{ fontSize: "8px", marginTop: "3px" }}>Pay using UPI</div>
          )}
        </div>
        <div
          style={{
            width: "48mm",
            border: b,
            padding: "7px 8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "10px" }}>For {businessName}</div>
          <div style={{ flex: 1, minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {stampImageBase64 ? (
              <img
                src={stampImageBase64}
                alt=""
                style={{ width: stampW, maxHeight: "56px", objectFit: "contain" }}
              />
            ) : null}
          </div>
          <div style={{ fontWeight: 700, fontSize: "10px" }}>Authorized Signatory</div>
        </div>
      </div>

      <div style={{ marginTop: "8px", borderTop: b, paddingTop: "6px", fontSize: "10px" }}>
        Receiver&apos;s Signature ________________________________
      </div>

      <div style={{ marginTop: "10px" }}>
        <div style={{ fontWeight: 800, fontSize: "10px", marginBottom: "3px" }}>Terms and Conditions</div>
        <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "9.5px", lineHeight: 1.4 }}>
          {terms.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </div>

      {customFooterText?.trim() ? (
        <div style={{ marginTop: "10px", fontSize: "8px", color: "#555", textAlign: "center" }}>
          {customFooterText.trim()}
        </div>
      ) : (
        <div style={{ marginTop: "10px", fontSize: "8px", color: "#555", textAlign: "center" }}>
          This is a computer generated invoice.
        </div>
      )}
      </div>
    </div>
  );
};
