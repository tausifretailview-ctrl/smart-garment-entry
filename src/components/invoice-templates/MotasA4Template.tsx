import React, { useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { numberToWords } from "@/lib/utils";
import {
  formatPlaceOfSupplyFromGstin,
  normalizeGstTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";
import {
  buildInvoiceGstBreakdown,
  roundInvoiceMoney,
  type InvoiceGstLineComputation,
} from "@/utils/invoiceGstRateSlabs";

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
  color?: string;
  gstPercent?: number;
  discountPercent?: number;
  uom?: string;
}

export interface MotasA4TemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | string | null;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  taxType?: GstTaxType | string;
  items: InvoiceItem[];
  discount: number;
  saleReturnAdjust?: number;
  roundOff: number;
  grandTotal: number;
  termsConditions?: string[];
  customHeaderText?: string;
  customFooterText?: string;
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
  showBankDetails?: boolean;
  notes?: string;
  documentTitle?: string;
  stampImageBase64?: string;
  stampSize?: "small" | "medium" | "large";
  [key: string]: unknown;
}

/** Palette — deep navy + gold. Prints as clean greys on B/W lasers. */
const NAVY = "#0b3954";
const NAVY_LINE = "#2c5a77";
const GOLD = "#c9a227";
const TINT = "#eef4f8";
const ZEBRA = "#f7fafc";
const INK = "#1a202c";
const MUTED = "#5a6778";
const GRID = "#9aa8b6";
const HAIR = "#d5dde5";

const EM_DASH = "—";

const fmt = (n: number) =>
  roundInvoiceMoney(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtQty = (n: number) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toFixed(2) : String(roundInvoiceMoney(v));
};

const fmtPct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;

const rupee = (amount: string) => `₹${amount}`;

const clean = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "");

/** Size / colour for the line under a product — "None" / "null" placeholders print nothing. */
const variantText = (v?: string | null) => {
  const t = clean(v);
  return /^(none|null|undefined|n\/a|-)$/i.test(t) ? "" : t;
};

const formatInvoiceDate = (date?: Date | string | null): string => {
  if (!date) return EM_DASH;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return format(d, "dd/MM/yyyy");
};

const printExact: React.CSSProperties = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

/* ---------------------------------------------------------------------------
 * Page plan. Every sheet repeats the header (shop, title, billing block,
 * invoice details) and the column heads; items fill each sheet; totals, tax
 * summary, terms and signature follow the last item. Heights are in mm,
 * measured from Chrome renders of this layout, with slack kept on purpose.
 * ------------------------------------------------------------------------- */

/** Inside the page frame: 297mm − 2×6mm page margin − frame lines. */
export const MOTAS_FRAME_MM = 284;
const PAGE_FOOTER_MM = 6;
const TABLE_HEAD_MM = 8;
const ROW_BASE_MM = 6.4;
const ROW_EXTRA_LINE_MM = 3.9;
const DESC_CHARS_PER_LINE = 35;

const wrappedLines = (text: string | undefined, charsPerLine: number) =>
  String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / charsPerLine)), 0);

export const estimateMotasRowMm = (item: Pick<InvoiceItem, "particulars" | "size" | "color">) => {
  const nameLines = Math.max(1, Math.ceil(clean(item.particulars).length / DESC_CHARS_PER_LINE));
  const hasVariant = Boolean(variantText(item.color) || variantText(item.size));
  return ROW_BASE_MM + (nameLines - 1) * ROW_EXTRA_LINE_MM + (hasVariant ? 3.2 : 0);
};

export const estimateMotasHeaderMm = (opts: {
  address?: string;
  customerAddress?: string;
  hasCustomHeader?: boolean;
  businessName?: string;
}) => {
  const seller =
    29 +
    Math.max(0, wrappedLines(opts.address, 95) - 1) * 4.4 +
    (opts.hasCustomHeader ? 4.4 : 0) +
    ((opts.businessName || "").length > 30 ? 7 : 0);
  const title = 8;
  const party = Math.max(33, 21 + wrappedLines(opts.customerAddress, 58) * 4.2);
  return seller + title + party;
};

export const estimateMotasClosingMm = (opts: {
  taxRows: number;
  terms: string[];
  hasNotes: boolean;
  hasWordsOverflow: boolean;
}) => {
  const totalRow = 7.5;
    // Amount in words, tax summary and note share the band beside the totals.
  const amountsBand = Math.max(
    30,
    12 + Math.max(1, opts.taxRows) * 4.6 + (opts.hasNotes ? 5 : 0) + (opts.hasWordsOverflow ? 4 : 0),
  );
  // Terms and bank details sit side by side, next to the signature.
  const termsBand = Math.max(33, 9 + opts.terms.reduce((n, t) => n + wrappedLines(t, 40), 0) * 4);
  return totalRow + amountsBand + termsBand;
};

/**
 * Split item indexes into sheets. Items fill each sheet; the closing block
 * (totals → signature) must fit under the last sheet's items, otherwise the
 * last rows move to a new sheet so the closing never prints without items.
 */
export function planMotasPages(
  rowHeightsMm: number[],
  opts: { headerMm: number; closingMm: number; theadMm?: number; frameMm?: number; slackMm?: number },
): number[][] {
  const frame = opts.frameMm ?? MOTAS_FRAME_MM;
  const itemArea = Math.max(
    20,
    frame - opts.headerMm - (opts.theadMm ?? TABLE_HEAD_MM) - PAGE_FOOTER_MM - (opts.slackMm ?? 0),
  );
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  rowHeightsMm.forEach((h, i) => {
    if (current.length > 0 && used + h > itemArea) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  });
  pages.push(current);

  const last = pages[pages.length - 1];
  const lastUsed = last.reduce((s, i) => s + rowHeightsMm[i], 0);
  if (lastUsed + opts.closingMm > itemArea) {
    // Closing does not fit under the last rows: carry the last row over so the
    // new sheet shows it with the totals (never a totals-only sheet).
    pages.push(last.length > 1 ? [last.pop() as number] : []);
  }
  return pages;
}

type MotasLine = {
  item: InvoiceItem;
  index: number;
  calc: InvoiceGstLineComputation;
};

/**
 * Motas A4 — tax invoice modelled on the MOTAS sample: # · Description ·
 * Qty · HSN · Unit · Taxable · Tax % · Total, billing block with
 * Invoice No / Date / Place of Supply / Due Date, HSN-wise tax summary.
 * Explicit A4 sheets so the header repeats on every page in print and PDF.
 */
export const MotasA4Template: React.FC<MotasA4TemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  dueDate,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  taxType: taxTypeProp = "inclusive",
  items,
  saleReturnAdjust = 0,
  roundOff,
  grandTotal,
  termsConditions,
  customHeaderText,
  customFooterText,
  bankDetails,
  qrCodeUrl,
  upiId,
  showBankDetails = true,
  notes,
  documentTitle,
  stampImageBase64,
  stampSize = "medium",
}) => {
  const taxType = normalizeGstTaxType(taxTypeProp);
  const breakdown = buildInvoiceGstBreakdown({
    items,
    taxType,
    grandTotal,
    saleReturnAdjust,
    sellerGstin: gstNumber,
    buyerGstin: customerGSTIN,
  });
  const { isInterState, taxableTotal, taxTotal } = breakdown;

  const lines: MotasLine[] = items.map((item, index) => ({
    item,
    index,
    calc: breakdown.lines[index],
  }));

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalAmount = lines.reduce((s, l) => s + (Number(l.calc.amount) || 0), 0);

  // HSN-wise tax summary (one row per HSN + rate).
  const hsnMap = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  lines.forEach((l) => {
    if (l.calc.gstPercent <= 0 && l.calc.gst <= 0) return;
    const hsn = clean(l.item.hsn) || EM_DASH;
    const key = `${hsn}|${l.calc.gstPercent}`;
    const cur = hsnMap.get(key) || { hsn, rate: l.calc.gstPercent, taxable: 0, tax: 0 };
    cur.taxable += l.calc.taxable;
    cur.tax += l.calc.gst;
    hsnMap.set(key, cur);
  });
  const hsnRows = Array.from(hsnMap.values());

  const placeOfSupply =
    formatPlaceOfSupplyFromGstin(customerGSTIN) || formatPlaceOfSupplyFromGstin(gstNumber) || EM_DASH;
  const sellerState = formatPlaceOfSupplyFromGstin(gstNumber);
  const customerState = formatPlaceOfSupplyFromGstin(customerGSTIN);

  const terms = (termsConditions || []).filter((t) => t?.trim());

  const bankName = bankDetails?.bankName || bankDetails?.bank_name || "";
  const bankAc = bankDetails?.accountNumber || bankDetails?.account_number || "";
  const bankIfsc = bankDetails?.ifscCode || bankDetails?.ifsc_code || "";
  const bankHolder = bankDetails?.accountHolder || bankDetails?.account_holder || "";
  const bankBranch = bankDetails?.branch || "";
  const hasBank = Boolean(showBankDetails && (bankName || bankAc || bankIfsc || bankHolder || bankBranch));

  const titleText = grandTotal < 0 ? "Credit Note" : documentTitle?.trim() || "Tax Invoice";
  // Stamp box inside the signatory column (46mm wide); the image keeps its aspect ratio.
  const stampMaxH = stampSize === "small" ? "13mm" : stampSize === "large" ? "21mm" : "17mm";
  const hasRoundOff = Math.abs(Number(roundOff) || 0) >= 0.005;
  const amountWords = numberToWords(grandTotal);

  const headerMm = estimateMotasHeaderMm({
    address,
    customerAddress,
    hasCustomHeader: Boolean(clean(customHeaderText)),
    businessName,
  });
  const closingMm = estimateMotasClosingMm({
    taxRows: hsnRows.length,
    terms,
    hasNotes: Boolean(clean(notes)),
    hasWordsOverflow: amountWords.length > 90,
  });

  // Measure real heights once per content change (hidden copy, removed before
  // paint) so sheets fill exactly; estimates cover jsdom / hidden containers.
  const layoutKey = JSON.stringify([
    items.map((i) => [i.particulars, i.size, i.color, i.qty, i.uom, i.hsn]),
    businessName,
    address,
    mobile,
    email,
    gstNumber,
    logoUrl,
    customHeaderText,
    customerName,
    customerAddress,
    customerMobile,
    customerGSTIN,
    terms,
    notes,
    hasBank,
    bankName,
    bankAc,
    bankIfsc,
    bankHolder,
    bankBranch,
    qrCodeUrl,
    upiId,
    hsnRows.length,
    hasRoundOff,
    saleReturnAdjust > 0,
    amountWords,
    stampImageBase64,
    stampSize,
  ]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    key: string;
    sizes: { headerMm: number; theadMm: number; closingMm: number; rowsMm: number[] } | null;
  } | null>(null);
  const needsMeasure = measured?.key !== layoutKey;

  useLayoutEffect(() => {
    if (!needsMeasure) return;
    const box = measureRef.current;
    const px = (el: Element | null | undefined) => ((el as HTMLElement | null)?.offsetHeight || 0) * (25.4 / 96);
    const headerH = px(box?.querySelector(".motas-a4-header"));
    const theadH = px(box?.querySelector("thead"));
    const closingH = px(box?.querySelector(".motas-a4-closing"));
    const rowsH = Array.from(box?.querySelectorAll("tbody.motas-a4-measure-rows > tr") || []).map((tr) => px(tr));
    const ok = headerH > 0 && theadH > 0 && closingH > 0 && rowsH.length === items.length && rowsH.every((h) => h > 0);
    setMeasured({
      key: layoutKey,
      sizes: ok ? { headerMm: headerH, theadMm: theadH, closingMm: closingH, rowsMm: rowsH } : null,
    });
  }, [needsMeasure, layoutKey, items.length]);

  const sizes = measured?.key === layoutKey ? measured.sizes : null;
  const pages = sizes
    ? planMotasPages(sizes.rowsMm, {
        headerMm: sizes.headerMm,
        theadMm: sizes.theadMm,
        closingMm: sizes.closingMm,
        slackMm: 2,
      })
    : planMotasPages(
        items.map((i) => estimateMotasRowMm(i)),
        { headerMm, closingMm, slackMm: 6 },
      );
  const pageCount = pages.length;

  const b = `1px solid ${GRID}`;
  const frameLine = `1.4px solid ${NAVY}`;

  const colWidths = ["4.5%", undefined, "7%", "7%", "9.5%", "12%", "8%", "12%"];
  const colGroup = (
    <colgroup>
      {colWidths.map((w, i) => (
        <col key={i} style={w ? { width: w } : undefined} />
      ))}
    </colgroup>
  );
  const gridTable: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
  const edge = (i: number, n: number): React.CSSProperties =>
    i === 0 ? { borderLeft: "none" } : i === n - 1 ? { borderRight: "none" } : {};

  const hCell: React.CSSProperties = {
    borderLeft: `1px solid ${NAVY_LINE}`,
    borderRight: `1px solid ${NAVY_LINE}`,
    padding: "6px 4px",
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    textAlign: "center",
    verticalAlign: "middle",
    color: "#fff",
    background: NAVY,
    ...printExact,
  };
  const cell: React.CSSProperties = {
    borderLeft: b,
    borderRight: b,
    borderBottom: `1px solid ${HAIR}`,
    padding: "4px 5px",
    fontSize: "11.5px",
    lineHeight: 1.25,
    verticalAlign: "middle",
    color: INK,
  };
  const num: React.CSSProperties = {
    ...cell,
    textAlign: "right",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  };
  const totalCell: React.CSSProperties = {
    ...cell,
    borderTop: `1.4px solid ${NAVY}`,
    borderBottom: `1.4px solid ${NAVY}`,
    padding: "6px 5px",
    fontWeight: 800,
    fontSize: "11.5px",
    background: TINT,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    ...printExact,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "10.5px",
    fontWeight: 800,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: NAVY,
  };
  const metaLabel: React.CSSProperties = {
    padding: "3px 0",
    fontSize: "11px",
    fontWeight: 600,
    color: MUTED,
    whiteSpace: "nowrap",
    verticalAlign: "top",
  };
  const metaValue: React.CSSProperties = {
    padding: "3px 0 3px 6px",
    fontSize: "12.5px",
    fontWeight: 700,
    color: INK,
    verticalAlign: "top",
  };
  const sumLabel: React.CSSProperties = {
    padding: "3px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#2d3748",
    borderBottom: `1px solid ${HAIR}`,
  };
  const sumValue: React.CSSProperties = {
    ...sumLabel,
    textAlign: "right",
    fontWeight: 700,
    color: INK,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  };
  // Explicit sizes on cells: print iframes in quirks mode don't pass table font-size down.
  const bankCell: React.CSSProperties = {
    padding: "0 6px 0 0",
    fontSize: "11px",
    lineHeight: 1.3,
    verticalAlign: "top",
  };
  const taxHead: React.CSSProperties = {
    border: b,
    padding: "2px 3px",
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    textAlign: "center",
    color: NAVY,
    background: TINT,
    ...printExact,
  };
  const taxCell: React.CSSProperties = {
    border: b,
    padding: "2px 3px",
    fontSize: "10.5px",
    textAlign: "center",
    color: INK,
    fontVariantNumeric: "tabular-nums",
  };

  const header = (
    <div className="motas-a4-header">
      {/* Shop */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "8px 14px 6px", gap: "12px" }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: "24mm", height: "24mm", objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", padding: logoUrl ? "0 24mm 0 0" : 0 }}>
          <div
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              lineHeight: 1.12,
              color: NAVY,
            }}
          >
            {businessName}
          </div>
          <div style={{ width: "34mm", height: "2px", margin: "3px auto 4px", background: GOLD, ...printExact }} />
          {address ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.35, whiteSpace: "pre-line", color: "#2d3748" }}>{address}</div>
          ) : null}
          {mobile || email ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.4, color: "#2d3748" }}>
              {email ? (
                <span>
                  <span style={{ color: MUTED }}>Email : </span>
                  {email}
                </span>
              ) : null}
              {mobile && email ? <span style={{ color: GRID }}>{"  |  "}</span> : null}
              {mobile ? (
                <span>
                  <span style={{ color: MUTED }}>Contact No. : </span>
                  <strong>{mobile}</strong>
                </span>
              ) : null}
            </div>
          ) : null}
          {gstNumber ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.4, fontWeight: 700, color: INK }}>
              GSTIN/UIN : {gstNumber}
              {sellerState ? (
                <span style={{ fontWeight: 600, color: "#2d3748" }}>{"    State : "}{sellerState}</span>
              ) : null}
            </div>
          ) : null}
          {clean(customHeaderText) ? (
            <div style={{ fontSize: "11px", lineHeight: 1.4, fontWeight: 600, color: "#2d3748" }}>{customHeaderText}</div>
          ) : null}
        </div>
      </div>

      {/* Title band */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          borderTop: `2px solid ${GOLD}`,
          background: NAVY,
          color: "#fff",
          padding: "4px 12px",
          ...printExact,
        }}
      >
        <div />
        <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "5px", textTransform: "uppercase", color: "#fff" }}>
          {titleText}
        </div>
        <div style={{ textAlign: "right", fontSize: "9.5px", fontWeight: 600, letterSpacing: "0.4px", color: "#e9d9a6" }}>
          Original / Duplicate / Transport
        </div>
      </div>

      {/* Billing address | invoice details */}
      <div style={{ display: "flex", borderBottom: frameLine }}>
        <div style={{ flex: 1, padding: "6px 14px 7px", minWidth: 0, borderRight: b }}>
          <div style={{ ...sectionLabel, marginBottom: "3px" }}>Billing Address</div>
          <div style={{ fontSize: "14px", fontWeight: 800, lineHeight: 1.25, color: INK }}>
            {customerName || "Walk-in Customer"}
          </div>
          {customerAddress ? (
            <div style={{ marginTop: "2px", fontSize: "11.5px", lineHeight: 1.35, whiteSpace: "pre-line", color: "#2d3748" }}>
              {customerAddress}
            </div>
          ) : null}
          {customerState ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.35, color: "#2d3748" }}>{customerState}, India</div>
          ) : null}
          {customerMobile ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.35, color: "#2d3748" }}>
              <span style={{ color: MUTED }}>Mo. : </span>
              {customerMobile}
            </div>
          ) : null}
          {customerGSTIN ? (
            <div style={{ fontSize: "11.5px", lineHeight: 1.35, fontWeight: 700, color: INK }}>
              <span style={{ color: MUTED, fontWeight: 600 }}>GSTIN : </span>
              {customerGSTIN}
            </div>
          ) : null}
        </div>
        <div style={{ width: "72mm", flexShrink: 0, padding: "6px 12px", background: TINT, ...printExact }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={metaLabel}>Invoice No.</td>
                <td style={{ ...metaLabel, padding: "3px 2px" }}>:</td>
                <td style={{ ...metaValue, fontSize: "14px", fontWeight: 800, color: NAVY }}>{invoiceNumber || EM_DASH}</td>
              </tr>
              <tr>
                <td style={metaLabel}>Invoice Date</td>
                <td style={{ ...metaLabel, padding: "3px 2px" }}>:</td>
                <td style={metaValue}>{formatInvoiceDate(invoiceDate)}</td>
              </tr>
              <tr>
                <td style={metaLabel}>Place of Supply</td>
                <td style={{ ...metaLabel, padding: "3px 2px" }}>:</td>
                <td style={metaValue}>{placeOfSupply}</td>
              </tr>
              <tr>
                <td style={metaLabel}>Due Date</td>
                <td style={{ ...metaLabel, padding: "3px 2px" }}>:</td>
                <td style={metaValue}>{formatInvoiceDate(dueDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const tableHead = (
    <thead>
      <tr>
        <th style={{ ...hCell, borderLeft: "none" }}>#</th>
        <th style={{ ...hCell, textAlign: "left", paddingLeft: "8px" }}>Description</th>
        <th style={hCell}>Qty</th>
        <th style={hCell}>HSN</th>
        <th style={{ ...hCell, textAlign: "right" }}>Unit</th>
        <th style={{ ...hCell, textAlign: "right" }}>Taxable</th>
        <th style={hCell}>Tax (%)</th>
        <th style={{ ...hCell, borderRight: "none", textAlign: "right" }}>Total</th>
      </tr>
    </thead>
  );

  const renderRow = (l: MotasLine, zebra: boolean) => {
    const variant = [l.item.color, l.item.size].map(variantText).filter(Boolean).join(" / ");
    const bg: React.CSSProperties = zebra ? { background: ZEBRA, ...printExact } : {};
    return (
      <tr key={`${l.item.sr}-${l.index}`}>
        <td style={{ ...cell, ...bg, borderLeft: "none", textAlign: "center", color: MUTED }}>{l.index + 1}</td>
        <td style={{ ...cell, ...bg, textAlign: "left", paddingLeft: "8px", wordBreak: "break-word" }}>
          <div style={{ fontWeight: 700 }}>{l.item.particulars}</div>
          {variant ? <div style={{ fontSize: "10px", color: MUTED }}>{variant}</div> : null}
        </td>
        <td style={{ ...num, ...bg, textAlign: "center", fontWeight: 700 }}>
          {fmtQty(l.item.qty)}
          {l.item.uom ? <span style={{ fontWeight: 400, color: MUTED }}> {l.item.uom}</span> : null}
        </td>
        <td style={{ ...cell, ...bg, textAlign: "center" }}>{clean(l.item.hsn) || EM_DASH}</td>
        <td style={{ ...num, ...bg }}>{fmt(l.calc.unitRate)}</td>
        <td style={{ ...num, ...bg }}>{fmt(l.calc.taxable)}</td>
        <td style={{ ...num, ...bg, textAlign: "center", color: MUTED }}>{fmtPct(l.calc.gstPercent)}</td>
        <td style={{ ...num, ...bg, borderRight: "none", fontWeight: 800 }}>{fmt(l.calc.amount)}</td>
      </tr>
    );
  };

  const closing = (
    <div className="motas-a4-closing">
      <table style={gridTable}>
        {colGroup}
        <tbody>
          <tr>
            <td style={{ ...totalCell, borderLeft: "none", textAlign: "right" }} colSpan={2}>
              Total
              <span style={{ fontWeight: 500, fontSize: "10.5px", color: MUTED, marginLeft: "6px" }}>
                ({items.length} {items.length === 1 ? "item" : "items"})
              </span>
            </td>
            <td style={{ ...totalCell, textAlign: "center" }}>{fmtQty(totalQty)}</td>
            <td style={totalCell} />
            <td style={totalCell} />
            <td style={{ ...totalCell, textAlign: "right" }}>{fmt(taxableTotal)}</td>
            <td style={{ ...totalCell, textAlign: "center" }}>{fmt(taxTotal)}</td>
            <td style={{ ...totalCell, borderRight: "none", textAlign: "right" }}>{fmt(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words · tax summary · note | amounts */}
      <div style={{ display: "flex", borderBottom: b }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "5px 8px",
            borderRight: b,
            background: TINT,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "4px",
            ...printExact,
          }}
        >
          <div style={{ fontSize: "11px", lineHeight: 1.35 }}>
            <span style={{ ...sectionLabel, marginRight: "6px" }}>Amount in Words</span>
            <span style={{ fontWeight: 700, fontStyle: "italic", color: INK }}>{amountWords}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...taxHead, width: "15%" }}>HSN</th>
                <th rowSpan={2} style={{ ...taxHead, width: "19%" }}>Taxable Value</th>
                {isInterState ? (
                  <th colSpan={2} style={taxHead}>Integrated Tax</th>
                ) : (
                  <>
                    <th colSpan={2} style={taxHead}>Central Tax</th>
                    <th colSpan={2} style={taxHead}>State Tax</th>
                  </>
                )}
                <th rowSpan={2} style={{ ...taxHead, width: "15%" }}>Total Tax</th>
              </tr>
              <tr>
                <th style={taxHead}>Rate</th>
                <th style={taxHead}>Amount</th>
                {isInterState ? null : (
                  <>
                    <th style={taxHead}>Rate</th>
                    <th style={taxHead}>Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {hsnRows.length === 0 ? (
                <tr>
                  <td colSpan={isInterState ? 5 : 7} style={{ ...taxCell, color: MUTED }}>
                    No tax on this bill
                  </td>
                </tr>
              ) : (
                hsnRows.map((r) => (
                  <tr key={`${r.hsn}-${r.rate}`}>
                    <td style={taxCell}>{r.hsn}</td>
                    <td style={taxCell}>{fmt(r.taxable)}</td>
                    {isInterState ? (
                      <>
                        <td style={taxCell}>{fmtPct(r.rate)}</td>
                        <td style={taxCell}>{fmt(r.tax)}</td>
                      </>
                    ) : (
                      <>
                        <td style={taxCell}>{fmtPct(r.rate / 2)}</td>
                        <td style={taxCell}>{fmt(r.tax / 2)}</td>
                        <td style={taxCell}>{fmtPct(r.rate / 2)}</td>
                        <td style={taxCell}>{fmt(r.tax / 2)}</td>
                      </>
                    )}
                    <td style={{ ...taxCell, fontWeight: 700 }}>{fmt(r.tax)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {clean(notes) ? (
            <div style={{ fontSize: "11px", lineHeight: 1.35, whiteSpace: "pre-line", color: INK }}>
              <span style={{ color: MUTED, fontWeight: 700 }}>Note : </span>
              {notes}
            </div>
          ) : null}
        </div>
        <div style={{ width: "72mm", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={sumLabel}>Taxable Amount</td>
                <td style={sumValue}>{rupee(fmt(taxableTotal))}</td>
              </tr>
              <tr>
                <td style={sumLabel}>GST Amount</td>
                <td style={sumValue}>{rupee(fmt(taxTotal))}</td>
              </tr>
              {hasRoundOff ? (
                <tr>
                  <td style={sumLabel}>Round Off</td>
                  <td style={sumValue}>
                    {roundOff < 0 ? "-" : ""}
                    {fmt(Math.abs(roundOff))}
                  </td>
                </tr>
              ) : null}
              {saleReturnAdjust > 0 ? (
                <tr>
                  <td style={sumLabel}>Less: S/R Adjust</td>
                  <td style={sumValue}>-{fmt(saleReturnAdjust)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 12px",
              background: NAVY,
              borderTop: `2px solid ${GOLD}`,
              color: "#fff",
              ...printExact,
            }}
          >
            <span style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#fff" }}>
              Net Amount
            </span>
            <span style={{ fontSize: "18px", fontWeight: 800, whiteSpace: "nowrap", color: "#fff" }}>{rupee(fmt(grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Terms | bank details | signature */}
      <div style={{ display: "flex", minHeight: "28mm" }}>
        <div style={{ flex: 1, padding: "5px 12px", borderRight: `1px dashed ${GRID}`, minWidth: 0 }}>
          <div style={{ ...sectionLabel, marginBottom: "3px" }}>Terms &amp; Conditions</div>
          {terms.length > 0 ? (
            <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "10px", lineHeight: 1.35, color: "#2d3748", fontWeight: 600 }}>
              {terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          ) : null}
        </div>
        <div style={{ flex: 1.3, padding: "5px 10px 5px 12px", borderRight: b, minWidth: 0, display: "flex", gap: "6px", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...sectionLabel, marginBottom: "3px" }}>Bank Details</div>
            {hasBank ? (
              <table style={{ borderCollapse: "collapse", fontSize: "11px", lineHeight: 1.3 }}>
                <tbody>
                  {[
                    ["Bank Name", bankName],
                    ["A/c Name", bankHolder],
                    ["A/c No.", bankAc],
                    ["IFSC", bankIfsc],
                    ["Branch", bankBranch],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ ...bankCell, color: MUTED, whiteSpace: "nowrap" }}>{label}</td>
                        <td style={{ ...bankCell, color: MUTED }}>:</td>
                        <td
                          style={{
                            ...bankCell,
                            padding: 0,
                            fontWeight: 700,
                            color: INK,
                            ...(label === "A/c No." || label === "IFSC" ? { whiteSpace: "nowrap" } : { wordBreak: "break-word" }),
                          }}
                        >
                          {value}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: "11px", color: MUTED }}>{EM_DASH}</div>
            )}
          </div>
          {qrCodeUrl ? (
            <div style={{ width: "21mm", flexShrink: 0, textAlign: "center" }}>
              <img src={qrCodeUrl} alt="UPI QR" style={{ width: "18mm", height: "18mm", objectFit: "contain" }} />
              <div style={{ fontSize: "8px", fontWeight: 700, color: "#2d3748", wordBreak: "break-all", lineHeight: 1.15 }}>
                {upiId || "Scan & Pay"}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ width: "46mm", flexShrink: 0, padding: "5px 8px", textAlign: "center", display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 800, fontSize: "12px", color: NAVY }}>For, {businessName}</div>
          <div
            style={{
              flex: 1,
              minHeight: stampImageBase64 ? `calc(${stampMaxH} + 4px)` : "14mm",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 0",
            }}
          >
            {stampImageBase64 ? (
              <img
                src={stampImageBase64}
                alt=""
                style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: stampMaxH }}
              />
            ) : null}
          </div>
          <div style={{ borderTop: `1px solid ${GRID}`, paddingTop: "3px", fontWeight: 700, fontSize: "11px", color: "#2d3748" }}>
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="motas-a4-invoice-root" style={{ position: "relative", width: "210mm", background: "#fff", color: INK }}>
      <style>{`
        @page { size: A4 portrait; margin: 0 !important; }
        @media print {
          .motas-a4-invoice-root { width: 210mm !important; margin: 0 !important; padding: 0 !important; }
          .motas-a4-page {
            width: 210mm !important;
            height: 296.5mm !important;
            min-height: 0 !important;
            padding: 6mm !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            overflow: hidden !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .motas-a4-page:not(:last-child) { page-break-after: always; break-after: page; }
          .motas-a4-measure { display: none !important; }
          .motas-a4-invoice-root,
          .motas-a4-invoice-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      {needsMeasure ? (
        <div
          ref={measureRef}
          className="motas-a4-measure"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            top: 0,
            width: "198mm",
            visibility: "hidden",
            pointerEvents: "none",
            border: frameLine,
            boxSizing: "border-box",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "11.5px",
            color: INK,
          }}
        >
          {header}
          <table style={gridTable}>
            {colGroup}
            {tableHead}
            <tbody className="motas-a4-measure-rows">{lines.map((l) => renderRow(l, false))}</tbody>
          </table>
          {closing}
        </div>
      ) : null}
      {pages.map((pageIdx, p) => {
        const isLast = p === pageCount - 1;
        return (
          <div
            key={p}
            className="motas-a4-page"
            style={{
              width: "210mm",
              height: "297mm",
              padding: "6mm",
              boxSizing: "border-box",
              overflow: "hidden",
              background: "#fff",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "11.5px",
              color: INK,
            }}
          >
            <div
              style={{
                height: "100%",
                border: frameLine,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {header}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <table style={gridTable}>
                  {colGroup}
                  {tableHead}
                  <tbody>{pageIdx.map((i, r) => renderRow(lines[i], r % 2 === 1))}</tbody>
                </table>
                {/* Column lines run down to the totals band / page foot. */}
                <div aria-hidden="true" style={{ flex: 1, position: "relative", minHeight: "2mm" }}>
                  <table style={{ ...gridTable, position: "absolute", top: 0, left: 0, height: "100%" }}>
                    {colGroup}
                    <tbody>
                      <tr>
                        {colWidths.map((_, i) => (
                          <td key={i} style={{ borderLeft: b, borderRight: b, padding: 0, ...edge(i, colWidths.length) }} />
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {isLast ? closing : null}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  borderTop: b,
                  padding: "2px 10px",
                  fontSize: "9.5px",
                  color: MUTED,
                  height: "5mm",
                  boxSizing: "border-box",
                }}
              >
                <span>{customFooterText?.trim() || "This is a computer generated invoice."}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>
                  {`Page ${p + 1} of ${pageCount}`}
                </span>
                <span style={{ textAlign: "right" }}>{isLast ? "E. & O.E." : "Continued on next page…"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MotasA4Template;
