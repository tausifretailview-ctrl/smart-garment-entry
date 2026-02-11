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

  // Format amount helper
  const formatAmount = (amount: number) => {
    const value = amountWithDecimal ? amount.toFixed(2) : Math.round(amount).toString();
    if (amountWithGrouping) {
      const parts = value.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }
    return value;
  };

  // Enforce exactly 8 rows
  const displayItems: (InvoiceItem | null)[] = [...items].slice(0, FIXED_ROWS);
  while (displayItems.length < FIXED_ROWS) {
    displayItems.push(null);
  }

  // Calculate total quantity
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  // Calculate balance calculations
  const billTotal = grandTotal;
  const receivedToday = paidAmount;
  const currentBalance = billTotal - receivedToday;
  const totalDue = currentBalance + previousBalance;

  // Get dimensions based on format
  const getContainerStyle = (): React.CSSProperties => {
    if (isA4) {
      return {
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm",
      };
    }
    // A5 vertical - strict fixed dimensions
    return {
      width: "148mm",
      height: "210mm",
      padding: "5mm",
    };
  };

  return (
    <div
      className="retail-invoice-template bg-white text-black"
      style={{
        ...getContainerStyle(),
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        border: "2px solid #000",
        position: "relative",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "2px solid #000",
          paddingBottom: "6px",
          marginBottom: "0",
        }}
      >
        <div style={{ flex: 1, textAlign: "center", paddingRight: logoUrl ? "0" : "0" }}>
          <div style={{ fontSize: "28px", fontWeight: "bold", textTransform: "uppercase" }}>
            {businessName}
          </div>
          <div style={{ fontSize: isA4 ? "10px" : "9px", marginTop: "2px", textTransform: "uppercase" }}>{address}</div>
          <div style={{ fontSize: isA4 ? "10px" : "9px" }}>
            {mobile && `Mob: ${mobile}`}
            {email && ` | ${email}`}
          </div>
          {gstNumber && <div style={{ fontSize: isA4 ? "10px" : "9px", fontWeight: "bold" }}>GSTIN: {gstNumber}</div>}
        </div>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{
              height: "85px",
              maxWidth: "120px",
              objectFit: "contain",
              position: "absolute",
              right: "8mm",
              top: "8mm",
            }}
          />
        )}
      </div>

      {/* Bill Of Supply Title */}
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: isA4 ? "16px" : "14px",
          borderBottom: "1px solid #000",
          borderTop: "1px solid #000",
          padding: "4px 0",
          marginBottom: "6px",
        }}
      >
        Bill Of Supply
      </div>

      {/* Customer & Invoice Details */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid #000",
          paddingBottom: "6px",
          marginBottom: "6px",
          fontSize: isA4 ? "11px" : "10px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold" }}>BILL TO:</div>
          <div>{customerName || "Walk-in Customer"}</div>
          {customerAddress && <div>{customerAddress}</div>}
          {customerMobile && <div>Ph: {customerMobile}</div>}
          {customerGSTIN && <div>GSTIN: {customerGSTIN}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>
            <strong>Invoice No:</strong> {invoiceNumber}
          </div>
          <div>
            <strong>Date:</strong> {invoiceDate.toLocaleDateString("en-IN")}
            {invoiceTime && ` ${invoiceTime}`}
          </div>
          {salesman && (
            <div>
              <strong>Salesman:</strong> {salesman}
            </div>
          )}
          {paymentMethod && (
            <div>
              <strong>Payment:</strong> {paymentMethod}
            </div>
          )}
        </div>
      </div>

      {/* Items Table with continuous column lines to footer */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
          flex: 1,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th style={{ border: "1px solid #000", padding: "4px", width: "40px", textAlign: "center", fontSize: "12px", fontWeight: "bold" }}>Sr.</th>
            <th style={{ border: "1px solid #000", padding: "4px", textAlign: "left", fontSize: "12px", fontWeight: "bold" }}>Description</th>
            <th style={{ border: "1px solid #000", padding: "4px", width: "90px", textAlign: "center", fontSize: "12px", fontWeight: "bold" }}>Barcode</th>
            <th style={{ border: "1px solid #000", padding: "4px", width: "50px", textAlign: "center", fontSize: "12px", fontWeight: "bold" }}>Qty</th>
            <th style={{ border: "1px solid #000", padding: "4px", width: "80px", textAlign: "right", fontSize: "12px", fontWeight: "bold" }}>Rate</th>
            <th style={{ border: "1px solid #000", padding: "4px", width: "90px", textAlign: "right", fontSize: "12px", fontWeight: "bold" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item, index) => (
            <tr key={index}>
              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center", height: isA4 ? "28px" : "24px", fontSize: "12px" }}>{item ? index + 1 : ""}</td>
              <td style={{ border: "1px solid #000", padding: "4px", height: isA4 ? "28px" : "24px", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.particulars || ""}</td>
              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center", height: isA4 ? "28px" : "24px", fontSize: "10px" }}>{item?.barcode || ""}</td>
              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center", height: isA4 ? "28px" : "24px", fontSize: "12px" }}>{item ? item.qty : ""}</td>
              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right", height: isA4 ? "28px" : "24px", fontSize: "12px" }}>{item ? formatAmount(item.rate) : ""}</td>
              <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right", height: isA4 ? "28px" : "24px", fontSize: "12px" }}>{item ? formatAmount(item.total) : ""}</td>
            </tr>
          ))}
          {/* Totals row inside the table for continuous column lines */}
          <tr style={{ borderTop: "2px solid #000" }}>
            <td colSpan={3} style={{ border: "1px solid #000", padding: "4px", fontSize: "12px", fontWeight: "bold" }}>
              Total Qty: {totalQty}
            </td>
            <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center", fontSize: "12px", fontWeight: "bold" }}>{totalQty}</td>
            <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right", fontSize: "12px", fontWeight: "bold" }}>Sub Total</td>
            <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right", fontSize: "12px", fontWeight: "bold" }}>₹{formatAmount(subtotal)}</td>
          </tr>
          {discount > 0 && (
            <tr>
              <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "12px" }}>Discount</td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "12px" }}>- ₹{formatAmount(discount)}</td>
            </tr>
          )}
          {saleReturnAdjust > 0 && (
            <tr>
              <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "12px", color: "#d97706" }}>S/R Adjust</td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "12px", color: "#d97706" }}>- ₹{formatAmount(saleReturnAdjust)}</td>
            </tr>
          )}
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
            <td style={{ border: "2px solid #000", padding: "6px 4px", textAlign: "right", fontSize: "14px", fontWeight: "bold" }}>Grand Total</td>
            <td style={{ border: "2px solid #000", padding: "6px 4px", textAlign: "right", fontSize: "14px", fontWeight: "bold" }}>₹{formatAmount(billTotal)}</td>
          </tr>
          {/* Payment details rows */}
          <tr>
            <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>Received</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>₹{formatAmount(receivedToday)}</td>
          </tr>
          <tr>
            <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>Balance</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>₹{formatAmount(currentBalance)}</td>
          </tr>
          {previousBalance > 0 && (
            <tr>
              <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>Prev. Balance</td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px" }}>₹{formatAmount(previousBalance)}</td>
            </tr>
          )}
          {totalDue > 0 && (
            <tr>
              <td colSpan={4} style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px", fontWeight: "bold", borderTop: "1px solid #000" }}>TOTAL DUE</td>
              <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontSize: "11px", fontWeight: "bold", borderTop: "1px solid #000" }}>₹{formatAmount(totalDue)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer: Terms, Notes, QR & Signature */}
      <div style={{ marginTop: "auto" }}>
        {/* Terms & Conditions from settings */}
        {termsConditions.length > 0 && (
          <div style={{ borderTop: "1px solid #000", padding: "4px", fontSize: "10px" }}>
            <strong>Terms & Conditions:</strong>
            <ul style={{ margin: "2px 0 0 12px", padding: 0 }}>
              {termsConditions.map((term, i) => (
                <li key={i}>{term}</li>
              ))}
            </ul>
          </div>
        )}
        {qrCodeUrl && (
          <div style={{ padding: "4px" }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: "80px", height: "80px" }} />
          </div>
        )}
        {notes && (
          <div style={{ padding: "4px", fontSize: "10px", borderTop: "1px solid #000" }}>
            <strong>Note:</strong> {notes}
          </div>
        )}
        {/* Signature */}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #000", padding: "4px" }}>
          <div style={{ fontSize: "9px" }}>E. & O.E.</div>
          <div style={{ fontSize: "9px", textAlign: "center" }}>
            <div style={{ marginTop: "20px", borderTop: "1px solid #000", width: "100px", paddingTop: "2px" }}>Authorized Signatory</div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          @page { 
            size: ${isA4 ? "A4 portrait" : "A5 portrait"}; 
            margin: 0; 
          }
          .retail-invoice-template {
            width: ${isA4 ? "210mm" : "148mm"} !important;
            height: ${isA4 ? "297mm" : "210mm"} !important;
            padding: ${isA4 ? "8mm" : "5mm"} !important;
            page-break-after: always;
            border: 2px solid #000 !important;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
};
