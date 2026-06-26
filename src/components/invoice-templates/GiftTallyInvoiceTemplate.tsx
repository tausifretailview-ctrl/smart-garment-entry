import React from "react";
import {
  computeTallyLineDisplay,
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
  "Goods once sold not taken back or exchanged",
  "Seller not responsible for transit loss/damage",
  "Disputes subject to seller jurisdiction",
  "Payment 50% advance",
  "By payee A/C Cheque/NEFT",
];

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
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  customerTransportDetails,
  customHeaderText,
  documentTitle,
  taxType: taxTypeProp = "inclusive",
  items,
  discount,
  taxableAmount: taxableAmountProp,
  cgstAmount: cgstAmountProp = 0,
  sgstAmount: sgstAmountProp = 0,
  igstAmount: igstAmountProp = 0,
  totalTax: totalTaxProp,
  roundOff,
  grandTotal,
  termsConditions,
  bankDetails,
  showHSN = true,
  showBankDetails = true,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
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

  const lineRows = items.map((item, index) => {
    const gstPct = item.gstPercent || 0;
    const { taxable, gst: gstAmt } = splitLineGstFromTotal(item.total, gstPct);
    const { displayRate, displayAmount } = computeTallyLineDisplay(item.total, gstPct, item.qty, taxType);
    computedTaxable += taxable;
    let cgstAmt = 0;
    let sgstAmt = 0;
    let igstAmt = 0;
    let cgstPct = 0;
    let sgstPct = 0;
    let igstPct = 0;
    if (isInterState) {
      igstAmt = gstAmt;
      igstPct = gstPct;
      totalIgst += gstAmt;
    } else {
      cgstAmt = gstAmt / 2;
      sgstAmt = gstAmt / 2;
      cgstPct = gstPct / 2;
      sgstPct = gstPct / 2;
      totalCgst += cgstAmt;
      totalSgst += sgstAmt;
    }
    return {
      index: index + 1,
      item,
      displayRate,
      displayAmount,
      cgstPct,
      sgstPct,
      igstPct,
      cgstAmt,
      sgstAmt,
      igstAmt,
    };
  });

  const taxableAmount = computedTaxable > 0 ? computedTaxable : taxableAmountProp;
  const totalCgstFinal = totalCgst > 0 ? totalCgst : cgstAmountProp;
  const totalSgstFinal = totalSgst > 0 ? totalSgst : sgstAmountProp;
  const totalIgstFinal = totalIgst > 0 ? totalIgst : igstAmountProp;
  const totalTax = totalCgstFinal + totalSgstFinal + totalIgstFinal || totalTaxProp;

  const terms =
    termsConditions && termsConditions.filter((t) => t?.trim()).length > 0
      ? termsConditions.filter((t) => t?.trim())
      : DEFAULT_GIFT_TERMS;

  const shippingAddress = customerAddress;
  const tagline = customHeaderText?.trim() || documentTitle?.trim() || "";

  // TODO: add field to sales table — challan_number, challan_date, po_number, po_date, vehicle_number, reverse_charge
  const challanNumber = "";
  const challanDate = "";
  const poNumber = "";
  const poDate = "";
  const vehicleNumber = "";
  const reverseCharge = "N";
  const modeOfTransport = customerTransportDetails?.trim() || "";

  const b = "1px solid #000";
  const cell: React.CSSProperties = {
    border: b,
    padding: "3px 5px",
    fontSize: "9px",
    lineHeight: "1.35",
    verticalAlign: "top",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "#f0f0f0",
    fontSize: "9px",
  };
  const labelCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    backgroundColor: "#fafafa",
    width: "22%",
  };

  return (
    <div
      className="gift-tally-invoice-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "6mm",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "10px",
        color: "#000",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { margin: 0; padding: 0; }
          .gift-tally-invoice-root {
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
          }
          .gift-tally-page-break { page-break-before: always; }
        }
      `}</style>

      <div style={{ border: b }}>
        {/* Title row */}
        <div style={{ display: "flex", borderBottom: b, alignItems: "stretch" }}>
          <div style={{ flex: 1, padding: "6px 8px", fontWeight: "bold", fontSize: "14px", letterSpacing: "0.5px" }}>
            {grandTotal < 0 ? "CREDIT NOTE" : "TAX INVOICE"}
          </div>
          <div
            style={{
              borderLeft: b,
              padding: "6px 10px",
              fontWeight: "bold",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
            }}
          >
            ORIGINAL
          </div>
        </div>

        {/* Seller header */}
        <div style={{ borderBottom: b, padding: "8px 10px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            {logoUrl && (
              <img src={logoUrl} alt="" style={{ width: "50px", height: "50px", objectFit: "contain" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "18px", fontWeight: "bold", textTransform: "uppercase" }}>{businessName}</div>
              {tagline && (
                <div style={{ fontSize: "10px", fontStyle: "italic", marginTop: "2px" }}>{tagline}</div>
              )}
              <div style={{ fontSize: "10px", whiteSpace: "pre-line", marginTop: "4px" }}>{address}</div>
              <div style={{ fontSize: "10px", marginTop: "3px" }}>
                {[mobile && `Tel: ${mobile}`, email && `Email: ${email}`].filter(Boolean).join(" | ")}
              </div>
              <div style={{ fontSize: "10px", marginTop: "3px" }}>
                GSTIN: {dash(gstNumber)}
                {sellerState.name ? ` | State: ${sellerState.name} | State Code: ${sellerState.code}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Billed / Shipped */}
        <div style={{ display: "flex", borderBottom: b }}>
          <div style={{ flex: 1, borderRight: b, padding: "6px 8px" }}>
            <div style={{ fontWeight: "bold", fontSize: "10px", marginBottom: "4px", textDecoration: "underline" }}>
              BILLED TO
            </div>
            <div style={{ fontWeight: "bold", fontSize: "11px" }}>{customerName || "Walk-in Customer"}</div>
            {customerAddress && (
              <div style={{ fontSize: "9px", whiteSpace: "pre-line", marginTop: "2px" }}>{customerAddress}</div>
            )}
            <div style={{ fontSize: "9px", marginTop: "3px" }}>GSTIN: {dash(customerGSTIN)}</div>
            {buyerState.name && (
              <div style={{ fontSize: "9px" }}>
                State: {buyerState.name} | Code: {buyerState.code}
              </div>
            )}
            {customerMobile && <div style={{ fontSize: "9px" }}>Tel: {customerMobile}</div>}
          </div>
          <div style={{ flex: 1, padding: "6px 8px" }}>
            <div style={{ fontWeight: "bold", fontSize: "10px", marginBottom: "4px", textDecoration: "underline" }}>
              SHIPPED TO
            </div>
            <div style={{ fontWeight: "bold", fontSize: "11px" }}>{customerName || "Walk-in Customer"}</div>
            {shippingAddress ? (
              <div style={{ fontSize: "9px", whiteSpace: "pre-line", marginTop: "2px" }}>{shippingAddress}</div>
            ) : (
              <div style={{ fontSize: "9px", marginTop: "2px" }}>—</div>
            )}
            <div style={{ fontSize: "9px", marginTop: "3px" }}>GSTIN: {dash(customerGSTIN)}</div>
            {buyerState.name && (
              <div style={{ fontSize: "9px" }}>
                State: {buyerState.name} | Code: {buyerState.code}
              </div>
            )}
          </div>
        </div>

        {/* Invoice meta */}
        <table style={{ width: "100%", borderCollapse: "collapse", borderBottom: b }}>
          <tbody>
            <tr>
              <td style={labelCell}>Invoice No:</td>
              <td style={cell}>{invoiceNumber}</td>
              <td style={labelCell}>Date:</td>
              <td style={cell}>{formatDate(invoiceDate)}</td>
              <td style={labelCell}>Place of Supply:</td>
              <td style={cell}>{placeOfSupply}</td>
            </tr>
            <tr>
              <td style={labelCell}>Challan No:</td>
              <td style={cell}>{dash(challanNumber)}</td>
              <td style={labelCell}>Date:</td>
              <td style={cell}>{dash(challanDate)}</td>
              <td style={labelCell}>Reverse Charge (Y/N):</td>
              <td style={cell}>{reverseCharge}</td>
            </tr>
            <tr>
              <td style={labelCell}>PO No:</td>
              <td style={cell}>{dash(poNumber)}</td>
              <td style={labelCell}>Date:</td>
              <td style={cell}>{dash(poDate)}</td>
              <td style={labelCell}>Mode of Transport:</td>
              <td style={cell}>{dash(modeOfTransport)}</td>
            </tr>
            <tr>
              <td style={labelCell}>Vehicle No:</td>
              <td style={cell} colSpan={5}>{dash(vehicleNumber)}</td>
            </tr>
          </tbody>
        </table>

        {/* Line items */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...hCell, width: "28px" }}>S.No</th>
              <th style={{ ...hCell, textAlign: "left" }}>Description</th>
              {showHSN && <th style={{ ...hCell, width: "52px" }}>HSN</th>}
              <th style={{ ...hCell, width: "36px" }}>Qty</th>
              <th style={{ ...hCell, width: "52px" }}>Rate</th>
              <th style={{ ...hCell, width: "58px" }}>Amount</th>
              <th style={{ ...hCell, width: "44px" }}>CGST</th>
              <th style={{ ...hCell, width: "44px" }}>SGST</th>
              <th style={{ ...hCell, width: "44px" }}>IGST</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.map((row) => (
              <tr key={row.index} style={{ backgroundColor: row.index % 2 === 0 ? "#fafafa" : "#fff" }}>
                <td style={{ ...cell, textAlign: "center" }}>{row.index}</td>
                <td style={cell}>
                  <div style={{ fontWeight: "bold" }}>{row.item.particulars}</div>
                  {row.item.color && <div style={{ fontSize: "8px" }}>Color: {row.item.color}</div>}
                  {row.item.size && <div style={{ fontSize: "8px" }}>Size: {row.item.size}</div>}
                </td>
                {showHSN && <td style={{ ...cell, textAlign: "center" }}>{row.item.hsn || "—"}</td>}
                <td style={{ ...cell, textAlign: "center" }}>{row.item.qty}</td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(row.displayRate)}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(row.displayAmount)}</td>
                <td style={{ ...cell, textAlign: "right", fontSize: "8px" }}>
                  {row.cgstPct > 0 ? `${row.cgstPct}%\n${fmt(row.cgstAmt)}` : "—"}
                </td>
                <td style={{ ...cell, textAlign: "right", fontSize: "8px" }}>
                  {row.sgstPct > 0 ? `${row.sgstPct}%\n${fmt(row.sgstAmt)}` : "—"}
                </td>
                <td style={{ ...cell, textAlign: "right", fontSize: "8px" }}>
                  {row.igstPct > 0 ? `${row.igstPct}%\n${fmt(row.igstAmt)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals — page break if many items */}
        <div className={items.length > 20 ? "gift-tally-page-break" : undefined}>
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "6px 8px", fontSize: "10px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Amount in Words:</div>
              <div style={{ textTransform: "capitalize" }}>INR {numberToIndianWords(grandTotal)}</div>
            </div>
            <div style={{ width: "42%", fontSize: "9px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {discount > 0 && (
                    <tr>
                      <td style={labelCell}>Discount:</td>
                      <td style={{ ...cell, textAlign: "right" }}>{fmt(discount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={labelCell}>Taxable Value:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(taxableAmount)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>CGST:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(totalCgstFinal)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>SGST:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(totalSgstFinal)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>IGST:</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(totalIgstFinal)}</td>
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
                    <td style={{ ...labelCell, fontSize: "11px" }}>GRAND TOTAL:</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: "bold", fontSize: "11px" }}>
                      ₹{fmt(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bank + Terms */}
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "6px 8px", fontSize: "9px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px", textDecoration: "underline" }}>
                Bank Details:
              </div>
              {showBankDetails && normBank && (normBank.bankName || normBank.accountNumber) ? (
                <>
                  <div>Bank: {dash(normBank.bankName)}</div>
                  <div>A/C: {dash(normBank.accountNumber)}</div>
                  <div>IFSC: {dash(normBank.ifscCode)}</div>
                  <div>Branch: {dash(normBank.branch)}</div>
                  <div>PAN: {dash(panFromGst)}</div>
                </>
              ) : (
                <>
                  <div>Bank: —</div>
                  <div>A/C: —</div>
                  <div>IFSC: —</div>
                  <div>Branch: —</div>
                  <div>PAN: {dash(panFromGst)}</div>
                </>
              )}
            </div>
            <div style={{ flex: 1, padding: "6px 8px", fontSize: "9px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px", textDecoration: "underline" }}>
                Terms &amp; Conditions:
              </div>
              {terms.map((term, idx) => (
                <div key={idx} style={{ lineHeight: "1.45" }}>
                  {idx + 1}) {term}
                </div>
              ))}
            </div>
          </div>

          {/* Signatures */}
          <div style={{ display: "flex", borderTop: b, minHeight: "70px" }}>
            <div style={{ flex: 1, borderRight: b, padding: "8px", fontSize: "9px", display: "flex", alignItems: "flex-end" }}>
              Receiver Stamp/Sign
            </div>
            <div style={{ flex: 1, padding: "8px", textAlign: "center", fontSize: "9px" }}>
              <div style={{ fontWeight: "bold" }}>For {businessName}</div>
              {stampImageBase64 && (
                <img
                  src={stampImageBase64}
                  alt=""
                  style={{
                    width: stampSize === "small" ? "80px" : stampSize === "large" ? "130px" : "100px",
                    maxHeight: "50px",
                    objectFit: "contain",
                    margin: "4px auto",
                    display: "block",
                  }}
                />
              )}
              <div style={{ fontWeight: "bold", marginTop: "8px" }}>Authorised Signatory</div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: b,
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 8px",
              fontSize: "8px",
            }}
          >
            <span>E &amp; O E</span>
            <span>Subject to {jurisdictionCity} Jurisdiction</span>
          </div>
        </div>
      </div>
    </div>
  );
};
