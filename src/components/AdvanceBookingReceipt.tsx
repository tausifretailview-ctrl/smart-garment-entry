import { forwardRef } from "react";
import { format } from "date-fns";

interface AdvanceReceiptData {
  advanceNumber: string;
  advanceDate: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  paymentMethod: string;
  chequeNumber?: string;
  transactionId?: string;
  description?: string;
}

interface CompanyDetails {
  businessName: string;
  address?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
}

interface AdvanceBookingReceiptProps {
  data: AdvanceReceiptData;
  company: CompanyDetails;
  paperSize: "A4" | "A5";
}

const paymentMethodLabel = (method: string) => {
  const map: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    upi: "UPI",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
  };
  return map[method] || method;
};

const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart) + " Rupees";
  if (decPart > 0) result += " and " + convert(decPart) + " Paise";
  return result + " Only";
};

export const AdvanceBookingReceipt = forwardRef<HTMLDivElement, AdvanceBookingReceiptProps>(
  ({ data, company, paperSize }, ref) => {
    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const isA5 = paperSize === "A5";

    return (
      <div ref={ref} style={{ display: "none" }}>
        <div
          style={{
            width: isA5 ? "148mm" : "210mm",
            minHeight: isA5 ? "210mm" : "297mm",
            padding: isA5 ? "8mm" : "15mm",
            fontFamily: "'Inter', Arial, sans-serif",
            fontSize: isA5 ? "11px" : "13px",
            color: "#1a1a1a",
            background: "#fff",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "2px solid #333", paddingBottom: isA5 ? "6px" : "10px", marginBottom: isA5 ? "8px" : "14px" }}>
            <h1 style={{ margin: 0, fontSize: isA5 ? "18px" : "22px", fontWeight: 700, color: "#111" }}>
              {company.businessName}
            </h1>
            {company.address && (
              <p style={{ margin: "2px 0 0", fontSize: isA5 ? "9px" : "11px", color: "#555" }}>{company.address}</p>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "2px", fontSize: isA5 ? "9px" : "10px", color: "#555" }}>
              {company.phone && <span>📞 {company.phone}</span>}
              {company.email && <span>✉ {company.email}</span>}
              {company.gstNumber && <span>GSTIN: {company.gstNumber}</span>}
            </div>
          </div>

          {/* Title */}
          <div style={{
            textAlign: "center",
            margin: isA5 ? "8px 0" : "12px 0",
            padding: isA5 ? "6px" : "8px",
            background: "#f0f0f0",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}>
            <h2 style={{ margin: 0, fontSize: isA5 ? "14px" : "17px", fontWeight: 700, letterSpacing: "1px" }}>
              ADVANCE BOOKING RECEIPT
            </h2>
          </div>

          {/* Details Grid */}
          <table style={{ width: "100%", marginBottom: isA5 ? "10px" : "16px", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 0", fontSize: isA5 ? "10px" : "12px", color: "#666", width: "30%" }}>Receipt No.</td>
                <td style={{ padding: "4px 0", fontWeight: 600 }}>{data.advanceNumber}</td>
                <td style={{ padding: "4px 0", fontSize: isA5 ? "10px" : "12px", color: "#666", width: "20%", textAlign: "right" }}>Date</td>
                <td style={{ padding: "4px 0", fontWeight: 600, textAlign: "right" }}>
                  {data.advanceDate ? format(new Date(data.advanceDate), "dd/MM/yyyy") : "-"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0", fontSize: isA5 ? "10px" : "12px", color: "#666" }}>Customer Name</td>
                <td style={{ padding: "4px 0", fontWeight: 600 }} colSpan={3}>{data.customerName}</td>
              </tr>
              {data.customerPhone && (
                <tr>
                  <td style={{ padding: "4px 0", fontSize: isA5 ? "10px" : "12px", color: "#666" }}>Phone</td>
                  <td style={{ padding: "4px 0" }} colSpan={3}>{data.customerPhone}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Amount Section */}
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: isA5 ? "10px" : "16px",
            border: "1px solid #ddd",
          }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: isA5 ? "6px 8px" : "8px 12px", textAlign: "left", borderBottom: "1px solid #ddd", fontSize: isA5 ? "10px" : "12px" }}>Description</th>
                <th style={{ padding: isA5 ? "6px 8px" : "8px 12px", textAlign: "center", borderBottom: "1px solid #ddd", fontSize: isA5 ? "10px" : "12px" }}>Payment Mode</th>
                <th style={{ padding: isA5 ? "6px 8px" : "8px 12px", textAlign: "right", borderBottom: "1px solid #ddd", fontSize: isA5 ? "10px" : "12px" }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: isA5 ? "8px" : "10px 12px", borderBottom: "1px solid #eee" }}>
                  Advance Payment
                  {data.description && (
                    <div style={{ fontSize: isA5 ? "9px" : "10px", color: "#666", marginTop: "2px" }}>
                      Note: {data.description}
                    </div>
                  )}
                </td>
                <td style={{ padding: isA5 ? "8px" : "10px 12px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                  {paymentMethodLabel(data.paymentMethod)}
                  {data.chequeNumber && (
                    <div style={{ fontSize: isA5 ? "9px" : "10px", color: "#666" }}>Chq: {data.chequeNumber}</div>
                  )}
                  {data.transactionId && (
                    <div style={{ fontSize: isA5 ? "9px" : "10px", color: "#666" }}>Txn: {data.transactionId}</div>
                  )}
                </td>
                <td style={{ padding: isA5 ? "8px" : "10px 12px", textAlign: "right", fontWeight: 700, fontSize: isA5 ? "13px" : "16px", borderBottom: "1px solid #eee" }}>
                  ₹{fmt(data.amount)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: "#f9f9f9" }}>
                <td colSpan={2} style={{ padding: isA5 ? "8px" : "10px 12px", fontWeight: 700, textAlign: "right", borderTop: "2px solid #333" }}>
                  Total Advance Received
                </td>
                <td style={{ padding: isA5 ? "8px" : "10px 12px", fontWeight: 700, textAlign: "right", fontSize: isA5 ? "14px" : "18px", borderTop: "2px solid #333" }}>
                  ₹{fmt(data.amount)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Amount in Words */}
          <div style={{
            padding: isA5 ? "6px 8px" : "8px 12px",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: "4px",
            marginBottom: isA5 ? "12px" : "20px",
            fontSize: isA5 ? "10px" : "11px",
          }}>
            <strong>Amount in Words:</strong> {numberToWords(data.amount)}
          </div>

          {/* Signature Section */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: isA5 ? "30px" : "50px",
            paddingTop: "8px",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", width: isA5 ? "100px" : "140px", paddingTop: "4px", fontSize: isA5 ? "9px" : "10px", color: "#666" }}>
                Customer Signature
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #999", width: isA5 ? "100px" : "140px", paddingTop: "4px", fontSize: isA5 ? "9px" : "10px", color: "#666" }}>
                Authorized Signature
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            textAlign: "center",
            marginTop: isA5 ? "12px" : "20px",
            paddingTop: "8px",
            borderTop: "1px solid #ddd",
            fontSize: isA5 ? "8px" : "9px",
            color: "#999",
          }}>
            This is a computer-generated receipt. Thank you for your advance payment.
          </div>
        </div>
      </div>
    );
  }
);

AdvanceBookingReceipt.displayName = "AdvanceBookingReceipt";
