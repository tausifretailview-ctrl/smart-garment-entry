import React from "react";
import {
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
}

export interface GiftTallyInvoiceTemplateProps {
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
  customHeaderText?: string;
  documentTitle?: string;
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
  showHSN?: boolean;
  showBankDetails?: boolean;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  [key: string]: unknown;
}

const DEFAULT_GIFT_TERMS = [
  "GOODS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED.",
  "SELLER IS NOT RESPONSIBLE FOR ANY LOSS OR DAMAGE OF GOODS IN TRANSIT",
  "BUYER UNDERTAKES TO SUBMIT PRESCRIBED ST DECLARATION TO SENDER ON DEMAND.",
  "DISPUTE IF ANY WILL BE SUBJECT TO SELLER COURT JURISDICTION.",
  "PAYMENT 50% ADVANCE AND REST AGAINST EACH DELIVERY OR AS PER FINAL TERM.",
  "BY PAYEE A/C CHEQUE/DRAFT/NEFT ONLY.",
];

const DEFAULT_GST_DECLARATION =
  "I/We certify that our registration certificate under the GST Act is in force on the date on which supply of goods specified in the invoice is made by me/us and the transaction of supply covered under this invoice has been effected by me/us in the regular course of my/our business.";

const MIN_ITEM_ROWS = 6;

const dash = (value?: string | null) => (value && String(value).trim() ? value : "—");

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

const fmt = (amount: number): string =>
  amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const getStateFromGSTIN = (gstin?: string): { name: string; code: string } => {
  if (!gstin || gstin.length < 2) return { name: "", code: "" };
  const m: Record<string, string> = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh",
  };
  const code = gstin.substring(0, 2);
  return { name: m[code] || "", code };
};

const extractCityFromAddress = (addr?: string): string => {
  if (!addr?.trim()) return "";
  const parts = addr.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1];
  const pinMatch = last.match(/\b(\d{6})\b/);
  if (pinMatch && parts.length > 1) {
    return parts[parts.length - 2].replace(/\d{6}/g, "").trim() || parts[parts.length - 2];
  }
  return last.replace(/\b\d{6}\b/g, "").trim() || last;
};

export const GiftTallyInvoiceTemplate: React.FC<GiftTallyInvoiceTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  customHeaderText,
  documentTitle,
  taxType: taxTypeProp = "inclusive",
  items,
  subtotal,
  discount,
  taxableAmount: taxableAmountProp,
  cgstAmount: cgstAmountProp = 0,
  sgstAmount: sgstAmountProp = 0,
  igstAmount: igstAmountProp = 0,
  totalTax: totalTaxProp,
  roundOff,
  grandTotal,
  declarationText,
  termsConditions,
  bankDetails,
  showHSN = true,
  showBankDetails = true,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const sellerState = getStateFromGSTIN(gstNumber);
  const buyerState = getStateFromGSTIN(customerGSTIN);
  const isInterState =
    !!gstNumber && !!customerGSTIN && gstNumber.substring(0, 2) !== customerGSTIN.substring(0, 2);
  const placeOfSupply = buyerState.name || sellerState.name || "—";
  const jurisdictionCity = extractCityFromAddress(address) || sellerState.name || "Local";

  const normBank = bankDetails
    ? {
        bankName: bankDetails.bankName || bankDetails.bank_name || "",
        accountNumber: bankDetails.accountNumber || bankDetails.account_number || "",
        ifscCode: bankDetails.ifscCode || bankDetails.ifsc_code || "",
        accountHolder: bankDetails.accountHolder || bankDetails.account_holder || "",
        branch: bankDetails.branch || "",
      }
    : null;

  const panFromGst = gstNumber && gstNumber.length >= 12 ? gstNumber.substring(2, 12) : "";

  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let computedTaxable = 0;
  let totalQty = 0;

  const lineRows = items.map((item, index) => {
    const gstPct = item.gstPercent || 0;
    const { taxable, gst: gstAmt } = splitLineGstFromTotal(item.total, gstPct);
    const safeQty = item.qty > 0 ? item.qty : 1;
    const taxableRate = taxable / safeQty;
    computedTaxable += taxable;
    totalQty += item.qty;
    if (isInterState) {
      totalIgst += gstAmt;
    } else {
      totalCgst += gstAmt / 2;
      totalSgst += gstAmt / 2;
    }
    return {
      index: index + 1,
      item,
      taxable,
      taxableRate,
      gstPct,
      gstAmt,
    };
  });

  const taxableAmount = computedTaxable > 0 ? computedTaxable : taxableAmountProp;
  const totalCgstFinal = totalCgst > 0 ? totalCgst : cgstAmountProp;
  const totalSgstFinal = totalSgst > 0 ? totalSgst : sgstAmountProp;
  const totalIgstFinal = totalIgst > 0 ? totalIgst : igstAmountProp;
  const totalGstAmount =
    totalTaxProp > 0
      ? totalTaxProp
      : totalCgstFinal + totalSgstFinal + totalIgstFinal;
  const lineTaxableTotal = lineRows.reduce((s, r) => s + r.taxable, 0);

  const terms =
    termsConditions && termsConditions.filter((t) => t?.trim()).length > 0
      ? termsConditions.filter((t) => t?.trim())
      : DEFAULT_GIFT_TERMS;

  const shippingAddress = customerAddress;
  const tagline = customHeaderText?.trim() || documentTitle?.trim() || "";
  const gstDeclaration = declarationText?.trim() || DEFAULT_GST_DECLARATION;
  const supplyDateTime = [
    formatDate(invoiceDate),
    invoiceTime?.trim() || null,
  ].filter(Boolean).join("  ");

  // TODO: add field to sales table — challan_number, challan_date, po_number, po_date, vehicle_number, reverse_charge
  const challanNumber = "";
  const challanDate = "";
  const poNumber = "";
  const poDate = "";
  const vehicleNumber = "";
  const reverseCharge = "N";
  const modeOfTransport = customerTransportDetails?.trim() || "";

  const blankRows = Math.max(0, MIN_ITEM_ROWS - lineRows.length);
  const titleText = grandTotal < 0 ? "CREDIT NOTE" : "TAX INVOICE";

  const b = "1px solid #000";
  const cell: React.CSSProperties = {
    border: b,
    padding: "3px 4px",
    fontSize: "10px",
    lineHeight: "1.3",
    verticalAlign: "top",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "#f0f0f0",
    fontSize: "10px",
    padding: "4px 4px",
  };
  const labelCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    backgroundColor: "#fafafa",
    fontSize: "11px",
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="gift-tally-invoice-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        height: "auto",
        padding: "5mm",
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
          @page { size: A4 portrait; margin: 5mm; }
          body { margin: 0; padding: 0; }
          .gift-tally-invoice-root {
            width: 200mm !important;
            min-height: auto !important;
            height: auto !important;
            padding: 0 !important;
            page-break-inside: avoid;
          }
          .gift-tally-footer-block { page-break-inside: avoid; }
          .gift-tally-page-break { page-break-before: always; }
        }
      `}</style>

      <div style={{ border: b, flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Title — TAX INVOICE centered, ORIGINAL right */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            borderBottom: b,
            padding: "8px 10px",
            backgroundColor: "#f8f8f8",
          }}
        >
          <div />
          <div
            style={{
              fontWeight: "bold",
              fontSize: "18px",
              letterSpacing: "1px",
              textAlign: "center",
              textTransform: "uppercase",
            }}
          >
            {titleText}
          </div>
          <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "12px" }}>ORIGINAL</div>
        </div>

        {/* Seller — logo left, company details centered */}
        <div style={{ borderBottom: b, padding: "8px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          {logoUrl ? (
            <div style={{ width: "58px", flexShrink: 0 }}>
              <img
                src={logoUrl}
                alt=""
                style={{ width: "58px", height: "58px", objectFit: "contain", display: "block" }}
              />
            </div>
          ) : null}
          <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", lineHeight: 1.2 }}>
              {businessName}
            </div>
            {tagline && (
              <div style={{ fontSize: "12px", fontStyle: "italic", marginTop: "2px" }}>{tagline}</div>
            )}
            <div style={{ fontSize: "12px", whiteSpace: "pre-line", marginTop: "4px", lineHeight: 1.3 }}>
              {address}
            </div>
            <div style={{ fontSize: "12px", marginTop: "3px" }}>
              {mobile && <span>Tel: {mobile}</span>}
              {mobile && email && <span> &nbsp;|&nbsp; </span>}
              {email && <span>E-Mail: {email}</span>}
            </div>
            <div style={{ fontSize: "12px", marginTop: "3px", fontWeight: "bold" }}>
              GSTIN/Unique ID: {dash(gstNumber)}
            </div>
            {sellerState.code && (
              <div style={{ fontSize: "12px", marginTop: "2px" }}>
                State: {sellerState.name} &nbsp;|&nbsp; State Code: {sellerState.code}
              </div>
            )}
          </div>
          {logoUrl ? <div style={{ width: "58px", flexShrink: 0 }} aria-hidden="true" /> : null}
        </div>

        {/* Billed / Shipped */}
        <div style={{ display: "flex", borderBottom: b }}>
          <div style={{ flex: 1, borderRight: b, padding: "8px 10px" }}>
            <div style={{ fontWeight: "bold", fontSize: "12px", marginBottom: "5px", textDecoration: "underline" }}>
              Name &amp; Address of Receiver (Billed To)
            </div>
            <div style={{ fontWeight: "bold", fontSize: "13px" }}>{customerName || "Walk-in Customer"}</div>
            {customerAddress && (
              <div style={{ fontSize: "12px", whiteSpace: "pre-line", marginTop: "3px", lineHeight: 1.35 }}>
                {customerAddress}
              </div>
            )}
            <div style={{ fontSize: "12px", marginTop: "4px" }}>GSTIN/Unique ID: {dash(customerGSTIN)}</div>
            {buyerState.code && (
              <div style={{ fontSize: "12px" }}>State Code: {buyerState.code}</div>
            )}
            {customerMobile && <div style={{ fontSize: "12px" }}>Tel: {customerMobile}</div>}
          </div>
          <div style={{ flex: 1, padding: "8px 10px" }}>
            <div style={{ fontWeight: "bold", fontSize: "12px", marginBottom: "5px", textDecoration: "underline" }}>
              Name &amp; Address of Consignee (Shipped To)
            </div>
            <div style={{ fontWeight: "bold", fontSize: "13px" }}>{customerName || "Walk-in Customer"}</div>
            {shippingAddress ? (
              <div style={{ fontSize: "12px", whiteSpace: "pre-line", marginTop: "3px", lineHeight: 1.35 }}>
                {shippingAddress}
              </div>
            ) : (
              <div style={{ fontSize: "12px", marginTop: "3px" }}>—</div>
            )}
            <div style={{ fontSize: "12px", marginTop: "4px" }}>GSTIN/Unique ID: {dash(customerGSTIN)}</div>
            {buyerState.code && (
              <div style={{ fontSize: "12px" }}>State Code: {buyerState.code}</div>
            )}
          </div>
        </div>

        {/* Invoice meta */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: b }}>
          <tbody>
            <tr>
              <td style={labelCell}>Invoice No:</td>
              <td style={cell}>{invoiceNumber}</td>
              <td style={labelCell}>Invoice Date:</td>
              <td style={cell}>{formatDate(invoiceDate)}</td>
              <td style={labelCell}>Place of Supply:</td>
              <td style={cell}>{placeOfSupply}</td>
            </tr>
            <tr>
              <td style={labelCell}>Challan No:</td>
              <td style={cell}>{dash(challanNumber)}</td>
              <td style={labelCell}>Challan Date:</td>
              <td style={cell}>{dash(challanDate)}</td>
              <td style={labelCell}>Reverse Charge (Y/N):</td>
              <td style={cell}>{reverseCharge}</td>
            </tr>
            <tr>
              <td style={labelCell}>PO No:</td>
              <td style={cell}>{dash(poNumber)}</td>
              <td style={labelCell}>PO Date:</td>
              <td style={cell}>{dash(poDate)}</td>
              <td style={labelCell}>Mode of Transport:</td>
              <td style={cell}>{dash(modeOfTransport)}</td>
            </tr>
            <tr>
              <td style={labelCell}>Veh. No:</td>
              <td style={cell}>{dash(vehicleNumber)}</td>
              <td style={labelCell}>Date &amp; Time of Supply:</td>
              <td style={cell} colSpan={3}>{supplyDateTime || "—"}</td>
            </tr>
          </tbody>
        </table>

        {/* Line items */}
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...hCell, width: "22px", padding: "3px 2px" }}>Sr</th>
                <th style={{ ...hCell, textAlign: "left" }}>Description of Goods</th>
                {showHSN && <th style={{ ...hCell, width: "58px" }}>HSN Code</th>}
                <th style={{ ...hCell, width: "40px" }}>QTY.</th>
                <th style={{ ...hCell, width: "58px" }}>RATE<br />Rs. P.</th>
                <th style={{ ...hCell, width: "44px" }}>GST<br />%</th>
                <th style={{ ...hCell, width: "72px" }}>AMOUNT<br />(Excl. GST)</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((row) => (
                <tr key={row.index}>
                  <td style={{ ...cell, textAlign: "center", fontWeight: "bold", padding: "3px 2px" }}>{row.index}</td>
                  <td style={cell}>
                    <div style={{ fontWeight: "bold", fontSize: "11px" }}>{row.item.particulars}</div>
                  </td>
                  {showHSN && <td style={{ ...cell, textAlign: "center" }}>{row.item.hsn || "—"}</td>}
                  <td style={{ ...cell, textAlign: "center", fontWeight: "bold" }}>{row.item.qty}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmt(row.taxableRate)}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{row.gstPct > 0 ? `${row.gstPct}%` : "—"}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(row.taxable)}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`blank-${i}`} style={{ height: "14px" }}>
                  <td style={cell}>&nbsp;</td>
                  <td style={cell} />
                  {showHSN && <td style={cell} />}
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                </tr>
              ))}
              <tr style={{ backgroundColor: "#f0f0f0", fontWeight: "bold" }}>
                <td colSpan={showHSN ? 3 : 2} style={{ ...cell, textAlign: "right" }}>Total</td>
                <td style={{ ...cell, textAlign: "center" }}>{totalQty}</td>
                <td style={cell} />
                <td style={cell} />
                <td style={{ ...cell, textAlign: "right" }}>{fmt(lineTaxableTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={`gift-tally-footer-block${items.length > 20 ? " gift-tally-page-break" : ""}`}>
          {/* Amount in words + GST summary | totals */}
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "8px 10px", fontSize: "12px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>Invoice Total (In Words):</div>
              <div style={{ textTransform: "capitalize", lineHeight: 1.4, marginBottom: "8px" }}>
                INR {numberToIndianWords(grandTotal)}
              </div>
              <div style={{ fontWeight: "bold", marginBottom: "4px", textDecoration: "underline" }}>
                GST Summary
              </div>
              {totalIgstFinal > 0 ? (
                <div>IGST: {fmt(totalIgstFinal)}</div>
              ) : (
                <>
                  <div>CGST: {fmt(totalCgstFinal)}</div>
                  <div>SGST: {fmt(totalSgstFinal)}</div>
                </>
              )}
            </div>
            <div style={{ width: "44%", fontSize: "12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {discount > 0 && (
                    <tr>
                      <td style={labelCell}>Discount:</td>
                      <td style={{ ...cell, textAlign: "right" }}>{fmt(discount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={labelCell}>Sub Total:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(subtotal)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>Taxable Amount:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(taxableAmount)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>GST Amount:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(totalGstAmount)}</td>
                  </tr>
                  {roundOff !== 0 && (
                    <tr>
                      <td style={labelCell}>Round Off:</td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {roundOff >= 0 ? "" : "(-)"}
                        {fmt(Math.abs(roundOff))}
                      </td>
                    </tr>
                  )}
                  <tr style={{ backgroundColor: "#f0f0f0" }}>
                    <td style={{ ...labelCell, fontSize: "13px" }}>Grand Total:</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: "bold", fontSize: "14px" }}>
                      ₹{fmt(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* GST declaration */}
          <div style={{ borderTop: b, padding: "6px 8px", fontSize: "10px", lineHeight: 1.35 }}>
            {gstDeclaration}
          </div>

          {/* Bank + Terms */}
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "6px 8px", fontSize: "10px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "5px", textDecoration: "underline" }}>
                Bank Details
              </div>
              {showBankDetails && normBank && (normBank.bankName || normBank.accountNumber) ? (
                <>
                  <div>Bank: {dash(normBank.bankName)}</div>
                  <div>A/C No: {dash(normBank.accountNumber)}</div>
                  <div>IFS CODE: {dash(normBank.ifscCode)}</div>
                  <div>Branch: {dash(normBank.branch)}</div>
                  <div>PAN NO.: {dash(panFromGst)}</div>
                </>
              ) : (
                <>
                  <div>Bank: —</div>
                  <div>A/C No: —</div>
                  <div>IFS CODE: —</div>
                  <div>Branch: —</div>
                  <div>PAN NO.: {dash(panFromGst)}</div>
                </>
              )}
            </div>
            <div style={{ flex: 1, padding: "6px 8px", fontSize: "10px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px", textDecoration: "underline" }}>
                TERMS OF SALE
              </div>
              {terms.map((term, idx) => (
                <div key={idx} style={{ lineHeight: 1.3, marginBottom: "1px" }}>
                  {idx + 1}) {term}
                </div>
              ))}
            </div>
          </div>

          {/* Signatures */}
          <div style={{ display: "flex", borderTop: b, minHeight: "58px" }}>
            <div
              style={{
                flex: 1,
                borderRight: b,
                padding: "8px",
                fontSize: "10px",
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              Receiver&apos;s Stamp/Sign.
            </div>
            <div style={{ flex: 1, padding: "8px", textAlign: "center", fontSize: "10px" }}>
              <div style={{ fontWeight: "bold" }}>For {businessName}</div>
              {stampImageBase64 && (
                <img
                  src={stampImageBase64}
                  alt=""
                  style={{
                    width: stampSize === "small" ? "90px" : stampSize === "large" ? "140px" : "110px",
                    maxHeight: "55px",
                    objectFit: "contain",
                    margin: "6px auto",
                    display: "block",
                  }}
                />
              )}
              <div style={{ fontWeight: "bold", marginTop: "10px" }}>Prop./Authorised Signatory</div>
            </div>
          </div>

          <div
            style={{
              borderTop: b,
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 8px",
              fontSize: "10px",
              fontWeight: "bold",
            }}
          >
            <span>EOE</span>
            <span>Subject to {jurisdictionCity} Jurisdiction</span>
          </div>
        </div>
      </div>
    </div>
  );
};
