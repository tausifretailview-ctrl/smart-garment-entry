import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { numberToWords } from "@/lib/utils";
import { splitLineGstFromTotal } from "@/utils/gstRegisterUtils";

const MAX_ITEM_ROWS = 3;

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
  gstPercent?: number;
  itemNotes?: string;
  imei?: string;
}

export interface KrishnaMobileA5TemplateProps {
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
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  grandTotal: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  paidAmount?: number;
  qrCodeUrl?: string;
  upiId?: string;
  termsConditions?: string[];
  stampImageBase64?: string;
}

const BORDER = "1px solid #222";
const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (date: Date, time?: string) => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const base = `${d}-${m}-${y}`;
  return time ? `${base} ${time}` : base;
};

const pickImei = (item: InvoiceItem): string => {
  const raw = item.imei ?? item.barcode ?? "";
  return String(raw || "").trim();
};

const paymentLabel = (p: KrishnaMobileA5TemplateProps): string => {
  const parts: string[] = [];
  const cash = Number(p.cashAmount) || 0;
  const card = Number(p.cardAmount) || 0;
  const upi = Number(p.upiAmount) || 0;
  const credit = Number(p.creditAmount) || 0;
  if (card > 0) parts.push(`Card Paid: ${fmt(card)}`);
  if (upi > 0) parts.push(`UPI Paid: ${fmt(upi)}`);
  if (cash > 0) parts.push(`Cash Paid: ${fmt(cash)}`);
  if (credit > 0) parts.push(`Credit: ${fmt(credit)}`);
  if (parts.length === 0 && (p.paidAmount || 0) > 0) {
    parts.push(`Paid: ${fmt(Number(p.paidAmount) || 0)}`);
  }
  if (parts.length === 0 && p.paymentMethod) {
    parts.push(p.paymentMethod);
  }
  return parts.join("   ");
};

export const KrishnaMobileA5Template: React.FC<KrishnaMobileA5TemplateProps> = (props) => {
  const {
    businessName,
    address,
    mobile,
    gstNumber,
    logoUrl,
    invoiceNumber,
    invoiceDate,
    invoiceTime,
    customerName,
    customerAddress,
    customerMobile,
    items,
    taxableAmount,
    cgstAmount = 0,
    sgstAmount = 0,
    igstAmount = 0,
    totalTax,
    grandTotal,
    qrCodeUrl,
    upiId,
    termsConditions,
    stampImageBase64,
  } = props;

  const [companyQrUrl, setCompanyQrUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!upiId?.trim()) {
        setCompanyQrUrl("");
        return;
      }
      try {
        const url = await QRCode.toDataURL(
          `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(businessName || "Store")}&cu=INR`,
          { width: 160, margin: 1, errorCorrectionLevel: "M" },
        );
        if (!cancelled) setCompanyQrUrl(url);
      } catch {
        if (!cancelled) setCompanyQrUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [upiId, businessName]);

  const displayItems = items.slice(0, MAX_ITEM_ROWS);
  const paddedRows: (InvoiceItem | null)[] = [...displayItems];
  while (paddedRows.length < MAX_ITEM_ROWS) paddedRows.push(null);

  const lineMeta = displayItems.map((item) => {
    const gstPct = item.gstPercent || 0;
    const { taxable, gst } = splitLineGstFromTotal(item.total, gstPct);
    const half = gst / 2;
    return { item, gstPct, taxable, cgst: half, sgst: half, igst: gst };
  });

  const useIgst = igstAmount > 0 && cgstAmount === 0 && sgstAmount === 0;
  const totalQty = displayItems.reduce((s, i) => s + i.qty, 0);
  const words = numberToWords(Math.round(grandTotal));

  const cell: React.CSSProperties = {
    border: BORDER,
    padding: "2px 4px",
    fontSize: "8px",
    verticalAlign: "top",
    lineHeight: 1.25,
  };
  const th: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    textAlign: "center",
    background: "#f3f4f6",
    fontSize: "7.5px",
  };

  const defaultTerms = [
    "No returns or exchange on sold goods.",
    "1 Year service centre warranty on handset (as per brand).",
    "6 months warranty on accessories (as per brand).",
    "No warranty for physical / liquid damage.",
  ];
  const terms = (termsConditions?.length ? termsConditions : defaultTerms).slice(0, 4);

  return (
    <div
      className="krishna-mobile-a5-invoice"
      data-invoice-variant="krishna-mobile-a5"
      style={{
        width: "210mm",
        minHeight: "148mm",
        maxHeight: "148mm",
        margin: "0 auto",
        padding: "4mm 5mm",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <style>{`
        @media print {
          @page { size: A5 landscape; margin: 4mm; }
          .krishna-mobile-a5-invoice {
            width: 210mm !important;
            min-height: 148mm !important;
            max-height: 148mm !important;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "4px" }}>
        <div
          style={{
            width: "52px",
            height: "52px",
            border: BORDER,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: "10px", fontWeight: 800, textAlign: "center", padding: "2px" }}>
              {businessName.slice(0, 12)}
            </span>
          )}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.3px", lineHeight: 1.1 }}>
            {businessName}
          </div>
          <div style={{ fontSize: "8px", marginTop: "2px", lineHeight: 1.3 }}>{address}</div>
          <div style={{ fontSize: "8px", marginTop: "2px" }}>
            {mobile ? <>Mobile: {mobile}</> : null}
            {gstNumber ? (
              <>
                {mobile ? "   " : ""}
                <strong>GSTIN:</strong> {gstNumber}
              </>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: "11px", fontWeight: 800, alignSelf: "center", whiteSpace: "nowrap" }}>
          TAX INVOICE
        </div>
      </div>

      {/* Bill meta + customer */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px" }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: "50%" }}>
              <strong>Bill No:</strong> {invoiceNumber}
            </td>
            <td style={{ ...cell, width: "50%" }}>
              <strong>Date &amp; Time:</strong> {formatDateTime(invoiceDate, invoiceTime)}
            </td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}>
              <strong>Customer:</strong> {customerName}
              {customerMobile ? (
                <>
                  {"   "}
                  <strong>Mobile No:</strong> {customerMobile}
                </>
              ) : null}
            </td>
          </tr>
          {customerAddress?.trim() ? (
            <tr>
              <td style={cell} colSpan={2}>
                <strong>Address:</strong> {customerAddress}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "4%" }}>SR</th>
            <th style={{ ...th, width: "28%" }}>PARTICULARS</th>
            <th style={{ ...th, width: "8%" }}>HSN</th>
            <th style={{ ...th, width: "4%" }}>SP</th>
            <th style={{ ...th, width: "5%" }}>QTY</th>
            <th style={{ ...th, width: "9%" }}>MRP/RATE</th>
            <th style={{ ...th, width: "10%" }}>TAXABLE</th>
            <th style={{ ...th, width: "8%" }}>CGST %</th>
            <th style={{ ...th, width: "8%" }}>CGST ₹</th>
            <th style={{ ...th, width: "8%" }}>SGST %</th>
            <th style={{ ...th, width: "8%" }}>SGST ₹</th>
            <th style={{ ...th, width: "10%" }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {paddedRows.map((item, idx) => {
            if (!item) {
              return (
                <tr key={`blank-${idx}`} style={{ height: "28px" }}>
                  <td style={cell}>&nbsp;</td>
                  <td style={cell} colSpan={11}>&nbsp;</td>
                </tr>
              );
            }
            const meta = lineMeta.find((m) => m.item.sr === item.sr || m.item === item);
            const gstPct = meta?.gstPct ?? item.gstPercent ?? 0;
            const taxable = meta?.taxable ?? item.total;
            const cgst = useIgst ? 0 : meta?.cgst ?? 0;
            const sgst = useIgst ? 0 : meta?.sgst ?? 0;
            const imei = pickImei(item);
            const halfRate = useIgst ? 0 : gstPct / 2;
            return (
              <tr key={item.sr ?? idx} style={{ height: "28px" }}>
                <td style={{ ...cell, textAlign: "center" }}>{item.sr || idx + 1}</td>
                <td style={cell}>
                  <div style={{ fontWeight: 600, fontSize: "8.5px" }}>{item.particulars}</div>
                  {imei || item.itemNotes ? (
                    <div style={{ fontSize: "7px", color: "#333", marginTop: "1px" }}>
                      {imei ? <>IMEI/BC: {imei}</> : null}
                      {imei && item.itemNotes ? " — " : null}
                      {item.itemNotes || null}
                    </div>
                  ) : null}
                </td>
                <td style={{ ...cell, textAlign: "center", fontSize: "7px" }}>{item.hsn || "—"}</td>
                <td style={{ ...cell, textAlign: "center" }}>{item.sp ?? 1}</td>
                <td style={{ ...cell, textAlign: "center" }}>{item.qty}</td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(item.mrp ?? item.rate)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{fmt(taxable)}</td>
                <td style={{ ...cell, textAlign: "center" }}>{useIgst ? "—" : halfRate.toFixed(2)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{useIgst ? "—" : fmt(cgst)}</td>
                <td style={{ ...cell, textAlign: "center" }}>{useIgst ? "—" : halfRate.toFixed(2)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{useIgst ? "—" : fmt(sgst)}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{fmt(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals band */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3px" }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: "25%" }}>
              <strong>Total Qty:</strong> {totalQty}
            </td>
            <td style={{ ...cell, width: "25%" }}>
              <strong>Taxable Amt:</strong> {fmt(taxableAmount)}
            </td>
            <td style={{ ...cell, width: "25%" }}>
              <strong>GST (Rs):</strong> {fmt(totalTax || cgstAmount + sgstAmount + igstAmount)}
            </td>
            <td style={{ ...cell, width: "25%", fontWeight: 800, fontSize: "9px" }}>
              <strong>NET AMT:</strong> {fmt(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: "8px", marginTop: "3px" }}>
        <strong>Amount in Words:</strong> Rs. {words}
      </div>
      <div style={{ fontSize: "8px", marginTop: "2px", fontWeight: 600 }}>{paymentLabel(props)}</div>

      {/* Footer: terms + QR + sign */}
      <div style={{ display: "flex", gap: "8px", marginTop: "5px", alignItems: "flex-end" }}>
        <div style={{ flex: 1, fontSize: "7px", lineHeight: 1.35 }}>
          <div style={{ fontWeight: 700, marginBottom: "2px", textDecoration: "underline" }}>Terms &amp; Conditions</div>
          <ol style={{ margin: 0, paddingLeft: "14px" }}>
            {terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
        <div style={{ textAlign: "center", width: "72px" }}>
          {(companyQrUrl || qrCodeUrl) ? (
            <>
              <img
                src={companyQrUrl || qrCodeUrl}
                alt="Company QR"
                style={{ width: "64px", height: "64px", border: BORDER }}
              />
              <div style={{ fontSize: "6.5px", marginTop: "2px" }}>Company QR</div>
            </>
          ) : null}
        </div>
        <div style={{ textAlign: "center", width: "90px" }}>
          {stampImageBase64 ? (
            <img src={stampImageBase64} alt="" style={{ maxWidth: "80px", maxHeight: "48px", objectFit: "contain" }} />
          ) : null}
          <div style={{ fontSize: "7px", marginTop: "4px", borderTop: BORDER, paddingTop: "2px" }}>
            Authorised Signatory
          </div>
        </div>
      </div>
      {items.length > MAX_ITEM_ROWS ? (
        <div style={{ fontSize: "7px", color: "#666", marginTop: "2px" }}>
          Showing first {MAX_ITEM_ROWS} of {items.length} items on this print layout.
        </div>
      ) : null}
    </div>
  );
};
