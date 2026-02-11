import React from "react";

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  mrp?: number;
  qty: number;
  rate: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface RetailTemplateProps {
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

  items: InvoiceItem[];

  subtotal: number;
  discount: number;
  saleReturnAdjust?: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;

  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  previousBalance?: number;

  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  declarationText?: string;
  termsConditions?: string[];
  notes?: string;

  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  amountWithGrouping?: boolean;
  format?: "a5-vertical" | "a5-horizontal" | "a4";
  colorScheme?: string;

  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: string;
  fontFamily?: string;

  salesman?: string;

  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: "size/qty" | "size×qty";
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
}

const B = "1px solid #000";
const B2 = "2px solid #000";

export const RetailTemplate: React.FC<RetailTemplateProps> = ({
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
  items,
  subtotal,
  discount,
  saleReturnAdjust = 0,
  grandTotal,
  paymentMethod,
  paidAmount = 0,
  previousBalance = 0,
  qrCodeUrl,
  termsConditions = [],
  notes,
  amountWithDecimal = true,
  amountWithGrouping = true,
  format = "a5-vertical",
  salesman,
}) => {
  const isA4 = format === "a4";
  const FIXED_ROWS = 8;

  const fmt = (amount: number) => {
    const value = amountWithDecimal ? amount.toFixed(2) : Math.round(amount).toString();
    if (amountWithGrouping) {
      const parts = value.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }
    return value;
  };

  const displayItems: (InvoiceItem | null)[] = [...items];
  while (displayItems.length < FIXED_ROWS) displayItems.push(null);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const billTotal = grandTotal;
  const receivedToday = paidAmount;
  const currentBalance = billTotal - receivedToday;
  const totalDue = currentBalance + previousBalance;

  const pageW = isA4 ? "210mm" : "148mm";
  const pageH = isA4 ? "297mm" : "210mm";
  const pad = isA4 ? "10mm" : "5mm";
  const fsBody = isA4 ? "12px" : "10px";
  const fsHeader = isA4 ? "11px" : "9px";
  const fsHeading = isA4 ? "12px" : "10px";
  const fsTotals = isA4 ? "13px" : "11px";
  const fsGrand = isA4 ? "14px" : "12px";
  const headerFs = isA4 ? "18px" : "16px";
  const titleFs = isA4 ? "14px" : "11px";

  const cellBase: React.CSSProperties = {
    borderLeft: B,
    borderBottom: B,
    padding: "3px 6px",
    fontSize: fsBody,
    verticalAlign: "middle",
    lineHeight: "1.4",
  };
  const cellR: React.CSSProperties = { ...cellBase, textAlign: "right" };
  const cellC: React.CSSProperties = { ...cellBase, textAlign: "center" };
  const cellL: React.CSSProperties = { ...cellBase, textAlign: "left" };

  return (
    <div
      className="retail-invoice-template bg-white text-black"
      style={{
        width: pageW,
        height: pageH,
        padding: pad,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: fsBody,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Outer border */}
      <div style={{ border: B2, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ===== HEADER ===== */}
        <div style={{ borderBottom: B2, padding: "6px 8px 4px", position: "relative", textAlign: "center" }}>
          <div style={{ fontSize: headerFs, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>
            {businessName}
          </div>
          <div style={{ fontSize: fsHeader, marginTop: "2px", textTransform: "uppercase", lineHeight: 1.4 }}>
            {address}
          </div>
          <div style={{ fontSize: fsHeader, lineHeight: 1.4 }}>
            {mobile && `Mob: ${mobile}`}
            {email && ` | ${email}`}
          </div>
          {gstNumber && (
            <div style={{ fontSize: fsHeader, fontWeight: "bold" }}>GSTIN: {gstNumber}</div>
          )}
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              style={{
                height: isA4 ? "60px" : "50px",
                maxWidth: "90px",
                objectFit: "contain",
                position: "absolute",
                right: "8px",
                top: "6px",
              }}
            />
          )}
        </div>

        {/* ===== BILL OF SUPPLY ===== */}
        <div
          style={{
            textAlign: "center",
            fontWeight: "bold",
            fontSize: titleFs,
            borderBottom: B,
            padding: "3px 0",
          }}
        >
          Bill Of Supply
        </div>

        {/* ===== BILL TO + INVOICE INFO ===== */}
        <div
          style={{
            display: "flex",
            borderBottom: B,
            fontSize: fsHeader,
            lineHeight: 1.5,
          }}
        >
          <div style={{ flex: 1, padding: "4px 8px", borderRight: B }}>
            <div style={{ fontWeight: "bold" }}>BILL TO:</div>
            <div>{customerName || "Walk-in Customer"}</div>
            {customerAddress && <div>{customerAddress}</div>}
            {customerMobile && <div>Ph: {customerMobile}</div>}
            {customerGSTIN && <div>GSTIN: {customerGSTIN}</div>}
          </div>
          <div style={{ width: "40%", padding: "4px 8px" }}>
            <div><strong>Invoice No:</strong> {invoiceNumber}</div>
            <div>
              <strong>Date:</strong> {invoiceDate.toLocaleDateString("en-IN")}
              {invoiceTime && ` ${invoiceTime}`}
            </div>
            {salesman && <div><strong>Salesman:</strong> {salesman}</div>}
            {paymentMethod && <div><strong>Payment:</strong> {paymentMethod}</div>}
          </div>
        </div>

        {/* ===== ITEMS TABLE ===== */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            flex: 1,
          }}
        >
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "35%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...cellC, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, backgroundColor: "#f5f5f5" }}>Sr.</th>
              <th style={{ ...cellL, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, backgroundColor: "#f5f5f5" }}>Description</th>
              <th style={{ ...cellC, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, backgroundColor: "#f5f5f5" }}>Barcode</th>
              <th style={{ ...cellC, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, backgroundColor: "#f5f5f5" }}>Qty</th>
              <th style={{ ...cellR, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, backgroundColor: "#f5f5f5" }}>Rate</th>
              <th style={{ ...cellR, borderTop: "none", fontWeight: "bold", fontSize: fsHeading, borderRight: "none", backgroundColor: "#f5f5f5" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, idx) => (
              <tr key={idx}>
                <td style={{ ...cellC, minHeight: "32px", height: "32px" }}>{item ? idx + 1 : "\u00A0"}</td>
                <td style={{ ...cellL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.particulars || "\u00A0"}</td>
                <td style={{ ...cellC, fontSize: "10px" }}>{item?.barcode || "\u00A0"}</td>
                <td style={{ ...cellR }}>{item ? item.qty : "\u00A0"}</td>
                <td style={{ ...cellR }}>{item ? fmt(item.rate) : "\u00A0"}</td>
                <td style={{ ...cellR, borderRight: "none" }}>{item ? fmt(item.total) : "\u00A0"}</td>
              </tr>
            ))}

            {/* ===== TOTALS ROW ===== */}
            <tr style={{ borderTop: B2 }}>
              <td colSpan={3} style={{ ...cellL, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, height: "35px" }}>
                Total Qty: {totalQty}
              </td>
              <td style={{ ...cellR, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, height: "35px" }}>{totalQty}</td>
              <td style={{ ...cellR, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, height: "35px" }}>Sub Total</td>
              <td style={{ ...cellR, fontWeight: "bold", borderRight: "none", borderTop: B2, fontSize: fsTotals, height: "35px" }}>₹{fmt(subtotal)}</td>
            </tr>

          </tbody>
        </table>

        {/* ===== FOOTER: Grid Layout ===== */}
        <div
          className="retail-footer"
          style={{
            display: "grid",
            gridTemplateColumns: "70% 30%",
            borderTop: B2,
            fontSize: fsBody,
          }}
        >
          {/* Left Column: Terms, Notes, QR, E&OE, Receiver Signature */}
          <div style={{ borderRight: B, padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              {termsConditions.length > 0 && (
                <div>
                  <strong style={{ textDecoration: "underline" }}>Terms & Conditions:</strong>
                  <ul style={{ margin: "2px 0 0 14px", padding: 0, listStyleType: "disc", fontSize: isA4 ? "10px" : "8px", lineHeight: 1.5 }}>
                    {termsConditions.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {notes && (
                <div style={{ marginTop: "4px", fontSize: isA4 ? "10px" : "8px" }}>
                  <strong>Note:</strong> {notes}
                </div>
              )}
              {qrCodeUrl && (
                <div style={{ marginTop: "4px" }}>
                  <img src={qrCodeUrl} alt="QR" style={{ width: "60px", height: "60px" }} />
                </div>
              )}
              <div style={{ marginTop: "4px", fontSize: isA4 ? "10px" : "8px" }}>E. & O.E.</div>
            </div>
            <div style={{ marginTop: "12px", paddingTop: "20px" }}>
              <div style={{ borderTop: B, display: "inline-block", paddingTop: "2px", minWidth: "100px", textAlign: "center", fontSize: "9px" }}>
                Receiver's Signature
              </div>
            </div>
          </div>

          {/* Right Column: Summary Rows + Authorized Signatory */}
          <div style={{ display: "flex", flexDirection: "column", fontSize: fsTotals }}>
            {discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px" }}>
                <span>Discount</span>
                <span>- ₹{fmt(discount)}</span>
              </div>
            )}
            {saleReturnAdjust > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px", color: "#b45309" }}>
                <span>S/R Adjust</span>
                <span>- ₹{fmt(saleReturnAdjust)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, borderTop: B2, padding: "0 8px", fontWeight: "bold", fontSize: fsGrand, backgroundColor: "#f5f5f5" }}>
              <span>Grand Total</span>
              <span>₹{fmt(billTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px" }}>
              <span>Received</span>
              <span>₹{fmt(receivedToday)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px" }}>
              <span>Balance</span>
              <span>₹{fmt(currentBalance)}</span>
            </div>
            {previousBalance > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px" }}>
                <span>Prev. Balance</span>
                <span>₹{fmt(previousBalance)}</span>
              </div>
            )}
            {totalDue > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "30px", borderBottom: B, padding: "0 8px", fontWeight: "bold", fontSize: fsGrand }}>
                <span>TOTAL DUE</span>
                <span>₹{fmt(totalDue)}</span>
              </div>
            )}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "4px 8px", paddingTop: "20px" }}>
              <div style={{ borderTop: B, paddingTop: "2px", minWidth: "100px", textAlign: "center", fontSize: "9px" }}>
                Authorized Signatory
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          @page { size: ${isA4 ? "A4 portrait" : "A5 portrait"}; margin: 0; }
          .retail-invoice-template {
            width: ${pageW} !important;
            height: ${pageH} !important;
            padding: ${pad} !important;
            page-break-after: always;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .retail-footer { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};
