import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { numberToWords } from "@/lib/utils";

export interface QuotationPrintItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  qty: number;
  rate: number;
  mrp: number;
  discountPercent: number;
  total: number;
}

export type QuotationBankDetails = {
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_holder?: string;
  branch?: string;
};

export interface QuotationPrintSharedProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  quotationNumber: string;
  quotationDate: Date;
  validUntil?: Date;
  salesman?: string;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerEmail?: string;
  customerGSTIN?: string;
  items: QuotationPrintItem[];
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  roundOff: number;
  netAmount: number;
  termsConditions?: string;
  notes?: string;
  showHSN?: boolean;
  taxType?: string;
  format?: "a5-vertical" | "a5-horizontal" | "a4";
  colorScheme?: string;
  brandColor?: string;
  footerText?: string;
  showBankDetails?: boolean;
  bankDetails?: QuotationBankDetails | null;
  /** Settings → Bill & Barcode UPI ID — payment QR on IT Company A4. */
  upiId?: string;
}

const SCHEMES: Record<string, { primary: string; accent: string; ink: string; line: string }> = {
  blue: { primary: "#1e3a5f", accent: "#eef3f8", ink: "#1a1a1a", line: "#c5d0dc" },
  green: { primary: "#14532d", accent: "#ecfdf3", ink: "#1a1a1a", line: "#bbf7d0" },
  purple: { primary: "#4c1d95", accent: "#f3e8ff", ink: "#1a1a1a", line: "#e9d5ff" },
  red: { primary: "#9f1239", accent: "#fff1f2", ink: "#1a1a1a", line: "#fecdd3" },
  orange: { primary: "#9a3412", accent: "#fff7ed", ink: "#1a1a1a", line: "#fed7aa" },
  gray: { primary: "#334155", accent: "#f1f5f9", ink: "#1a1a1a", line: "#cbd5e1" },
};

function isHexColor(value?: string): value is string {
  return !!value && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hasBank(bank?: QuotationBankDetails | null) {
  if (!bank) return false;
  return !!(bank.bank_name || bank.account_number || bank.ifsc_code || bank.account_holder);
}

/**
 * Service / IT-company quotation: no MRP or size, A4 leaf with padded rows
 * and a pinned footer (terms, bank, signatory, custom footer).
 */
export const QuotationPrintITCompany = React.forwardRef<HTMLDivElement, QuotationPrintSharedProps>(
  (props, ref) => {
    const {
      businessName,
      address,
      mobile,
      email,
      gstNumber,
      logoUrl,
      quotationNumber,
      quotationDate,
      validUntil,
      salesman,
      customerName,
      customerAddress,
      customerMobile,
      customerEmail,
      customerGSTIN,
      items,
      grossAmount,
      discountAmount,
      taxableAmount,
      gstAmount,
      roundOff,
      netAmount,
      termsConditions,
      notes,
      showHSN = true,
      format = "a4",
      colorScheme = "blue",
      brandColor,
      footerText,
      showBankDetails = true,
      bankDetails,
      upiId,
    } = props;

    const scheme = SCHEMES[colorScheme] || SCHEMES.blue;
    const primary = isHexColor(brandColor) ? brandColor.trim() : scheme.primary;
    const isA4 = format === "a4";
    const isHorizontal = format === "a5-horizontal";
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const targetRows = isA4 ? 8 : isHorizontal ? 6 : 8;
    const manyItems = items.length > targetRows;
    const blankCount = manyItems ? 0 : Math.max(0, targetRows - items.length);
    const colCount = showHSN ? 6 : 5;
    const showBank = (showBankDetails !== false) && hasBank(bankDetails);

    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const upiTrimmed = (upiId || "").trim();

    useEffect(() => {
      let cancelled = false;
      if (!upiTrimmed) {
        setQrCodeUrl("");
        return;
      }
      const upiString = `upi://pay?pa=${encodeURIComponent(upiTrimmed)}&pn=${encodeURIComponent(
        businessName || "Store",
      )}&am=${Number(netAmount || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent(quotationNumber || "Quotation")}`;
      QRCode.toDataURL(upiString, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#FFFFFF" },
      })
        .then((url) => {
          if (!cancelled) setQrCodeUrl(url);
        })
        .catch((err) => {
          console.error("IT quotation UPI QR failed", err);
          if (!cancelled) setQrCodeUrl("");
        });
      return () => {
        cancelled = true;
      };
    }, [upiTrimmed, businessName, netAmount, quotationNumber]);

    const pageW = isA4 ? "210mm" : isHorizontal ? "210mm" : "148mm";
    const pageH = isA4 ? "297mm" : isHorizontal ? "148mm" : "210mm";
    const pad = isA4 ? "10mm" : "7mm";
    const fsSmall = isA4 ? "10pt" : "6.5pt";
    const qrMm = isA4 ? 28 : 20;

    const th: React.CSSProperties = {
      background: primary,
      color: "#fff",
      padding: isA4 ? "5px 6px" : "3px 4px",
      fontWeight: 600,
      fontSize: fsSmall,
      letterSpacing: "0.04em",
      border: `1px solid ${primary}`,
    };
    const td: React.CSSProperties = {
      padding: isA4 ? "5px 6px" : "3px 4px",
      border: `1px solid ${scheme.line}`,
      fontSize: fsSmall,
      color: scheme.ink,
      verticalAlign: "top",
    };

    return (
      <div
        ref={ref}
        className={`quotation-it-company format-${format}`}
        style={{
          width: pageW,
          height: manyItems ? "auto" : pageH,
          minHeight: pageH,
          maxHeight: manyItems ? "none" : pageH,
          padding: pad,
          boxSizing: "border-box",
          background: "#fff",
          color: scheme.ink,
          fontFamily: '"Segoe UI", Calibri, Arial, sans-serif',
          fontSize: isA4 ? "11pt" : "7.5pt",
          display: "flex",
          flexDirection: "column",
          overflow: manyItems ? "visible" : "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            paddingBottom: 8,
            borderBottom: `3px solid ${primary}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                style={{
                  width: isA4 ? 64 : 42,
                  height: isA4 ? 64 : 42,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isA4 ? "18pt" : "11pt",
                  fontWeight: 700,
                  color: primary,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {businessName}
              </div>
              {address ? (
                <div style={{ fontSize: fsSmall, marginTop: 2, lineHeight: 1.35, color: "#475569" }}>
                  {address}
                </div>
              ) : null}
              <div style={{ fontSize: fsSmall, marginTop: 2, color: "#475569" }}>
                {mobile ? `Tel: ${mobile}` : ""}
                {email ? `${mobile ? "  ·  " : ""}${email}` : ""}
              </div>
              {gstNumber ? (
                <div style={{ fontSize: fsSmall, marginTop: 1, fontWeight: 600 }}>GSTIN: {gstNumber}</div>
              ) : null}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: isA4 ? "18pt" : "12pt",
                fontWeight: 700,
                color: primary,
                letterSpacing: "0.14em",
              }}
            >
              QUOTATION
            </div>
            <div style={{ fontSize: fsSmall, marginTop: 4, color: "#64748b", fontWeight: 600 }}>
              {quotationNumber}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: isA4 ? 14 : 8,
            marginTop: 10,
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: isA4 ? "9pt" : "7.5pt",
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: primary,
                marginBottom: 4,
              }}
            >
              PREPARED FOR
            </div>
            <div style={{ fontWeight: 700 }}>{customerName}</div>
            {customerAddress ? (
              <div style={{ fontSize: fsSmall, marginTop: 2, lineHeight: 1.35, color: "#475569" }}>
                {customerAddress}
              </div>
            ) : null}
            {customerMobile ? <div style={{ fontSize: fsSmall, marginTop: 2 }}>Phone: {customerMobile}</div> : null}
            {customerEmail ? <div style={{ fontSize: fsSmall }}>Email: {customerEmail}</div> : null}
            {customerGSTIN ? <div style={{ fontSize: fsSmall }}>GSTIN: {customerGSTIN}</div> : null}
          </div>
          <div
            style={{
              background: scheme.accent,
              padding: isA4 ? 10 : 6,
              borderLeft: `3px solid ${primary}`,
            }}
          >
            <MetaRow label="Quote No." value={quotationNumber} primary={primary} />
            <MetaRow label="Date" value={formatDate(quotationDate)} primary={primary} />
            {validUntil ? <MetaRow label="Valid until" value={formatDate(validUntil)} primary={primary} /> : null}
            {salesman ? <MetaRow label="Prepared by" value={salesman} primary={primary} /> : null}
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <table
            style={{
              width: "100%",
              height: manyItems ? "auto" : "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: isA4 ? "9mm" : "8mm" }} />
              <col />
              {showHSN ? <col style={{ width: isA4 ? "24mm" : "18mm" }} /> : null}
              <col style={{ width: isA4 ? "16mm" : "14mm" }} />
              <col style={{ width: isA4 ? "32mm" : "26mm" }} />
              <col style={{ width: isA4 ? "34mm" : "28mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "center" }}>#</th>
                <th style={{ ...th, textAlign: "left" }}>Description</th>
                {showHSN ? <th style={{ ...th, textAlign: "center" }}>HSN / SAC</th> : null}
                <th style={{ ...th, textAlign: "center" }}>Qty</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.sr} style={{ background: idx % 2 === 1 ? scheme.accent : "#fff" }}>
                  <td style={{ ...td, textAlign: "center" }}>{item.sr}</td>
                  <td style={{ ...td, wordBreak: "break-word" }}>{item.particulars}</td>
                  {showHSN ? <td style={{ ...td, textAlign: "center" }}>{item.hsn || "—"}</td> : null}
                  <td style={{ ...td, textAlign: "center" }}>{item.qty}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(item.rate)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blankCount }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  {Array.from({ length: colCount }).map((__, c) => (
                    <td key={c} style={{ ...td, height: isA4 ? 26 : 16 }}>
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ background: scheme.accent, fontWeight: 600 }}>
                <td
                  colSpan={showHSN ? 3 : 2}
                  style={{ ...td, textAlign: "right", borderColor: primary }}
                >
                  Total qty
                </td>
                <td style={{ ...td, textAlign: "center", borderColor: primary }}>{totalQty}</td>
                <td colSpan={2} style={{ ...td, borderColor: primary }} />
              </tr>
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            gap: isA4 ? 16 : 10,
            marginTop: 10,
            flexShrink: 0,
            alignItems: "stretch",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, fontSize: fsSmall }}>
            <div style={{ fontWeight: 700, color: primary, marginBottom: 3 }}>Amount in words</div>
            <div style={{ fontStyle: "italic", color: "#334155", lineHeight: 1.35 }}>
              {numberToWords(netAmount)}
            </div>
            {notes ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, color: primary, marginBottom: 2 }}>Notes</div>
                <div style={{ whiteSpace: "pre-line", lineHeight: 1.4, color: "#334155" }}>{notes}</div>
              </div>
            ) : null}
            {termsConditions ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, color: primary, marginBottom: 2 }}>Terms &amp; Conditions</div>
                <div
                  style={{
                    whiteSpace: "pre-line",
                    lineHeight: 1.4,
                    color: "#334155",
                    maxHeight: manyItems ? "none" : isA4 ? 72 : 52,
                    overflow: manyItems ? "visible" : "hidden",
                  }}
                >
                  {termsConditions}
                </div>
              </div>
            ) : null}
          </div>
          <div
            style={{
              width: isA4 ? 210 : 170,
              flexShrink: 0,
              border: `1px solid ${scheme.line}`,
              padding: isA4 ? 8 : 6,
              fontSize: fsSmall,
              background: "#fff",
            }}
          >
            <TotalRow label="Subtotal" value={formatCurrency(grossAmount)} />
            {discountAmount > 0 ? (
              <TotalRow label="Discount" value={`−${formatCurrency(discountAmount)}`} />
            ) : null}
            <TotalRow label="Taxable" value={formatCurrency(taxableAmount)} />
            {gstAmount > 0 ? <TotalRow label="GST" value={formatCurrency(gstAmount)} /> : null}
            {roundOff !== 0 ? (
              <TotalRow
                label="Round off"
                value={`${roundOff >= 0 ? "+" : ""}${formatCurrency(roundOff)}`}
              />
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                paddingTop: 8,
                borderTop: `2px solid ${primary}`,
                fontWeight: 700,
                fontSize: isA4 ? "13pt" : "8.5pt",
                color: primary,
              }}
            >
              <span>Grand Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(netAmount)}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 10,
            flexShrink: 0,
            borderTop: `1px solid ${scheme.line}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: isA4 ? 12 : 10,
              alignItems: "flex-end",
              fontSize: fsSmall,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {showBank ? (
                <div>
                  <div style={{ fontWeight: 700, color: primary, marginBottom: 3 }}>Bank details</div>
                  {bankDetails?.bank_name ? <div>{bankDetails.bank_name}</div> : null}
                  {bankDetails?.account_holder ? <div>A/c name: {bankDetails.account_holder}</div> : null}
                  {bankDetails?.account_number ? <div>A/c no.: {bankDetails.account_number}</div> : null}
                  {bankDetails?.ifsc_code ? <div>IFSC: {bankDetails.ifsc_code}</div> : null}
                  {bankDetails?.branch ? <div>Branch: {bankDetails.branch}</div> : null}
                </div>
              ) : (
                <div style={{ color: "#64748b" }}>This is a computer-generated quotation.</div>
              )}
            </div>
            {qrCodeUrl ? (
              <div
                style={{
                  flexShrink: 0,
                  textAlign: "center",
                  width: `${qrMm + 4}mm`,
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="UPI QR"
                  style={{
                    width: `${qrMm}mm`,
                    height: `${qrMm}mm`,
                    display: "block",
                    margin: "0 auto",
                    border: `1px solid ${scheme.line}`,
                    background: "#fff",
                  }}
                />
                <div style={{ fontWeight: 700, color: primary, marginTop: 3, fontSize: isA4 ? "8.5pt" : "6.5pt" }}>
                  Scan to pay
                </div>
                <div style={{ color: "#475569", fontSize: isA4 ? "8pt" : "6pt", wordBreak: "break-all" }}>
                  {upiTrimmed}
                </div>
              </div>
            ) : null}
            <div style={{ textAlign: "center", minWidth: isA4 ? 140 : 110, flexShrink: 0 }}>
              <div style={{ height: isA4 ? (qrCodeUrl ? 8 : 36) : 24 }} />
              <div style={{ borderTop: `1px solid ${primary}`, paddingTop: 4, fontWeight: 600, color: primary }}>
                Authorised Signatory
              </div>
              <div style={{ color: "#64748b", marginTop: 2 }}>{businessName}</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              background: primary,
              color: "#fff",
              padding: isA4 ? "6px 10px" : "4px 8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: isA4 ? "9pt" : "6.5pt",
              letterSpacing: "0.02em",
            }}
          >
            <span>{footerText?.trim() || "Thank you for the opportunity to quote."}</span>
            <span>{quotationNumber}</span>
          </div>
        </div>
      </div>
    );
  },
);

QuotationPrintITCompany.displayName = "QuotationPrintITCompany";

function MetaRow({ label, value, primary }: { label: string; value: string; primary: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, margin: "3px 0", fontSize: "10pt" }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 600, color: primary }}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
