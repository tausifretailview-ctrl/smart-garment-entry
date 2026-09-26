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

/* Print palette — dark ink + one light fill, safe on mono laser printers. */
const INK = "#111827";
const MUTED = "#4b5563";
const RULE = "#9ca3af";
const FILL = "#f1f3f5";
const FRAME = `1.4px solid ${INK}`;
const LINE = `0.8px solid ${INK}`;
const SOFT = `0.6px solid ${RULE}`;

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date: Date) => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${date.getFullYear()}`;
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
  return parts.join("   |   ");
};

const PRINT_CSS = `
  @page krishna-a5 { size: 210mm 148mm; margin: 0; }
  @media print {
    @page { size: 210mm 148mm; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; }
    .krishna-mobile-a5-invoice {
      page: krishna-a5;
      width: 210mm !important;
      height: 147.5mm !important;
      min-height: 0 !important;
      max-height: 147.5mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      break-after: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
  }
  .krishna-mobile-a5-invoice, .krishna-mobile-a5-invoice * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-sizing: border-box;
  }
`;

export const KrishnaMobileA5Template: React.FC<KrishnaMobileA5TemplateProps> = (props) => {
  const {
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
          { width: 200, margin: 1, errorCorrectionLevel: "M" },
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

  const lineMeta = displayItems.map((item) => {
    const gstPct = item.gstPercent || 0;
    const { taxable, gst } = splitLineGstFromTotal(item.total, gstPct);
    const half = gst / 2;
    return { item, gstPct, taxable, cgst: half, sgst: half, igst: gst };
  });

  const useIgst = igstAmount > 0 && cgstAmount === 0 && sgstAmount === 0;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const gstTotal = totalTax || cgstAmount + sgstAmount + igstAmount;
  const words = numberToWords(Math.round(grandTotal)).replace(/^Rs\.?\s*/i, "");
  const payment = paymentLabel(props);
  const qrSrc = companyQrUrl || qrCodeUrl;

  // Totals row covers every bill line (not just the rows shown) so it matches Net Amount.
  const allGst = items.map((i) => splitLineGstFromTotal(i.total, i.gstPercent || 0));
  const sumTaxable = allGst.reduce((s, g) => s + g.taxable, 0);
  const sumGst = allGst.reduce((s, g) => s + g.gst, 0);
  const sumCgst = useIgst ? 0 : sumGst / 2;
  const sumSgst = useIgst ? 0 : sumGst / 2;
  const sumIgst = useIgst ? sumGst : 0;
  const sumTotal = items.reduce((s, i) => s + i.total, 0);

  const defaultTerms = [
    "Goods once sold will not be taken back or exchanged.",
    "Handset carries 1 year warranty from the brand service centre.",
    "Battery, charger & handsfree carry 6 months warranty from service centre.",
    "No warranty on physical, liquid or burn damage.",
  ];
  const terms = (termsConditions?.length ? termsConditions : defaultTerms).slice(0, 4);

  /* ---------- table cell styles ---------- */
  const td: React.CSSProperties = {
    borderLeft: LINE,
    padding: "3px 5px",
    fontSize: "10px",
    verticalAlign: "top",
    lineHeight: 1.3,
  };
  const th: React.CSSProperties = {
    borderLeft: LINE,
    borderBottom: LINE,
    padding: "3px 4px",
    fontSize: "8.5px",
    fontWeight: 700,
    letterSpacing: "0.4px",
    textAlign: "center",
    verticalAlign: "middle",
    background: FILL,
    textTransform: "uppercase",
    lineHeight: 1.15,
  };
  const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const ctr: React.CSSProperties = { ...td, textAlign: "center" };
  const foot: React.CSSProperties = {
    borderLeft: LINE,
    borderTop: LINE,
    padding: "4px 5px",
    fontSize: "10px",
    fontWeight: 700,
    background: FILL,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  };
  const first = { borderLeft: "none" } as const;

  const label: React.CSSProperties = {
    fontSize: "7.5px",
    fontWeight: 700,
    letterSpacing: "1px",
    color: MUTED,
    textTransform: "uppercase",
  };

  const summaryRow = (k: string, v: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2.5px 8px",
        fontSize: "10px",
        borderBottom: SOFT,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: MUTED }}>{k}</span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );

  return (
    <div
      className="krishna-mobile-a5-invoice"
      data-invoice-variant="krishna-mobile-a5"
      style={{
        width: "210mm",
        height: "148mm",
        margin: "0 auto",
        padding: "5mm",
        boxSizing: "border-box",
        fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: INK,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <style>{PRINT_CSS}</style>

      {/* Full-page frame */}
      <div
        style={{
          border: FRAME,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ===== Header ===== */}
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: LINE }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, padding: "5px 10px" }}>
            {logoUrl ? (
              <div
                style={{
                  width: "20mm",
                  height: "18mm",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img src={logoUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  letterSpacing: "0.6px",
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                }}
              >
                {businessName}
              </div>
              <div style={{ fontSize: "9.5px", color: MUTED, marginTop: "3px", lineHeight: 1.35 }}>{address}</div>
              <div style={{ fontSize: "9.5px", marginTop: "2px", lineHeight: 1.35 }}>
                {mobile ? (
                  <>
                    <strong>Mob:</strong> {mobile}
                  </>
                ) : null}
                {email ? (
                  <>
                    {mobile ? <span style={{ color: RULE }}>{"  |  "}</span> : null}
                    <strong>Email:</strong> {email}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div
            style={{
              width: "58mm",
              flexShrink: 0,
              borderLeft: LINE,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              padding: "6px 8px",
            }}
          >
            <div
              style={{
                background: INK,
                color: "#fff",
                fontSize: "11.5px",
                fontWeight: 800,
                letterSpacing: "3px",
                padding: "4px 14px",
                borderRadius: "2px",
              }}
            >
              TAX INVOICE
            </div>
            {gstNumber ? (
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px" }}>GSTIN: {gstNumber}</div>
            ) : null}
            <div style={{ fontSize: "7.5px", color: MUTED, letterSpacing: "0.5px" }}>Original for Recipient</div>
          </div>
        </div>

        {/* ===== Customer + bill details ===== */}
        <div style={{ display: "flex", borderBottom: LINE }}>
          <div style={{ flex: 1, padding: "4px 10px", minWidth: 0 }}>
            <div style={label}>Billed To</div>
            <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "1px", lineHeight: 1.25 }}>
              {customerName || "Walk-in Customer"}
            </div>
            <div style={{ fontSize: "9.5px", marginTop: "1px", lineHeight: 1.35 }}>
              {customerMobile ? (
                <>
                  <strong>Mob:</strong> {customerMobile}
                </>
              ) : null}
              {customerGSTIN ? (
                <>
                  {customerMobile ? <span style={{ color: RULE }}>{"  |  "}</span> : null}
                  <strong>GSTIN:</strong> {customerGSTIN}
                </>
              ) : null}
            </div>
            {customerAddress?.trim() ? (
              <div
                style={{
                  fontSize: "9.5px",
                  color: MUTED,
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {customerAddress}
              </div>
            ) : null}
          </div>
          <div
            style={{
              width: "58mm",
              flexShrink: 0,
              borderLeft: LINE,
              padding: "4px 10px",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: "8px",
              rowGap: "2px",
              alignContent: "center",
              fontSize: "10px",
            }}
          >
            <span style={{ ...label, alignSelf: "center" }}>Bill No</span>
            <span style={{ fontWeight: 800, fontSize: "11px", textAlign: "right" }}>{invoiceNumber}</span>
            <span style={{ ...label, alignSelf: "center" }}>Date</span>
            <span style={{ fontWeight: 600, textAlign: "right" }}>{formatDate(invoiceDate)}</span>
            {invoiceTime ? (
              <>
                <span style={{ ...label, alignSelf: "center" }}>Time</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{invoiceTime}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* ===== Items (grows to fill the page) ===== */}
        <div style={{ flex: "1 1 auto", minHeight: 0, borderBottom: LINE }}>
          <table
            style={{
              width: "100%",
              height: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: useIgst ? "34%" : "27%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "9.5%" }} />
              <col style={{ width: "10%" }} />
              {useIgst ? (
                <>
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "9%" }} />
                </>
              ) : (
                <>
                  <col style={{ width: "5.5%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "5.5%" }} />
                  <col style={{ width: "8%" }} />
                </>
              )}
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, ...first }}>Sr</th>
                <th rowSpan={2} style={{ ...th, textAlign: "left", paddingLeft: "6px" }}>Particulars</th>
                <th rowSpan={2} style={th}>HSN</th>
                <th rowSpan={2} style={th}>SP</th>
                <th rowSpan={2} style={th}>Qty</th>
                <th rowSpan={2} style={th}>MRP / Rate</th>
                <th rowSpan={2} style={th}>Taxable Amt</th>
                {useIgst ? (
                  <th colSpan={2} style={th}>IGST</th>
                ) : (
                  <>
                    <th colSpan={2} style={th}>CGST</th>
                    <th colSpan={2} style={th}>SGST</th>
                  </>
                )}
                <th rowSpan={2} style={th}>Total with GST</th>
              </tr>
              <tr>
                {(useIgst ? ["Rate %", "Amount"] : ["Rate %", "Amount", "Rate %", "Amount"]).map((h, i) => (
                  <th key={i} style={{ ...th, fontSize: "7.5px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineMeta.map(({ item, gstPct, taxable, cgst, sgst, igst }, idx) => {
                const imei = pickImei(item);
                const halfRate = gstPct / 2;
                return (
                  <tr key={item.sr ?? idx} style={{ height: "1px" }}>
                    <td style={{ ...ctr, ...first, paddingTop: "4px" }}>{item.sr || idx + 1}</td>
                    <td style={{ ...td, paddingTop: "4px", paddingLeft: "6px" }}>
                      <div style={{ fontWeight: 700, fontSize: "10.5px", lineHeight: 1.25 }}>{item.particulars}</div>
                      {imei ? (
                        <div style={{ fontSize: "9px", marginTop: "2px", letterSpacing: "0.2px" }}>
                          <span style={{ color: MUTED }}>IMEI/BC:</span>{" "}
                          <span style={{ fontWeight: 600, fontFamily: "Consolas, 'Courier New', monospace" }}>{imei}</span>
                        </div>
                      ) : null}
                      {item.itemNotes ? (
                        <div style={{ fontSize: "8.5px", color: MUTED, marginTop: "1px" }}>{item.itemNotes}</div>
                      ) : null}
                    </td>
                    <td style={{ ...ctr, paddingTop: "4px", fontSize: "9px" }}>{item.hsn || "—"}</td>
                    <td style={{ ...ctr, paddingTop: "4px" }}>{item.sp ?? 1}</td>
                    <td style={{ ...ctr, paddingTop: "4px", fontWeight: 700 }}>{item.qty}</td>
                    <td style={{ ...num, paddingTop: "4px" }}>{fmt(item.mrp ?? item.rate)}</td>
                    <td style={{ ...num, paddingTop: "4px" }}>{fmt(taxable)}</td>
                    {useIgst ? (
                      <>
                        <td style={{ ...ctr, paddingTop: "4px" }}>{gstPct.toFixed(2)}</td>
                        <td style={{ ...num, paddingTop: "4px" }}>{fmt(igst)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...ctr, paddingTop: "4px" }}>{halfRate.toFixed(2)}</td>
                        <td style={{ ...num, paddingTop: "4px" }}>{fmt(cgst)}</td>
                        <td style={{ ...ctr, paddingTop: "4px" }}>{halfRate.toFixed(2)}</td>
                        <td style={{ ...num, paddingTop: "4px" }}>{fmt(sgst)}</td>
                      </>
                    )}
                    <td style={{ ...num, paddingTop: "4px", fontWeight: 700 }}>{fmt(item.total)}</td>
                  </tr>
                );
              })}
              {/* Filler row keeps the column rules running to the totals line */}
              <tr>
                <td style={{ ...td, ...first }} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={td} />
                {useIgst ? null : (
                  <>
                    <td style={td} />
                    <td style={td} />
                  </>
                )}
                <td style={td} />
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ height: "1px" }}>
                <td colSpan={4} style={{ ...foot, ...first, textAlign: "right", letterSpacing: "0.5px" }}>
                  TOTAL
                </td>
                <td style={{ ...foot, textAlign: "center" }}>{totalQty}</td>
                <td style={foot} />
                <td style={foot}>{fmt(sumTaxable)}</td>
                {useIgst ? (
                  <>
                    <td style={foot} />
                    <td style={foot}>{fmt(sumIgst)}</td>
                  </>
                ) : (
                  <>
                    <td style={foot} />
                    <td style={foot}>{fmt(sumCgst)}</td>
                    <td style={foot} />
                    <td style={foot}>{fmt(sumSgst)}</td>
                  </>
                )}
                <td style={foot}>{fmt(sumTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ===== Amount in words + summary ===== */}
        <div style={{ display: "flex", borderBottom: LINE }}>
          <div style={{ flex: 1, padding: "5px 10px", display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <div>
              <div style={label}>Amount in Words</div>
              <div style={{ fontSize: "10.5px", fontWeight: 700, fontStyle: "italic", marginTop: "1px", lineHeight: 1.3 }}>
                {words}
              </div>
            </div>
            {payment ? (
              <div>
                <div style={label}>Payment</div>
                <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "1px" }}>{payment}</div>
              </div>
            ) : null}
            {items.length > MAX_ITEM_ROWS ? (
              <div style={{ fontSize: "8px", color: MUTED }}>
                Showing first {MAX_ITEM_ROWS} of {items.length} items on this print layout.
              </div>
            ) : null}
          </div>
          <div style={{ width: "58mm", flexShrink: 0, borderLeft: LINE, display: "flex", flexDirection: "column" }}>
            {summaryRow("Taxable Amount", fmt(taxableAmount))}
            {useIgst
              ? summaryRow("IGST", fmt(igstAmount))
              : cgstAmount + sgstAmount > 0
                ? (
                    <>
                      {summaryRow("CGST", fmt(cgstAmount))}
                      {summaryRow("SGST", fmt(sgstAmount))}
                    </>
                  )
                : summaryRow("GST (Rs)", fmt(gstTotal))}
            <div
              style={{
                marginTop: "auto",
                background: INK,
                color: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 8px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px" }}>NET AMOUNT</span>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>₹ {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ===== Footer: terms | QR | signatory ===== */}
        <div style={{ display: "flex", alignItems: "stretch", minHeight: "21mm" }}>
          <div style={{ flex: 1, padding: "5px 10px", minWidth: 0 }}>
            <div style={label}>Terms &amp; Conditions</div>
            <ol style={{ margin: "2px 0 0", paddingLeft: "13px", fontSize: "8.5px", lineHeight: 1.35 }}>
              {terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </div>
          {qrSrc ? (
            <div
              style={{
                width: "26mm",
                flexShrink: 0,
                borderLeft: SOFT,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
              }}
            >
              <img src={qrSrc} alt="Company QR" style={{ width: "17mm", height: "17mm" }} />
              <div style={{ fontSize: "7.5px", fontWeight: 700, marginTop: "1px", letterSpacing: "0.5px" }}>SCAN TO PAY</div>
            </div>
          ) : null}
          <div
            style={{
              width: "58mm",
              flexShrink: 0,
              borderLeft: LINE,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 8px 4px",
            }}
          >
            <div style={{ fontSize: "9px", fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>
              For {businessName}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              {stampImageBase64 ? (
                <img src={stampImageBase64} alt="" style={{ maxWidth: "40mm", maxHeight: "12mm", objectFit: "contain" }} />
              ) : null}
            </div>
            <div
              style={{
                width: "100%",
                borderTop: LINE,
                paddingTop: "2px",
                fontSize: "8.5px",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
