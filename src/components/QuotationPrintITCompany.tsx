import React from "react";

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
}

const SCHEMES: Record<string, { primary: string; accent: string; ink: string }> = {
  blue: { primary: "#1e3a5f", accent: "#e8eef5", ink: "#1a1a1a" },
  green: { primary: "#14532d", accent: "#ecfdf3", ink: "#1a1a1a" },
  purple: { primary: "#4c1d95", accent: "#f3e8ff", ink: "#1a1a1a" },
  red: { primary: "#9f1239", accent: "#fff1f2", ink: "#1a1a1a" },
  orange: { primary: "#9a3412", accent: "#fff7ed", ink: "#1a1a1a" },
  gray: { primary: "#334155", accent: "#f1f5f9", ink: "#1a1a1a" },
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

/**
 * Service / IT-company quotation: no MRP or size columns, letterhead accent
 * from Settings colour (or logo brand colour), terms from Sale settings.
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
      taxType = "exclusive",
      format = "a4",
      colorScheme = "blue",
      brandColor,
    } = props;

    const scheme = SCHEMES[colorScheme] || SCHEMES.blue;
    const primary = isHexColor(brandColor) ? brandColor.trim() : scheme.primary;
    const isA4 = format === "a4";
    const isHorizontal = format === "a5-horizontal";
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    const pageW = isA4 ? "210mm" : isHorizontal ? "210mm" : "148mm";
    const pageH = isA4 ? "297mm" : isHorizontal ? "148mm" : "210mm";
    const pad = isA4 ? "14mm" : isHorizontal ? "8mm" : "8mm";
    const fs = isA4 ? "10pt" : "8pt";
    const fsSmall = isA4 ? "8.5pt" : "7pt";

    const th: React.CSSProperties = {
      background: primary,
      color: "#fff",
      padding: isA4 ? "7px 8px" : "5px 6px",
      fontWeight: 600,
      fontSize: fsSmall,
      textAlign: "left",
      letterSpacing: "0.02em",
    };
    const td: React.CSSProperties = {
      padding: isA4 ? "7px 8px" : "5px 6px",
      borderBottom: "1px solid #e5e7eb",
      fontSize: fsSmall,
      color: scheme.ink,
    };

    return (
      <div
        ref={ref}
        className={`quotation-it-company format-${format}`}
        style={{
          width: pageW,
          minHeight: pageH,
          padding: pad,
          boxSizing: "border-box",
          background: "#fff",
          color: scheme.ink,
          fontFamily: '"Segoe UI", Calibri, Arial, sans-serif',
          fontSize: fs,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 12,
            borderBottom: `3px solid ${primary}`,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0, flex: 1 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                style={{
                  width: isA4 ? 64 : 48,
                  height: isA4 ? 64 : 48,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isA4 ? "16pt" : "12pt",
                  fontWeight: 700,
                  color: primary,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {businessName}
              </div>
              {address ? (
                <div style={{ fontSize: fsSmall, marginTop: 4, lineHeight: 1.4, color: "#475569" }}>
                  {address}
                </div>
              ) : null}
              <div style={{ fontSize: fsSmall, marginTop: 3, color: "#475569" }}>
                {mobile ? `Tel: ${mobile}` : ""}
                {email ? `${mobile ? "  ·  " : ""}${email}` : ""}
              </div>
              {gstNumber ? (
                <div style={{ fontSize: fsSmall, marginTop: 2, fontWeight: 600 }}>GSTIN: {gstNumber}</div>
              ) : null}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: isA4 ? "18pt" : "13pt",
                fontWeight: 700,
                color: primary,
                letterSpacing: "0.12em",
              }}
            >
              QUOTATION
            </div>
            <div style={{ fontSize: fsSmall, marginTop: 8, color: "#64748b" }}>
              {quotationNumber}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: isA4 ? 20 : 12,
            marginTop: isA4 ? 16 : 10,
            marginBottom: isA4 ? 16 : 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: "8pt",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: primary,
                marginBottom: 6,
              }}
            >
              PREPARED FOR
            </div>
            <div style={{ fontWeight: 700 }}>{customerName}</div>
            {customerAddress ? (
              <div style={{ fontSize: fsSmall, marginTop: 3, lineHeight: 1.4, color: "#475569" }}>
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
              padding: isA4 ? 12 : 8,
              borderLeft: `3px solid ${primary}`,
            }}
          >
            <MetaRow label="Quote No." value={quotationNumber} primary={primary} />
            <MetaRow label="Date" value={formatDate(quotationDate)} primary={primary} />
            {validUntil ? <MetaRow label="Valid until" value={formatDate(validUntil)} primary={primary} /> : null}
            <MetaRow
              label="Tax"
              value={taxType === "inclusive" ? "GST Inclusive" : taxType === "no_gst" ? "No GST" : "GST Exclusive"}
              primary={primary}
            />
            {salesman ? <MetaRow label="Prepared by" value={salesman} primary={primary} /> : null}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "8%", textAlign: "center" }}>#</th>
              <th style={th}>Description</th>
              {showHSN ? <th style={{ ...th, width: "12%", textAlign: "center" }}>HSN / SAC</th> : null}
              <th style={{ ...th, width: "10%", textAlign: "center" }}>Qty</th>
              <th style={{ ...th, width: "16%", textAlign: "right" }}>Rate</th>
              <th style={{ ...th, width: "16%", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr}>
                <td style={{ ...td, textAlign: "center" }}>{item.sr}</td>
                <td style={td}>{item.particulars}</td>
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
            <tr>
              <td
                colSpan={showHSN ? 3 : 2}
                style={{ ...td, textAlign: "right", fontWeight: 600, background: scheme.accent, borderBottom: "none" }}
              >
                Total qty
              </td>
              <td style={{ ...td, textAlign: "center", fontWeight: 600, background: scheme.accent, borderBottom: "none" }}>
                {totalQty}
              </td>
              <td colSpan={2} style={{ ...td, background: scheme.accent, borderBottom: "none" }} />
            </tr>
          </tbody>
        </table>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: isA4 ? 14 : 10,
          }}
        >
          <div style={{ width: isA4 ? 240 : 200, fontSize: fsSmall }}>
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
                fontSize: isA4 ? "11pt" : "9pt",
                color: primary,
              }}
            >
              <span>Grand Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(netAmount)}</span>
            </div>
          </div>
        </div>

        {notes ? (
          <div style={{ marginTop: isA4 ? 16 : 10, fontSize: fsSmall }}>
            <div style={{ fontWeight: 700, color: primary, marginBottom: 4 }}>Notes</div>
            <div style={{ whiteSpace: "pre-line", lineHeight: 1.45, color: "#334155" }}>{notes}</div>
          </div>
        ) : null}

        {termsConditions ? (
          <div style={{ marginTop: isA4 ? 16 : 10, fontSize: fsSmall }}>
            <div style={{ fontWeight: 700, color: primary, marginBottom: 4 }}>Terms &amp; Conditions</div>
            <div style={{ whiteSpace: "pre-line", lineHeight: 1.5, color: "#334155" }}>{termsConditions}</div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: "auto",
            paddingTop: isA4 ? 24 : 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: fsSmall,
          }}
        >
          <div style={{ color: "#64748b" }}>Thank you for the opportunity to quote.</div>
          <div style={{ textAlign: "center", minWidth: 140 }}>
            <div style={{ borderTop: `1px solid ${primary}`, paddingTop: 4, fontWeight: 600, color: primary }}>
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>
    );
  },
);

QuotationPrintITCompany.displayName = "QuotationPrintITCompany";

function MetaRow({ label, value, primary }: { label: string; value: string; primary: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, margin: "3px 0", fontSize: "8pt" }}>
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
