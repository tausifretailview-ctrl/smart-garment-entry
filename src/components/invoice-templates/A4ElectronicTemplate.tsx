import React from "react";
import { numberToWords } from "@/lib/utils";
import { splitLineGstFromTotal } from "@/utils/gstRegisterUtils";

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
  model?: string;
  model_no?: string;
  modelNo?: string;
  serial?: string;
  serial_no?: string;
  serialNo?: string;
  imei?: string;
}

interface A4ElectronicTemplateProps {
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
  shippingAddress?: string;
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
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  paidAmount?: number;
  previousBalance?: number;
  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  format?: "a5-vertical" | "a5-horizontal" | "a4";
  stampImageBase64?: string;
}

const GOLD = "#c4a035";
const GOLD_LIGHT = "#f5ecd6";
const NAVY = "#1e3a5f";
const BORDER = "1px solid #333";
const TAN_BG = "#f3e8d4";

const fmt = (amount: number): string =>
  amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

const getStateFromGSTIN = (gstin?: string): string => {
  if (!gstin || gstin.length < 2) return "";
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
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
  };
  return m[gstin.substring(0, 2)] || "";
};

const panFromGst = (gst?: string): string => {
  if (!gst || gst.length < 12) return "";
  return gst.substring(2, 12);
};

const pickModelNo = (item: InvoiceItem): string => {
  const raw = item.model ?? item.model_no ?? item.modelNo ?? item.style ?? "";
  const s = String(raw || "").trim();
  return s || "-";
};

const pickSerialNo = (item: InvoiceItem): string => {
  const raw = item.serial ?? item.serial_no ?? item.serialNo ?? item.imei ?? item.barcode ?? "";
  const s = String(raw || "").trim();
  return s || "-";
};

const CornerFlourish = ({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) => {
  const style: React.CSSProperties = {
    position: "absolute",
    width: "18px",
    height: "18px",
    borderColor: GOLD,
    borderStyle: "solid",
    ...(pos === "tl" ? { top: 4, left: 4, borderWidth: "3px 0 0 3px" } : {}),
    ...(pos === "tr" ? { top: 4, right: 4, borderWidth: "3px 3px 0 0" } : {}),
    ...(pos === "bl" ? { bottom: 4, left: 4, borderWidth: "0 0 3px 3px" } : {}),
    ...(pos === "br" ? { bottom: 4, right: 4, borderWidth: "0 3px 3px 0" } : {}),
  };
  return <div style={style} aria-hidden />;
};

export const A4ElectronicTemplate: React.FC<A4ElectronicTemplateProps> = ({
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
  shippingAddress,
  items,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  totalTax,
  grandTotal,
  amountPaid,
  balanceDue,
  cashAmount = 0,
  cardAmount = 0,
  upiAmount = 0,
  creditAmount = 0,
  paidAmount = 0,
  previousBalance = 0,
  qrCodeUrl,
  upiId,
  bankDetails,
  showGSTBreakdown = true,
  showBankDetails = true,
  showReceivedAmount = false,
  showBalanceAmount = false,
  showPartyBalance = false,
  stampImageBase64,
}) => {
  const normBank = bankDetails
    ? {
        bankName: bankDetails.bankName || bankDetails.bank_name || "",
        accountNumber: bankDetails.accountNumber || bankDetails.account_number || "",
        ifscCode: bankDetails.ifscCode || bankDetails.ifsc_code || "",
        accountHolder: bankDetails.accountHolder || bankDetails.account_holder || "",
      }
    : null;

  const placeOfSupply =
    getStateFromGSTIN(customerGSTIN) || getStateFromGSTIN(gstNumber) || "";
  const shipAddr = shippingAddress?.trim() ? shippingAddress : customerAddress;
  const pan = panFromGst(gstNumber);

  const mixTender = (Number(cashAmount) || 0) + (Number(upiAmount) || 0) + (Number(cardAmount) || 0) + (Number(creditAmount) || 0);
  const receivedAmount = mixTender > 0 ? mixTender : Number(amountPaid ?? paidAmount ?? 0);
  const balance =
    balanceDue !== undefined && balanceDue !== null
      ? Number(balanceDue)
      : Math.max(0, grandTotal - receivedAmount);
  const currentBalance = balance;
  const showPaymentRows = showReceivedAmount || showBalanceAmount || showPartyBalance || receivedAmount > 0 || previousBalance > 0;

  const lineRows = items.map((item) => {
    const gstPct = item.gstPercent || 0;
    const { gst: lineTax } = splitLineGstFromTotal(item.total, gstPct);
    return { item, gstPct, lineTax };
  });

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const subtotalTax = lineRows.reduce((s, r) => s + r.lineTax, 0);
  const subtotalAmount = items.reduce((s, i) => s + i.total, 0);

  const cgstRatePct =
    taxableAmount > 0 && cgstAmount > 0 ? Math.round((cgstAmount / taxableAmount) * 100) : 0;
  const sgstRatePct = cgstRatePct;
  const useIgst = igstAmount > 0 && cgstAmount === 0 && sgstAmount === 0;
  const igstRatePct =
    taxableAmount > 0 && igstAmount > 0 ? Math.round((igstAmount / taxableAmount) * 100) : 0;

  const cell: React.CSSProperties = {
    border: BORDER,
    padding: "4px 6px",
    fontSize: "10px",
    verticalAlign: "top",
    color: "#111",
  };
  const th: React.CSSProperties = {
    ...cell,
    background: TAN_BG,
    fontWeight: 700,
    textAlign: "center",
  };

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        background: "#fff",
        color: "#111",
        fontFamily: "Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
        padding: "8mm",
      }}
    >
      <div
        style={{
          position: "relative",
          border: `3px double ${GOLD}`,
          padding: "10px 12px 14px",
          minHeight: "281mm",
          boxSizing: "border-box",
          background: "#fffef8",
        }}
      >
        <CornerFlourish pos="tl" />
        <CornerFlourish pos="tr" />
        <CornerFlourish pos="bl" />
        <CornerFlourish pos="br" />

        {/* Header */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "8px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              border: BORDER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "#fff",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" style={{ maxWidth: "68px", maxHeight: "68px", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "22px", fontWeight: 800, color: NAVY }}>{businessName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: NAVY, letterSpacing: "0.5px", lineHeight: 1.15 }}>
              {businessName}
            </div>
            <div style={{ fontSize: "10px", marginTop: "4px" }}>
              {pan ? (
                <>
                  <strong>Pan No</strong> {pan}
                  {gstNumber ? (
                    <>
                      {"   "}
                      <strong>GSTIN</strong> {gstNumber}
                    </>
                  ) : null}
                </>
              ) : gstNumber ? (
                <>
                  <strong>GSTIN</strong> {gstNumber}
                </>
              ) : null}
            </div>
            <div style={{ fontSize: "10px", marginTop: "2px" }}>
              {mobile ? (
                <span>
                  ☎ {mobile}
                  {email ? "   ✉ " : ""}
                </span>
              ) : null}
              {email ? <span>{email}</span> : null}
            </div>
            <div style={{ fontSize: "10px", marginTop: "2px", lineHeight: 1.35 }}>
              📍 {address}
            </div>
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, alignSelf: "flex-start", paddingTop: "4px" }}>TAX INVOICE</div>
        </div>
        <hr style={{ border: "none", borderTop: `1px solid ${GOLD}`, margin: "0 0 8px" }} />

        {/* Meta row */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px" }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: "50%" }}>
                <strong>Invoice No.</strong> {invoiceNumber}
              </td>
              <td style={{ ...cell, width: "50%" }}>
                <strong>Invoice Date</strong> {formatDate(invoiceDate)}
                {invoiceTime ? ` ${invoiceTime}` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Bill To / Ship To */}
        <div style={{ display: "flex", border: BORDER, marginBottom: "8px" }}>
          <div style={{ flex: 1, padding: "8px", borderRight: BORDER, fontSize: "10px" }}>
            <div style={{ fontWeight: 700, marginBottom: "4px", textDecoration: "underline" }}>Bill To</div>
            <div style={{ fontWeight: 700, fontSize: "11px" }}>{customerName}</div>
            {customerAddress ? (
              <div style={{ marginTop: "4px", whiteSpace: "pre-line", lineHeight: 1.35 }}>{customerAddress}</div>
            ) : null}
            {customerMobile ? (
              <div style={{ marginTop: "4px" }}>
                <strong>Mobile</strong> {customerMobile}
              </div>
            ) : null}
            {placeOfSupply ? (
              <div style={{ marginTop: "4px" }}>
                <strong>Place of Supply</strong> {placeOfSupply}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, padding: "8px", fontSize: "10px" }}>
            <div style={{ fontWeight: 700, marginBottom: "4px", textDecoration: "underline" }}>Ship To</div>
            <div style={{ fontWeight: 700, fontSize: "11px" }}>{customerName}</div>
            {shipAddr ? (
              <div style={{ marginTop: "4px", whiteSpace: "pre-line", lineHeight: 1.35 }}>{shipAddr}</div>
            ) : null}
            {customerMobile ? (
              <div style={{ marginTop: "4px" }}>
                <strong>Mobile</strong> {customerMobile}
              </div>
            ) : null}
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "4%" }}>No</th>
              <th style={{ ...th, width: "28%" }}>Items</th>
              <th style={{ ...th, width: "12%" }}>MODEL NO -</th>
              <th style={{ ...th, width: "14%" }}>SERIAL NO -</th>
              <th style={{ ...th, width: "7%", textAlign: "right" }}>Qty.</th>
              <th style={{ ...th, width: "11%", textAlign: "right" }}>Rate</th>
              <th style={{ ...th, width: "12%", textAlign: "right" }}>Tax</th>
              <th style={{ ...th, width: "12%", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.map(({ item, gstPct, lineTax }, idx) => (
              <tr key={idx}>
                <td style={{ ...cell, textAlign: "center" }}>{item.sr || idx + 1}</td>
                <td style={{ ...cell }}>
                  <div>{item.particulars}</div>
                  {(item.color || item.itemNotes) && (
                    <div style={{ fontSize: "9px", color: "#444", marginTop: "2px" }}>
                      {[item.color, item.itemNotes].filter(Boolean).join(" — ")}
                    </div>
                  )}
                </td>
                <td style={{ ...cell, textAlign: "center" }}>{pickModelNo(item)}</td>
                <td style={{ ...cell, textAlign: "center", fontSize: "9px" }}>{pickSerialNo(item)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{item.qty}</td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(item.rate)}</td>
                <td style={{ ...cell, textAlign: "right" }}>
                  <div>{fmt(lineTax)}</div>
                  {gstPct > 0 ? (
                    <div style={{ fontSize: "8px", color: "#555" }}>({gstPct}%)</div>
                  ) : null}
                </td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(item.total)}</td>
              </tr>
            ))}
            <tr style={{ background: TAN_BG, fontWeight: 700 }}>
              <td style={{ ...cell }} colSpan={4}>
                SUBTOTAL
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{totalQty}</td>
              <td style={{ ...cell }} />
              <td style={{ ...cell, textAlign: "right" }}>{fmt(subtotalTax)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{fmt(subtotalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Bottom section */}
        <div style={{ display: "flex", gap: "10px", marginTop: "10px", alignItems: "flex-start" }}>
          <div style={{ flex: 1, fontSize: "10px" }}>
            {showBankDetails && normBank && (normBank.bankName || normBank.accountNumber) ? (
              <div style={{ border: BORDER, padding: "8px", marginBottom: "8px", background: "#fff" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px", textDecoration: "underline" }}>Bank Details</div>
                {normBank.accountHolder ? (
                  <div>
                    <strong>Name</strong> {normBank.accountHolder}
                  </div>
                ) : null}
                {normBank.ifscCode ? (
                  <div>
                    <strong>IFSC</strong> {normBank.ifscCode}
                  </div>
                ) : null}
                {normBank.accountNumber ? (
                  <div>
                    <strong>Account No</strong> {normBank.accountNumber}
                  </div>
                ) : null}
                {normBank.bankName ? (
                  <div>
                    <strong>Bank Name</strong> {normBank.bankName}
                  </div>
                ) : null}
              </div>
            ) : null}
            {qrCodeUrl ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "9px", fontWeight: 600, marginBottom: "4px" }}>Payment QR Code</div>
                <img src={qrCodeUrl} alt="Payment QR" style={{ width: "110px", height: "110px", border: BORDER }} />
                {upiId ? (
                  <div style={{ marginTop: "4px", fontSize: "9px" }}>
                    <strong>UPI ID</strong> {upiId}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ width: "48%", fontSize: "10px", border: BORDER, padding: "8px", background: "#fff" }}>
            {showGSTBreakdown ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>Taxable Amount</span>
                  <span>₹{fmt(taxableAmount)}</span>
                </div>
                {useIgst ? (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span>IGST @{igstRatePct}%</span>
                    <span>₹{fmt(igstAmount)}</span>
                  </div>
                ) : (
                  <>
                    {cgstAmount > 0 ? (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>CGST @{cgstRatePct}%</span>
                        <span>₹{fmt(cgstAmount)}</span>
                      </div>
                    ) : null}
                    {sgstAmount > 0 ? (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>SGST @{sgstRatePct}%</span>
                        <span>₹{fmt(sgstAmount)}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : totalTax > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Total Tax</span>
                <span>₹{fmt(totalTax)}</span>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontWeight: 800,
                fontSize: "12px",
                borderTop: BORDER,
                marginTop: "4px",
              }}
            >
              <span>Total Amount</span>
              <span>₹{fmt(grandTotal)}</span>
            </div>
            {showPaymentRows ? (
              <>
                {(showReceivedAmount || receivedAmount > 0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span>Received Amount</span>
                    <span>₹{fmt(receivedAmount)}</span>
                  </div>
                )}
                {(showBalanceAmount || balance > 0) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "2px 0",
                      fontWeight: 700,
                    }}
                  >
                    <span>Balance</span>
                    <span>₹{fmt(balance)}</span>
                  </div>
                )}
                {(showPartyBalance || previousBalance > 0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span>Previous Balance</span>
                    <span>₹{fmt(previousBalance)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "2px 0",
                    fontWeight: 700,
                  }}
                >
                  <span>Current Balance</span>
                  <span>₹{fmt(currentBalance + previousBalance)}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Amount in words */}
        <div style={{ marginTop: "10px", fontSize: "10px", border: BORDER, padding: "6px 8px", background: GOLD_LIGHT }}>
          <strong>Total Amount (in words):</strong> {numberToWords(grandTotal)} Only
        </div>

        {/* Signature */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <div
            style={{
              width: "180px",
              border: BORDER,
              padding: "8px",
              textAlign: "center",
              minHeight: "70px",
              position: "relative",
            }}
          >
            {stampImageBase64 ? (
              <img
                src={stampImageBase64}
                alt="Signature"
                style={{
                  maxWidth: "100%",
                  maxHeight: "48px",
                  objectFit: "contain",
                  margin: "0 auto 4px",
                  display: "block",
                }}
              />
            ) : (
              <div style={{ height: "40px" }} />
            )}
            <div style={{ fontSize: "9px", fontWeight: 600 }}>Signature</div>
            <div style={{ fontSize: "9px", marginTop: "2px", fontWeight: 700 }}>{businessName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
