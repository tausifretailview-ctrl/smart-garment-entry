import { forwardRef } from "react";
import { format } from "date-fns";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import {
  getPosDocumentPrintPageStyle,
  resolvePosBillFormatFromSaleSettings,
  resolvePosThermalPaper,
} from "@/utils/invoicePrintFormat";
import { getThermalReceiptPageStyleFragment } from "@/utils/thermalReceiptPrintDocument";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AdvanceReceiptPaper = "A4" | "A5" | PosThermalPaper;

export const isThermalAdvancePaper = (paper: AdvanceReceiptPaper): paper is PosThermalPaper =>
  paper === "80mm" || paper === "58mm";

/** Shops whose POS bill is thermal get the thermal roll by default (Settings → POS paper width). */
export function defaultAdvanceReceiptPaper(settings: unknown): AdvanceReceiptPaper {
  const s = settings as {
    sale_settings?: Parameters<typeof resolvePosBillFormatFromSaleSettings>[0];
    bill_barcode_settings?: { direct_print_pos_paper?: string } | null;
  } | null | undefined;
  if (!s) return "A5";
  if (resolvePosBillFormatFromSaleSettings(s.sale_settings ?? null) !== "thermal") return "A5";
  return resolvePosThermalPaper(s.bill_barcode_settings?.direct_print_pos_paper);
}

const PAPER_STORAGE_KEY = "ezzy.advanceReceiptPaper";
const PAPERS: AdvanceReceiptPaper[] = ["A4", "A5", "80mm", "58mm"];

/** Last paper picked on this device, else the shop default. */
export function initialAdvanceReceiptPaper(settings: unknown): AdvanceReceiptPaper {
  try {
    const saved = localStorage.getItem(PAPER_STORAGE_KEY) as AdvanceReceiptPaper | null;
    if (saved && PAPERS.includes(saved)) return saved;
  } catch {
    // storage unavailable
  }
  return defaultAdvanceReceiptPaper(settings);
}

export function rememberAdvanceReceiptPaper(paper: AdvanceReceiptPaper): void {
  try {
    localStorage.setItem(PAPER_STORAGE_KEY, paper);
  } catch {
    // storage unavailable
  }
}

export function AdvanceReceiptPaperSelect({
  value,
  onChange,
}: {
  value: AdvanceReceiptPaper;
  onChange: (paper: AdvanceReceiptPaper) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const paper = v as AdvanceReceiptPaper;
        rememberAdvanceReceiptPaper(paper);
        onChange(paper);
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="80mm">Thermal 80mm (Receipt Printer)</SelectItem>
        <SelectItem value="58mm">Thermal 58mm (Receipt Printer)</SelectItem>
        <SelectItem value="A5">A5 (Half Page)</SelectItem>
        <SelectItem value="A4">A4 (Full Page)</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** react-to-print `pageStyle` for thermal rolls; A4/A5 keep the library default. */
export function advanceReceiptPageStyle(paper: AdvanceReceiptPaper): string | undefined {
  if (!isThermalAdvancePaper(paper)) return undefined;
  return getPosDocumentPrintPageStyle("thermal", paper, getThermalReceiptPageStyleFragment(paper));
}

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
  paperSize: AdvanceReceiptPaper;
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

    if (isThermalAdvancePaper(paperSize)) {
      return <AdvanceThermalReceipt ref={ref} data={data} company={company} paper={paperSize} />;
    }

    return (
      <div ref={ref} className="invoice-print-source-screen">
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

const AdvanceThermalReceipt = forwardRef<
  HTMLDivElement,
  { data: AdvanceReceiptData; company: CompanyDetails; paper: PosThermalPaper }
>(({ data, company, paper }, ref) => {
  const is58 = paper === "58mm";
  const contentWidth = is58 ? "52mm" : "72mm";
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const base: React.CSSProperties = {
    width: contentWidth,
    maxWidth: contentWidth,
    padding: is58 ? "2mm 1mm 2mm 2mm" : "2mm 2mm 2mm 4mm",
    backgroundColor: "white",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: is58 ? "11px" : "13px",
    lineHeight: 1.45,
    color: "#000",
    fontWeight: 700,
    boxSizing: "border-box",
    overflow: "hidden",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const center: React.CSSProperties = { textAlign: "center", width: "100%" };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", width: "100%", gap: "4px" };
  const dblLine: React.CSSProperties = { borderTop: "2px solid #000", margin: "3px 0" };
  const dashLine: React.CSSProperties = { borderTop: "1px dashed #000", margin: "3px 0" };
  const right: React.CSSProperties = { textAlign: "right", wordBreak: "break-word" };

  return (
    <div ref={ref} className={`invoice-print-source-screen${is58 ? " thermal-paper-58" : ""}`}>
      <div
        className={`thermal-print-80mm thermal-receipt-container advance-thermal-receipt${is58 ? " thermal-paper-58" : ""}`}
        style={base}
        data-print-format="thermal"
        data-thermal-paper={paper}
      >
        <div style={dblLine} />
        <div style={{ ...center, marginBottom: "4px" }}>
          <div style={{ fontWeight: 900, fontSize: is58 ? "14px" : "16px", textTransform: "uppercase", wordBreak: "break-word" }}>
            {company.businessName}
          </div>
          {company.address && (
            <div style={{ fontSize: "11px", lineHeight: 1.3, wordBreak: "break-word", marginTop: "2px" }}>{company.address}</div>
          )}
          {company.phone && <div style={{ fontSize: "11px" }}>Ph: {company.phone}</div>}
          {company.gstNumber && <div style={{ fontSize: "11px", fontWeight: 900 }}>GSTIN: {company.gstNumber}</div>}
        </div>
        <div style={dblLine} />

        <div style={{ ...center, fontWeight: 900, fontSize: is58 ? "13px" : "15px", letterSpacing: "0.5px", margin: "2px 0" }}>
          ADVANCE RECEIPT
        </div>
        <div style={dashLine} />

        <div style={row}>
          <span>Receipt No</span>
          <span style={right}>{data.advanceNumber}</span>
        </div>
        <div style={row}>
          <span>Date</span>
          <span style={right}>{data.advanceDate ? format(new Date(data.advanceDate), "dd/MM/yyyy") : "-"}</span>
        </div>
        <div style={row}>
          <span>Customer</span>
          <span style={right}>{data.customerName}</span>
        </div>
        {data.customerPhone && (
          <div style={row}>
            <span>Mobile</span>
            <span style={right}>{data.customerPhone}</span>
          </div>
        )}
        <div style={dashLine} />

        <div style={row}>
          <span>Payment Mode</span>
          <span style={right}>{paymentMethodLabel(data.paymentMethod)}</span>
        </div>
        {data.chequeNumber && (
          <div style={row}>
            <span>Cheque No</span>
            <span style={right}>{data.chequeNumber}</span>
          </div>
        )}
        {data.transactionId && (
          <div style={row}>
            <span>Txn ID</span>
            <span style={right}>{data.transactionId}</span>
          </div>
        )}
        {data.description && (
          <div style={{ wordBreak: "break-word", marginTop: "2px" }}>Note: {data.description}</div>
        )}
        <div style={dblLine} />

        <div style={{ ...row, fontWeight: 900, fontSize: is58 ? "14px" : "17px", margin: "2px 0" }}>
          <span>ADVANCE</span>
          <span>₹{fmt(data.amount)}</span>
        </div>
        <div style={dblLine} />
        <div style={{ fontSize: "11px", wordBreak: "break-word" }}>{numberToWords(data.amount)}</div>
        <div style={dashLine} />

        <div style={{ ...row, marginTop: "24px", fontSize: "11px" }}>
          <span style={{ borderTop: "1px solid #000", paddingTop: "2px" }}>Customer Sign</span>
          <span style={{ borderTop: "1px solid #000", paddingTop: "2px" }}>Authorised Sign</span>
        </div>
        <div style={{ ...center, marginTop: "8px", fontSize: "11px" }}>Thank you!</div>
        <div style={dblLine} />
      </div>
    </div>
  );
});

AdvanceThermalReceipt.displayName = "AdvanceThermalReceipt";
