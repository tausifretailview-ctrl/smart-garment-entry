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
  "Goods once sold will not be taken back or exchanged",
  "Seller is not responsible for any loss or damaged of goods in transit",
  "Buyer undertakes to submit prescribed ST declaration to sender on demand. Disputes if any will be subject to seller court jurisdiction",
  "Payment 50% advance and rest against each delivery OR as per final Term",
  "By Payees A/C Cheque/Draft/NEFT Only",
];

const DEFAULT_GST_DECLARATION =
  "I/We certify that our registration certificate under the GST Act is in force on the date on which supply of goods specified in the invoice is made by me/us and the transaction of supply covered under this invoice has been effected by me/us in the regular course of my/our business.";

const MIN_ITEM_ROWS = 10;

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
  let totalQty = 0;

  const lineRows = items.map((item, index) => {
    const gstPct = item.gstPercent || 0;
    const { taxable, gst: gstAmt } = splitLineGstFromTotal(item.total, gstPct);
    const { displayRate, displayAmount } = computeTallyLineDisplay(item.total, gstPct, item.qty, taxType);
    computedTaxable += taxable;
    totalQty += item.qty;
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
    padding: "4px 6px",
    fontSize: "11px",
    lineHeight: "1.4",
    verticalAlign: "top",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "#f0f0f0",
    fontSize: "11px",
    padding: "5px 6px",
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
        height: "297mm",
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
            min-height: 287mm !important;
            height: auto !important;
            padding: 0 !important;
          }
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

        {/* Seller */}
        <div style={{ borderBottom: b, padding: "10px 12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            {logoUrl && (
              <img src={logoUrl} alt="" style={{ width: "58px", height: "58px", objectFit: "contain" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", lineHeight: 1.2 }}>
                {businessName}
              </div>
              {tagline && (
                <div style={{ fontSize: "12px", fontStyle: "italic", marginTop: "3px" }}>{tagline}</div>
              )}
              <div style={{ fontSize: "12px", whiteSpace: "pre-line", marginTop: "5px", lineHeight: 1.35 }}>
                {address}
              </div>
              <div style={{ fontSize: "12px", marginTop: "4px" }}>
                {mobile && <span>Tel: {mobile}</span>}
                {mobile && email && <span> &nbsp;|&nbsp; </span>}
                {email && <span>E-Mail: {email}</span>}
              </div>
              <div style={{ fontSize: "12px", marginTop: "4px", fontWeight: "bold" }}>
                GSTIN/Unique ID: {dash(gstNumber)}
              </div>
              {sellerState.code && (
                <div style={{ fontSize: "12px", marginTop: "2px" }}>
                  State: {sellerState.name} &nbsp;|&nbsp; State Code: {sellerState.code}
                </div>
              )}
            </div>
          </div>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", flex: 1 }}>
            <thead>
              <tr>
                <th style={{ ...hCell, width: "32px" }}>S.No.</th>
                <th style={{ ...hCell, textAlign: "left" }}>Description of Goods</th>
                {showHSN && <th style={{ ...hCell, width: "58px" }}>HSN Code</th>}
                <th style={{ ...hCell, width: "40px" }}>QTY.</th>
                <th style={{ ...hCell, width: "58px" }}>RATE<br />Rs. P.</th>
                <th style={{ ...hCell, width: "64px" }}>AMOUNT<br />Rs. P.</th>
                <th style={{ ...hCell, width: "50px" }}>CGST %</th>
                <th style={{ ...hCell, width: "50px" }}>SGST %</th>
                <th style={{ ...hCell, width: "50px" }}>IGST %</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((row) => (
                <tr key={row.index}>
                  <td style={{ ...cell, textAlign: "center", fontWeight: "bold" }}>{row.index}</td>
                  <td style={cell}>
                    <div style={{ fontWeight: "bold", fontSize: "12px" }}>{row.item.particulars}</div>
                    {row.item.size && <div style={{ fontSize: "11px" }}>Size: {row.item.size}</div>}
                    {row.item.color && <div style={{ fontSize: "11px" }}>Color: {row.item.color}</div>}
                  </td>
                  {showHSN && <td style={{ ...cell, textAlign: "center" }}>{row.item.hsn || "—"}</td>}
                  <td style={{ ...cell, textAlign: "center", fontWeight: "bold" }}>{row.item.qty}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmt(row.displayRate)}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(row.displayAmount)}</td>
                  <td style={{ ...cell, textAlign: "right", fontSize: "10px", lineHeight: 1.3 }}>
                    {row.cgstPct > 0 ? (
                      <>
                        {row.cgstPct}%
                        <br />
                        {fmt(row.cgstAmt)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontSize: "10px", lineHeight: 1.3 }}>
                    {row.sgstPct > 0 ? (
                      <>
                        {row.sgstPct}%
                        <br />
                        {fmt(row.sgstAmt)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontSize: "10px", lineHeight: 1.3 }}>
                    {row.igstPct > 0 ? (
                      <>
                        {row.igstPct}%
                        <br />
                        {fmt(row.igstAmt)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`blank-${i}`} style={{ height: "22px" }}>
                  <td style={cell}>&nbsp;</td>
                  <td style={cell} />
                  {showHSN && <td style={cell} />}
                  <td style={cell} />
                  <td style={cell} />
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
                <td style={{ ...cell, textAlign: "right" }}>{fmt(lineRows.reduce((s, r) => s + r.displayAmount, 0))}</td>
                <td style={{ ...cell, textAlign: "right" }}>{totalCgstFinal > 0 ? fmt(totalCgstFinal) : "—"}</td>
                <td style={{ ...cell, textAlign: "right" }}>{totalSgstFinal > 0 ? fmt(totalSgstFinal) : "—"}</td>
                <td style={{ ...cell, textAlign: "right" }}>{totalIgstFinal > 0 ? fmt(totalIgstFinal) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={items.length > 20 ? "gift-tally-page-break" : undefined}>
          {/* Amount in words + totals */}
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "8px 10px", fontSize: "12px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>Invoice Total (In Words):</div>
              <div style={{ textTransform: "capitalize", lineHeight: 1.4 }}>
                INR {numberToIndianWords(grandTotal)}
              </div>
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
                    <td style={{ ...labelCell, fontSize: "13px" }}>Invoice Total:</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: "bold", fontSize: "14px" }}>
                      ₹{fmt(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* GST declaration */}
          <div style={{ borderTop: b, padding: "8px 10px", fontSize: "11px", lineHeight: 1.45 }}>
            {gstDeclaration}
          </div>

          {/* Bank + Terms */}
          <div style={{ display: "flex", borderTop: b }}>
            <div style={{ flex: 1, borderRight: b, padding: "8px 10px", fontSize: "12px" }}>
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
            <div style={{ flex: 1, padding: "8px 10px", fontSize: "12px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "5px", textDecoration: "underline" }}>
                TERMS OF SALE
              </div>
              {terms.map((term, idx) => (
                <div key={idx} style={{ lineHeight: 1.45, marginBottom: "2px" }}>
                  {idx + 1}) {term}
                </div>
              ))}
            </div>
          </div>

          {/* Signatures */}
          <div style={{ display: "flex", borderTop: b, minHeight: "80px" }}>
            <div
              style={{
                flex: 1,
                borderRight: b,
                padding: "10px",
                fontSize: "12px",
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              Receiver&apos;s Stamp/Sign.
            </div>
            <div style={{ flex: 1, padding: "10px", textAlign: "center", fontSize: "12px" }}>
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
              padding: "5px 10px",
              fontSize: "11px",
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
