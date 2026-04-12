import React from "react";

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
}

interface TallyTaxInvoiceTemplateProps {
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
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
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
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  notes?: string;
  format?: string;
  financerDetails?: {
    financer_name: string;
    loan_number?: string;
    emi_amount?: number;
    tenure?: number;
    down_payment?: number;
    down_payment_mode?: string;
    bank_transfer_amount?: number;
    finance_discount?: number;
  } | null;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  [key: string]: any;
}

const numberToIndianWords = (num: number): string => {
  if (num === 0) return "Zero";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
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
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar",
    "36": "Telangana",
    "37": "Andhra Pradesh",
  };
  const code = gstin.substring(0, 2);
  return { name: m[code] || "", code };
};

const MIN_ITEM_ROWS = 5;

export const TallyTaxInvoiceTemplate: React.FC<TallyTaxInvoiceTemplateProps> = ({
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
  salesman,
  items,
  subtotal,
  discount,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  totalTax,
  roundOff,
  grandTotal,
  paymentMethod,
  cashAmount,
  cardAmount,
  upiAmount,
  creditAmount,
  declarationText,
  termsConditions,
  bankDetails,
  qrCodeUrl,
  upiId,
  showHSN = true,
  showGSTBreakdown = true,
  showBankDetails = true,
  notes,
  financerDetails,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const sellerState = getStateFromGSTIN(gstNumber);
  const buyerState = getStateFromGSTIN(customerGSTIN);
  const isInterState = gstNumber && customerGSTIN && gstNumber.substring(0, 2) !== customerGSTIN.substring(0, 2);

  // Normalize bankDetails
  const normBank = bankDetails
    ? {
        bankName: bankDetails.bankName || (bankDetails as any).bank_name || "",
        accountNumber: bankDetails.accountNumber || (bankDetails as any).account_number || "",
        ifscCode: bankDetails.ifscCode || (bankDetails as any).ifsc_code || "",
        accountHolder: bankDetails.accountHolder || (bankDetails as any).account_holder || "",
        branch: bankDetails.branch || "",
      }
    : null;

  const hsnBreakup: Record<
    string,
    { hsn: string; taxableValue: number; rate: number; cgst: number; sgst: number; igst: number; total: number }
  > = {};
  items.forEach((item) => {
    const gstPct = item.gstPercent || 0;
    const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
    const taxable = item.total - gstAmt;
    const hsn = item.hsn || "N/A";
    const key = `${hsn}-${gstPct}`;
    if (!hsnBreakup[key]) hsnBreakup[key] = { hsn, taxableValue: 0, rate: gstPct, cgst: 0, sgst: 0, igst: 0, total: 0 };
    hsnBreakup[key].taxableValue += taxable;
    if (isInterState) {
      hsnBreakup[key].igst += gstAmt;
    } else {
      hsnBreakup[key].cgst += gstAmt / 2;
      hsnBreakup[key].sgst += gstAmt / 2;
    }
    hsnBreakup[key].total += gstAmt;
  });

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const defaultDeclaration = `We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.\nWARRANTY TO CUSTOMER IS DIRECTLY FROM MANUFACTURER.\nDEALER IS NOT RESPONSIBLE. GOODS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED.`;

  let contentRows = items.length;
  let totalCgst = 0,
    totalSgst = 0,
    totalIgst = 0;
  let summaryGstRate = 0;

  items.forEach((item) => {
    const gstPct = item.gstPercent || 0;
    if (gstPct > 0) {
      const gstAmt = (item.total * gstPct) / (100 + gstPct);
      if (isInterState) {
        totalIgst += gstAmt;
      } else {
        totalCgst += gstAmt / 2;
        totalSgst += gstAmt / 2;
      }
      summaryGstRate = gstPct;
    }
  });

  if (showGSTBreakdown && (totalCgst > 0 || totalSgst > 0 || totalIgst > 0)) contentRows += 1;
  if (roundOff !== 0) contentRows++;
  const blankRowsNeeded = Math.max(0, MIN_ITEM_ROWS - contentRows);

  const b = "1px solid #000";
  // Use strictly controlled padding to ensure exact box sizing
  const cellNoRowBorder: React.CSSProperties = {
    borderLeft: b,
    borderRight: b,
    borderTop: "none",
    borderBottom: "none",
    padding: "4px 6px",
    fontSize: "10px",
    lineHeight: "1.4",
    wordWrap: "break-word",
    overflowWrap: "break-word",
  };
  const cell: React.CSSProperties = {
    border: b,
    padding: "4px 6px",
    fontSize: "10px",
    lineHeight: "1.4",
    wordWrap: "break-word",
    overflowWrap: "break-word",
  };
  const hCell: React.CSSProperties = {
    ...cell,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "#f0f0f0",
    fontSize: "10px",
    padding: "5px 6px",
  };

  return (
    <div
      style={{
        width: "210mm",
        height: "297mm",
        padding: "8mm",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        fontSize: "10px",
        color: "#000",
        background: "#fff",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ border: "1px solid #000", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ===== HEADER SECTION ===== */}
        <div
          style={{
            textAlign: "center",
            borderBottom: b,
            padding: "6px 0",
            fontWeight: "bold",
            fontSize: "15px",
            letterSpacing: "1px",
            flexShrink: 0,
            backgroundColor: "#f8f8f8",
          }}
        >
          TAX INVOICE
        </div>

        {/* Seller + Invoice Details */}
        <div style={{ display: "flex", borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: "6px 8px", borderRight: b }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              {logoUrl && (
                <img src={logoUrl} alt="Logo" style={{ width: "55px", height: "55px", objectFit: "contain" }} />
              )}
              <div>
                <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "2px", textTransform: "uppercase" }}>
                  {businessName}
                </div>
                <div style={{ fontSize: "11px", whiteSpace: "pre-line", lineHeight: "1.3" }}>{address}</div>
                {gstNumber && (
                  <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "3px" }}>GSTIN/UIN: {gstNumber}</div>
                )}
                {sellerState.name && (
                  <div style={{ fontSize: "10px", marginTop: "1px" }}>
                    State Name: {sellerState.name}, Code: {sellerState.code}
                  </div>
                )}
                {mobile && <div style={{ fontSize: "10px", marginTop: "1px" }}>Contact: {mobile}</div>}
                {email && <div style={{ fontSize: "10px", marginTop: "1px" }}>E-Mail: {email}</div>}
              </div>
            </div>
          </div>
          <div style={{ width: "45%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", height: "100%" }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      borderBottom: b,
                      borderRight: b,
                      padding: "4px 6px",
                      fontWeight: "bold",
                      width: "45%",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    Invoice No.
                  </td>
                  <td style={{ borderBottom: b, padding: "4px 6px", fontWeight: "bold" }}>{invoiceNumber}</td>
                </tr>
                <tr>
                  <td
                    style={{
                      borderBottom: b,
                      borderRight: b,
                      padding: "4px 6px",
                      fontWeight: "bold",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    Dated
                  </td>
                  <td style={{ borderBottom: b, padding: "4px 6px", fontWeight: "bold" }}>{formatDate(invoiceDate)}</td>
                </tr>
                <tr>
                  <td
                    style={{
                      borderBottom: b,
                      borderRight: b,
                      padding: "4px 6px",
                      fontWeight: "bold",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    Mode of Payment
                  </td>
                  <td style={{ borderBottom: b, padding: "4px 6px", lineHeight: "1.3" }}>
                    {(() => {
                      const parts: string[] = [];
                      if (cashAmount && cashAmount > 0) parts.push(`Cash ₹${fmt(cashAmount)}`);
                      if (upiAmount && upiAmount > 0) parts.push(`UPI ₹${fmt(upiAmount)}`);
                      if (cardAmount && cardAmount > 0) parts.push(`Card ₹${fmt(cardAmount)}`);
                      if (creditAmount && creditAmount > 0) parts.push(`Credit ₹${fmt(creditAmount)}`);
                      return <span>{parts.length > 0 ? parts.join(" | ") : paymentMethod || "Cash"}</span>;
                    })()}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      borderBottom: "none",
                      borderRight: b,
                      padding: "4px 6px",
                      fontWeight: "bold",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    Salesman
                  </td>
                  <td style={{ borderBottom: "none", padding: "4px 6px" }}>{salesman || "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Consignee + Finance Details */}
        <div style={{ display: "flex", borderBottom: b, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: "6px 8px", borderRight: b }}>
            <div style={{ fontSize: "10px", color: "#555", marginBottom: "2px" }}>Buyer (Bill to)</div>
            <div style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase" }}>
              {customerName || "Walk-in Customer"}
            </div>
            {customerAddress && (
              <div style={{ fontSize: "10px", whiteSpace: "pre-line", marginTop: "2px", lineHeight: "1.3" }}>
                {customerAddress}
              </div>
            )}
            <div
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                marginTop: "4px",
                padding: "2px 4px",
                borderRadius: "2px",
                display: "inline-block",
                backgroundColor: customerGSTIN ? "#f0f7f0" : "#fff8f0",
                border: `0.5px solid ${customerGSTIN ? "#4a9e4a" : "#ccc"}`,
              }}
            >
              GSTIN/UIN: {customerGSTIN || "URD"}
            </div>
            {buyerState.name && (
              <div style={{ fontSize: "10px", marginTop: "3px" }}>
                State Name: {buyerState.name}, Code: {buyerState.code}
              </div>
            )}
            {customerMobile && <div style={{ fontSize: "10px", marginTop: "1px" }}>Contact: {customerMobile}</div>}
          </div>

          <div style={{ width: "45%", padding: "6px 8px" }}>
            {financerDetails?.financer_name ? (
              <>
                <div style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "3px", textDecoration: "underline" }}>
                  Finance / EMI Details
                </div>
                <div style={{ fontSize: "10px", lineHeight: "1.5" }}>
                  <div>
                    <strong>Financer:</strong> {financerDetails.financer_name}
                  </div>
                  {financerDetails.loan_number && (
                    <div>
                      <strong>DSBS No:</strong> {financerDetails.loan_number}
                    </div>
                  )}
                  {financerDetails.down_payment != null && financerDetails.down_payment > 0 && (
                    <div>
                      <strong>Down Payment:</strong> ₹{fmt(financerDetails.down_payment)}
                    </div>
                  )}
                  {financerDetails.bank_transfer_amount != null && financerDetails.bank_transfer_amount > 0 && (
                    <div>
                      <strong>Bank Transfer:</strong> ₹{fmt(financerDetails.bank_transfer_amount)}
                    </div>
                  )}
                  {financerDetails.tenure != null && financerDetails.tenure > 0 && (
                    <div>
                      <strong>Tenure:</strong> {financerDetails.tenure} Months
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ===== ITEMS TABLE ===== */}
        {/* Added tableLayout: 'fixed' to rigidly enforce alignments */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", flex: 1 }}>
            <thead>
              <tr>
                <th style={{ ...hCell, width: "45px" }}>Sl No.</th>
                <th style={{ ...hCell, textAlign: "left" }}>Description of Goods</th>
                {showHSN && <th style={{ ...hCell, width: "70px" }}>HSN/SAC</th>}
                <th style={{ ...hCell, width: "60px" }}>Qty</th>
                <th style={{ ...hCell, width: "80px" }}>Rate</th>
                <th style={{ ...hCell, width: "75px" }}>GST Amt</th>
                <th style={{ ...hCell, width: "90px" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const gstPct = item.gstPercent || 0;
                const gstAmt = gstPct > 0 ? (item.total * gstPct) / (100 + gstPct) : 0;
                const taxableAmt = item.total - gstAmt;
                const rateExclTax = item.qty > 0 ? taxableAmt / item.qty : 0;
                return (
                  <tr key={index}>
                    <td style={{ ...cellNoRowBorder, textAlign: "center", verticalAlign: "top", fontWeight: "bold" }}>
                      {index + 1}
                    </td>
                    <td style={{ ...cellNoRowBorder, verticalAlign: "top" }}>
                      <div style={{ fontWeight: "bold", fontSize: "11px", lineHeight: "1.4" }}>{item.particulars}</div>
                      {item.color && (
                        <div style={{ fontSize: "9px", color: "#444", marginTop: "1px" }}>
                          <strong>Color:</strong> {item.color}
                        </div>
                      )}
                      {item.barcode && (
                        <div style={{ fontSize: "10px", color: "#000", fontFamily: "monospace", marginTop: "2px" }}>
                          Barcode: {item.barcode}
                        </div>
                      )}
                    </td>
                    {showHSN && (
                      <td style={{ ...cellNoRowBorder, textAlign: "center", verticalAlign: "top" }}>{item.hsn}</td>
                    )}
                    <td style={{ ...cellNoRowBorder, textAlign: "center", verticalAlign: "top", fontWeight: "bold" }}>
                      {item.qty} Pcs
                    </td>
                    <td style={{ ...cellNoRowBorder, textAlign: "right", verticalAlign: "top" }}>{fmt(rateExclTax)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: "right", verticalAlign: "top" }}>{fmt(gstAmt)}</td>
                    <td style={{ ...cellNoRowBorder, textAlign: "right", verticalAlign: "top", fontWeight: "bold" }}>
                      {fmt(item.total)}
                    </td>
                  </tr>
                );
              })}

              {/* Blank filler rows */}
              {Array.from({ length: blankRowsNeeded }).map((_, i) => (
                <tr key={`blank-${i}`} style={{ height: "24px" }}>
                  <td style={cellNoRowBorder}>&nbsp;</td>
                  <td style={cellNoRowBorder}></td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td style={cellNoRowBorder}></td>
                  <td style={cellNoRowBorder}></td>
                  <td style={cellNoRowBorder}></td>
                  <td style={cellNoRowBorder}></td>
                </tr>
              ))}

              {/* GST Summary Row within the main table to keep columns perfectly aligned */}
              {showGSTBreakdown && (totalCgst > 0 || totalSgst > 0 || totalIgst > 0) && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: "right", fontSize: "10px", fontStyle: "italic" }}>
                    Output GST @ {summaryGstRate}%
                  </td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td colSpan={2} style={cellNoRowBorder}></td>
                  <td colSpan={2} style={{ ...cellNoRowBorder, textAlign: "right", fontSize: "10px" }}>
                    {fmt(isInterState ? totalIgst : totalCgst + totalSgst)}
                  </td>
                </tr>
              )}

              {/* Round Off within the main table */}
              {roundOff !== 0 && (
                <tr>
                  <td style={cellNoRowBorder}></td>
                  <td style={{ ...cellNoRowBorder, textAlign: "right", fontSize: "10px", fontStyle: "italic" }}>
                    Round Off
                  </td>
                  {showHSN && <td style={cellNoRowBorder}></td>}
                  <td colSpan={2} style={cellNoRowBorder}></td>
                  <td colSpan={2} style={{ ...cellNoRowBorder, textAlign: "right", fontSize: "10px" }}>
                    {roundOff >= 0 ? "" : "(-)"}
                    {fmt(Math.abs(roundOff))}
                  </td>
                </tr>
              )}

              {/* Main Total Row - Explicit ColSpans for perfect alignment */}
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <td
                  colSpan={showHSN ? 3 : 2}
                  style={{ ...cell, textAlign: "right", fontWeight: "bold", fontSize: "11px" }}
                >
                  Total
                </td>
                <td style={{ ...cell, textAlign: "center", fontWeight: "bold", fontSize: "11px" }}>{totalQty} Pcs</td>
                <td colSpan={2} style={cell}></td>
                <td style={{ ...cell, textAlign: "right", fontWeight: "bold", fontSize: "12px" }}>
                  ₹{fmt(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ===== FOOTER SECTION ===== */}
        <div style={{ borderTop: "none", padding: "4px 8px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "10px" }}>Amount Chargeable (in words):</span>
              <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", textTransform: "capitalize" }}>
                INR {numberToIndianWords(grandTotal)}
              </div>
            </div>
            <div style={{ fontSize: "10px", fontStyle: "italic" }}>E. & O.E</div>
          </div>
        </div>

        {/* Notes Section */}
        {notes && notes.trim() && !/^\d+$/.test(notes.trim()) && (
          <div style={{ borderTop: b, padding: "4px 8px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", minWidth: "35px" }}>Note:</span>
              <span style={{ fontSize: "10px", lineHeight: "1.4", whiteSpace: "pre-line" }}>{notes}</span>
            </div>
          </div>
        )}

        {/* HSN Tax Breakup Table - Added fixed widths to enforce structure */}
        {showGSTBreakdown && Object.keys(hsnBreakup).length > 0 && (
          <div style={{ borderTop: b, flexShrink: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ ...hCell, textAlign: "center", width: "20%" }}>HSN/SAC</th>
                  <th style={{ ...hCell, textAlign: "right", width: "20%" }}>Taxable Value</th>
                  {isInterState ? (
                    <th style={{ ...hCell, textAlign: "right", width: "40%" }}>Integrated Tax (IGST)</th>
                  ) : (
                    <>
                      <th style={{ ...hCell, textAlign: "right", width: "20%" }}>Central Tax (CGST)</th>
                      <th style={{ ...hCell, textAlign: "right", width: "20%" }}>State Tax (SGST)</th>
                    </>
                  )}
                  <th style={{ ...hCell, textAlign: "right", width: "20%" }}>Total Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(hsnBreakup).map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...cell, textAlign: "center" }}>{row.hsn}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(row.taxableValue)}</td>
                    {isInterState ? (
                      <td style={{ ...cell, textAlign: "right" }}>
                        {fmt(row.igst)} <span style={{ fontSize: "8px", color: "#555" }}>({row.rate}%)</span>
                      </td>
                    ) : (
                      <>
                        <td style={{ ...cell, textAlign: "right" }}>
                          {fmt(row.cgst)} <span style={{ fontSize: "8px", color: "#555" }}>({row.rate / 2}%)</span>
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>
                          {fmt(row.sgst)} <span style={{ fontSize: "8px", color: "#555" }}>({row.rate / 2}%)</span>
                        </td>
                      </>
                    )}
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(row.total)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: "#f0f0f0" }}>
                  <td style={{ ...cell, fontWeight: "bold", textAlign: "right" }}>Total</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(taxableAmount)}</td>
                  {isInterState ? (
                    <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(totalIgst)}</td>
                  ) : (
                    <>
                      <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(totalCgst)}</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(totalSgst)}</td>
                    </>
                  )}
                  <td style={{ ...cell, textAlign: "right", fontWeight: "bold" }}>{fmt(totalTax)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "4px 8px", fontSize: "10px", borderTop: b }}>
              <span style={{ fontWeight: "bold" }}>Tax Amount (in words): </span>
              <span style={{ textTransform: "capitalize" }}>INR {numberToIndianWords(totalTax)}</span>
            </div>
          </div>
        )}

        {/* Declaration + Bank + QR/Signature */}
        <div style={{ display: "flex", borderTop: b, flexShrink: 0 }}>
          {/* Left: Declaration + Bank Details */}
          <div style={{ flex: 1, padding: "6px 8px", borderRight: b, fontSize: "10px" }}>
            {gstNumber && (
              <div style={{ marginBottom: "4px" }}>
                <strong>Company's PAN:</strong> {gstNumber.substring(2, 12)}
              </div>
            )}
            <div style={{ fontWeight: "bold", marginBottom: "2px", textDecoration: "underline" }}>Declaration:</div>
            <div style={{ whiteSpace: "pre-line", lineHeight: "1.4", fontSize: "9px", marginBottom: "6px" }}>
              {declarationText || defaultDeclaration}
            </div>

            {/* Bank Details */}
            {showBankDetails && normBank && (normBank.bankName || normBank.accountNumber) && (
              <div style={{ borderTop: "1px dashed #ccc", paddingTop: "4px", marginTop: "auto" }}>
                <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Company's Bank Details:</div>
                <table style={{ fontSize: "9.5px", lineHeight: "1.4" }}>
                  <tbody>
                    {normBank.accountHolder && (
                      <tr>
                        <td style={{ width: "70px", color: "#444" }}>A/c Holder:</td>
                        <td>
                          <strong>{normBank.accountHolder}</strong>
                        </td>
                      </tr>
                    )}
                    {normBank.bankName && (
                      <tr>
                        <td style={{ color: "#444" }}>Bank Name:</td>
                        <td>
                          <strong>{normBank.bankName}</strong>
                        </td>
                      </tr>
                    )}
                    {normBank.accountNumber && (
                      <tr>
                        <td style={{ color: "#444" }}>A/c No.:</td>
                        <td>
                          <strong>{normBank.accountNumber}</strong>
                        </td>
                      </tr>
                    )}
                    {(normBank.branch || normBank.ifscCode) && (
                      <tr>
                        <td style={{ color: "#444" }}>Branch & IFSC:</td>
                        <td>
                          <strong>{[normBank.branch, normBank.ifscCode].filter(Boolean).join(" & ")}</strong>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: QR Code + Signature */}
          <div
            style={{
              width: "35%",
              padding: "6px 8px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {qrCodeUrl && (
              <div style={{ textAlign: "center", marginBottom: "8px" }}>
                <img
                  src={qrCodeUrl}
                  alt="UPI QR"
                  style={{
                    width: "70px",
                    height: "70px",
                    border: "1px solid #eee",
                    padding: "2px",
                    borderRadius: "4px",
                  }}
                />
                {upiId && (
                  <div style={{ fontSize: "9px", marginTop: "2px", color: "#555", fontWeight: "bold" }}>{upiId}</div>
                )}
              </div>
            )}

            <div style={{ marginTop: "auto", paddingTop: "10px", width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: "10px", marginBottom: "2px", fontWeight: "bold" }}>for {businessName}</div>

              {stampImageBase64 ? (
                <img
                  src={stampImageBase64}
                  alt="Stamp"
                  style={{
                    width: stampSize === "small" ? "90px" : stampSize === "large" ? "150px" : "120px",
                    maxHeight: "60px",
                    objectFit: "contain",
                    margin: "4px auto",
                  }}
                />
              ) : (
                <div style={{ height: "40px" }}></div>
              )}

              <div style={{ fontSize: "10px", fontWeight: "bold", paddingTop: "4px" }}>Authorised Signatory</div>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div
          style={{
            borderTop: b,
            textAlign: "center",
            padding: "3px 0",
            fontSize: "9px",
            color: "#444",
            flexShrink: 0,
            backgroundColor: "#f9f9f9",
          }}
        >
          This is a Computer Generated Invoice
        </div>
      </div>
    </div>
  );
};
