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

/**
 * Klear A4 — footwear wholesale tax invoice with size-column pivot.
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

  const b = "1px solid #222";
  const cell: React.CSSProperties = {
    border: b,
    padding: "4px 4px",
    fontSize: "10px",
    verticalAlign: "middle",
    color: "#111",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    textAlign: "center",
    backgroundColor: "#f3f4f6",
    fontSize: "10px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const metaCell: React.CSSProperties = {
    border: b,
    padding: "6px 8px",
    fontSize: "12px",
    verticalAlign: "middle",
    color: "#111",
    lineHeight: 1.3,
  };

  const productLabel = (row: { productName: string; color: string }) => {
    const color = row.color.trim();
    if (!color) return row.productName;
    return row.productName.toUpperCase().includes(color.toUpperCase())
      ? row.productName
      : `${row.productName} ${color}`;
  };

  return (
    <div
      className="klear-a4-invoice-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
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
          .klear-a4-invoice-root {
            width: 194mm !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .klear-a4-page-frame {
            min-height: auto !important;
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
          border: "2px solid #111",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "2px solid #111",
          background: "#f3f4f6",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.4px" }}>Tax Invoice</div>
        <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.4px" }}>Credit Memo</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          padding: "10px 12px",
          borderBottom: b,
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: "72px", height: "72px", objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              lineHeight: 1.15,
            }}
          >
            {businessName}
          </div>
          {address ? (
            <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, whiteSpace: "pre-line", lineHeight: 1.4 }}>
              {address}
            </div>
          ) : null}
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 700, lineHeight: 1.45 }}>
            {mobile ? <span>Mob.: {mobile}</span> : null}
            {gstNumber ? <span>{mobile ? "  |  " : ""}GSTIN: {gstNumber}</span> : null}
            {email ? (
              <span>
                {mobile || gstNumber ? "  |  " : ""}Email: {email}
              </span>
            ) : null}
          </div>
        </div>
        <table style={{ borderCollapse: "collapse", width: "64mm", flexShrink: 0 }}>
          <tbody>
            {[
              ["Bill No", invoiceNumber || "—"],
              ["Date", formatInvoiceDate(invoiceDate)],
              ["Transport", customerTransportDetails?.trim() || "—"],
              ["LR. No.", "—"],
              ["LR. Date", "—"],
              ["No. of Cartons", "—"],
            ].map(([label, value]) => (
              <tr key={label}>
                <td style={{ ...metaCell, fontWeight: 700, width: "46%", background: "#f3f4f6" }}>{label}</td>
                <td style={{ ...metaCell, fontWeight: 700 }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ borderBottom: b }}>
        <div
          style={{
            background: "#f3f4f6",
            padding: "6px 12px",
            fontWeight: 800,
            fontSize: "12px",
            letterSpacing: "0.8px",
            textTransform: "uppercase",
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          Billed To
        </div>
        <div style={{ padding: "8px 12px", fontSize: "13px", lineHeight: 1.45 }}>
          <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "3px" }}>
            {customerName || "Walk-in Customer"}
          </div>
          {customerGSTIN ? <div style={{ fontWeight: 700 }}>GSTIN: {customerGSTIN}</div> : null}
          {customerAddress ? <div style={{ whiteSpace: "pre-line" }}>Add.: {customerAddress}</div> : null}
          <div>State: {placeOfSupply}</div>
          {customerMobile ? <div>Mob.: {customerMobile}</div> : null}
        </div>
      </div>

      <div style={{ padding: "8px 12px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: "0" }}>
        <colgroup>
          <col style={{ width: "16%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "8%" }} />
          {columns.map((sz) => (
            <col key={sz} style={{ width: `${Math.max(3.2, 30 / Math.max(columns.length, 1))}%` }} />
          ))}
          <col style={{ width: "6%" }} />
          <col style={{ width: "5.5%" }} />
          <col style={{ width: "8.5%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...hCell, textAlign: "left" }}>Product Name</th>
            <th style={hCell}>HSN</th>
            <th style={hCell}>GST%</th>
            <th style={hCell}>MRP</th>
            {columns.map((sz) => (
              <th key={sz} style={hCell}>
                {sz}
              </th>
            ))}
            <th style={hCell}>Total Pairs</th>
            <th style={hCell}>Disc %</th>
            <th style={hCell}>Net Rate</th>
            <th style={hCell}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((row) => (
            <tr key={row.key}>
              <td style={{ ...cell, fontWeight: 700 }}>{productLabel(row)}</td>
              <td style={{ ...cell, textAlign: "center", fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "-0.2px" }}>
                {row.hsn || "—"}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{row.gstPercent ? `${row.gstPercent}%` : "—"}</td>
              <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{row.mrp ? fmt(row.mrp) : "—"}</td>
              {columns.map((sz) => {
                const qty = row.qtyBySize[sz] || 0;
                return (
                  <td key={sz} style={{ ...cell, textAlign: "center", fontWeight: qty ? 700 : 400 }}>
                    {qty || ""}
                  </td>
                );
              })}
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{row.totalPairs}</td>
              <td style={{ ...cell, textAlign: "center" }}>
                {row.discountPercent ? `${roundInvoiceMoney(row.discountPercent)}%` : ""}
              </td>
              <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.netRate)}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(row.amount)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 800 }} colSpan={4}>
              Total
            </td>
            {columns.map((sz) => (
              <td key={sz} style={{ ...cell, textAlign: "center", fontWeight: 800 }}>
                {pivot.columnQtyTotals[sz] || ""}
              </td>
            ))}
            <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{pivot.totalPairs}</td>
            <td style={cell} />
            <td style={cell} />
            <td style={{ ...cell, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{fmt(pivot.totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <table style={{ borderCollapse: "collapse", width: "72mm" }}>
          <tbody>
            {splDiscount > 0.005 ? (
              <tr>
                <td style={{ ...cell, fontWeight: 600 }}>SPL DISCOUNT</td>
                <td style={{ ...cell, textAlign: "right" }}>₹{fmt(splDiscount)}</td>
              </tr>
            ) : null}
            {!isNoGst && isInterState ? (
              <tr>
                <td style={cell}>IGST</td>
                <td style={{ ...cell, textAlign: "right" }}>₹{fmt(igstAmount)}</td>
              </tr>
            ) : !isNoGst ? (
              <>
                <tr>
                  <td style={cell}>CGST</td>
                  <td style={{ ...cell, textAlign: "right" }}>₹{fmt(cgstAmount)}</td>
                </tr>
                <tr>
                  <td style={cell}>SGST</td>
                  <td style={{ ...cell, textAlign: "right" }}>₹{fmt(sgstAmount)}</td>
                </tr>
              </>
            ) : null}
            {Math.abs(Number(roundOff) || 0) >= 0.005 ? (
              <tr>
                <td style={cell}>ROUND OFF</td>
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
                  background: "#111",
                  color: "#fff",
                }}
              >
                Bill Amount
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: "right",
                  fontWeight: 800,
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
        <strong>Amount in words:</strong> {numberToWords(grandTotal)}
      </div>

      <div className="klear-a4-footer" style={{ marginTop: "auto", paddingTop: "12px" }}>
        <div style={{ display: "flex", gap: "10px", minHeight: "110px" }}>
          <div style={{ flex: 1.2, border: b, padding: "7px 8px", fontSize: "10px" }}>
            <div style={{ fontWeight: 800, marginBottom: "4px" }}>Bank Details</div>
            {hasBank ? (
              <>
                {bankName ? <div>BANK NAME: {bankName}</div> : null}
                {bankAc ? <div>A/C NO.: {bankAc}</div> : null}
                {bankBranch ? <div>BRANCH: {bankBranch}</div> : null}
                {bankIfsc ? <div>IFSC CODE: {bankIfsc}</div> : null}
                {bankHolder ? <div>Account Holder: {bankHolder}</div> : null}
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
                <img src={stampImageBase64} alt="" style={{ width: stampW, maxHeight: "56px", objectFit: "contain" }} />
              ) : null}
            </div>
            <div style={{ fontWeight: 700, fontSize: "10px" }}>(Authorised Signatory)</div>
          </div>
        </div>
        <div style={{ marginTop: "8px", fontSize: "10px" }}>
          Buyer&apos;s Signature ________________________________
        </div>
        <div style={{ marginTop: "8px" }}>
          <div style={{ fontWeight: 800, fontSize: "10px", marginBottom: "3px" }}>Terms &amp; Condition</div>
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
      </div>
    </div>
  );
};
