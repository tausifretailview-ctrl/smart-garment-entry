import React from "react";
import { numberToWords } from "@/lib/utils";

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
  gstPercent?: number;
  discountPercent?: number;
  itemNotes?: string;
}

interface RetailERPTemplateProps {
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
  creditAmount?: number;
  paidAmount?: number;
  previousBalance?: number;
  pointsRedeemedAmount?: number;

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
  otherCharges?: number;

  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  showDiscountOnRate?: boolean;
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
  /** Sale settings — e.g. BILL OF SUPPLY, CATERING SERVICE (Real Tast A4). */
  documentTitle?: string;

  salesman?: string;

  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: "size/qty" | "size×qty";
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;

  stampImageBase64?: string;
  stampPosition?: string;
  stampSize?: string;
  financerDetails?: any;
  instagramLink?: string;
  /** Real Tast — Bill of Supply A4 (no size, payment, balance, state code).
   *  Preprinted — same tax layout as standard, but 2in top gap for letterhead (no shop name/logo). */
  variant?: "standard" | "real-tast" | "preprinted";
}

const B = "1px solid #000";
const B2 = "2px solid #000";

export const RetailERPTemplate: React.FC<RetailERPTemplateProps> = ({
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
  taxableAmount,
  cgstAmount,
  sgstAmount,
  igstAmount,
  totalTax,
  roundOff,
  grandTotal,
  paymentMethod,
  cashAmount,
  cardAmount,
  upiAmount,
  creditAmount,
  paidAmount = 0,
  previousBalance = 0,
  pointsRedeemedAmount = 0,
  qrCodeUrl,
  termsConditions = [],
  notes,
  otherCharges = 0,
  showHSN = true,
  showDiscountOnRate = true,
  showGSTBreakdown = true,
  amountWithDecimal = true,
  amountWithGrouping = true,
  format = "a5-vertical",
  minItemRows = 12,
  salesman,
  customHeaderText,
  documentTitle,
  stampImageBase64,
  stampPosition = "bottom-right",
  stampSize = "medium",
  instagramLink,
  variant = "standard",
}) => {
  const isRealTast = variant === "real-tast";
  const isPreprinted = variant === "preprinted";
  const isA4 = format === "a4" || isRealTast;
  const isA5Retail = !isA4 && !isRealTast;
  /** A5 letterhead leaf: 2in top gap leaves ~159mm — must avoid filler rows or footer spills to page 2. */
  const isPreprintedA5 = isPreprinted && isA5Retail;
  const invoiceNoteText =
    notes && notes.trim() && !/^\d+$/.test(notes.trim()) ? notes.trim() : "";
  const MAX_ITEMS_PER_PAGE = isA4 ? 20 : isPreprintedA5 ? 10 : 12;
  const TARGET_ROWS = isPreprintedA5
    ? Math.max(items.length, Math.min(items.length + 1, 5))
    : isA4
      ? Math.max(14, minItemRows)
      : Math.max(8, minItemRows);
  const MIN_BLANK_ROWS = isPreprintedA5 ? 0 : 2;

  const fmt = (amount: number) => {
    const value = amountWithDecimal ? amount.toFixed(2) : Math.round(amount).toString();
    if (amountWithGrouping) {
      const parts = value.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }
    return value;
  };

  // Split items into pages
  const itemPages: (InvoiceItem | null)[][] = [];
  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_PAGE) {
    const chunk: (InvoiceItem | null)[] = items.slice(i, i + MAX_ITEMS_PER_PAGE);
    itemPages.push(chunk);
  }
  if (itemPages.length > 0) {
    const lastPage = itemPages[itemPages.length - 1];
    const minRows = Math.max(TARGET_ROWS, lastPage.length, MIN_BLANK_ROWS);
    while (lastPage.length < minRows) {
      lastPage.push(null);
      if (lastPage.length >= MAX_ITEMS_PER_PAGE) break;
    }
  }
  if (itemPages.length === 0) {
    const blank: (InvoiceItem | null)[] = Array(TARGET_ROWS).fill(null);
    itemPages.push(blank);
  }

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  // Retail ERP invoice requirement:
  // show pre-discount sale rate in Rate column and net value in Amount column.
  const getDisplayBaseRate = (item: InvoiceItem) => {
    const mrp = Number(item.mrp || 0);
    const rate = Number(item.rate || 0);
    return mrp > 0 && mrp > rate ? mrp : rate;
  };
  const displaySubTotal = items.reduce((sum, item) => sum + getDisplayBaseRate(item) * (Number(item.qty) || 0), 0);
  const merchandiseNetBeforeAdjustments = Number(grandTotal || 0) + Number(saleReturnAdjust || 0) - Number(roundOff || 0);
  const computedDiscountFromLines = Math.max(0, displaySubTotal - merchandiseNetBeforeAdjustments);
  const displayDiscount = computedDiscountFromLines > 0 ? computedDiscountFromLines : Math.max(0, Number(discount || 0));
  const explicitOtherCharges = Math.max(0, Number(otherCharges || 0));
  const derivedOtherCharges = Math.max(
    0,
    Number(grandTotal || 0) - displaySubTotal + Number(saleReturnAdjust || 0) - displayDiscount - Number(roundOff || 0)
  );
  const displayOtherCharges =
    explicitOtherCharges > 0.005 ? explicitOtherCharges : derivedOtherCharges > 0.005 ? derivedOtherCharges : 0;
  const totalsLabel = "Sub Total";
  const totalsValue = displaySubTotal;

  // Split bill discount across lines (line % first, then flat discount by gross weight).
  const getLineGross = (item: InvoiceItem) =>
    getDisplayBaseRate(item) * (Number(item.qty) || 0);
  const allocateByGrossWeight = (totalToAllocate: number): number[] => {
    const grosses = items.map(getLineGross);
    const grossTotal = grosses.reduce((s, g) => s + g, 0);
    if (totalToAllocate <= 0.005 || grossTotal <= 0.005) return items.map(() => 0);
    const shares: number[] = [];
    let allocated = 0;
    for (let i = 0; i < items.length; i++) {
      if (i === items.length - 1) {
        shares.push(Math.round((totalToAllocate - allocated) * 100) / 100);
      } else {
        const share = Math.round((grosses[i] / grossTotal) * totalToAllocate * 100) / 100;
        shares.push(share);
        allocated += share;
      }
    }
    return shares;
  };
  const lineItemOnlyDiscounts = items.map((item) =>
    Math.max(0, Math.round((getLineGross(item) - Number(item.total || 0)) * 100) / 100),
  );
  const lineItemDiscountSum = lineItemOnlyDiscounts.reduce((s, d) => s + d, 0);
  const flatDiscountPool = Math.max(
    0,
    Math.round((displayDiscount - lineItemDiscountSum) * 100) / 100,
  );
  const flatDiscountShares = allocateByGrossWeight(flatDiscountPool);
  const lineBillDiscounts = items.map(
    (_, i) => Math.round((lineItemOnlyDiscounts[i] + flatDiscountShares[i]) * 100) / 100,
  );
  const lineNetAmounts = items.map((item, i) =>
    Math.round((getLineGross(item) - lineBillDiscounts[i]) * 100) / 100,
  );

  // GST breakup calculation — group by rate
  const gstBreakup: Record<number, { hsn: string; taxableValue: number; cgst: number; sgst: number; igst: number }> = {};
  const isInterState = igstAmount > 0;

  items.forEach((item) => {
    const gstPct = item.gstPercent || 0;
    if (gstPct > 0) {
      const taxOnItem = (item.total * gstPct) / (100 + gstPct);
      const taxableVal = item.total - taxOnItem;
      if (!gstBreakup[gstPct]) {
        gstBreakup[gstPct] = { hsn: item.hsn || "", taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      gstBreakup[gstPct].taxableValue += taxableVal;
      if (isInterState) {
        gstBreakup[gstPct].igst += taxOnItem;
      } else {
        gstBreakup[gstPct].cgst += taxOnItem / 2;
        gstBreakup[gstPct].sgst += taxOnItem / 2;
      }
      if (!gstBreakup[gstPct].hsn && item.hsn) gstBreakup[gstPct].hsn = item.hsn;
    }
  });

  const gstRates = Object.keys(gstBreakup).map(Number).sort((a, b) => a - b);
  const hasGSTData = gstRates.length > 0;

  // Calculate totals
  const totalBeforeTax = Object.values(gstBreakup).reduce((s, v) => s + v.taxableValue, 0);

  // Payment breakdown (mix / multiple — show total + per-mode amounts on print)
  const cashPaidAmt = Number(cashAmount) || 0;
  const upiPaidAmt = Number(upiAmount) || 0;
  const cardPaidAmt = Number(cardAmount) || 0;
  const creditPaidAmt = Number(creditAmount) || 0;
  const paymentParts: string[] = [];
  if (cashPaidAmt > 0) paymentParts.push(`Cash: ₹${fmt(cashPaidAmt)}`);
  if (upiPaidAmt > 0) paymentParts.push(`UPI: ₹${fmt(upiPaidAmt)}`);
  if (cardPaidAmt > 0) paymentParts.push(`Card: ₹${fmt(cardPaidAmt)}`);
  if (creditPaidAmt > 0) paymentParts.push(`Credit: ₹${fmt(creditPaidAmt)}`);
  const mixTenderTotal = cashPaidAmt + upiPaidAmt + cardPaidAmt + creditPaidAmt;
  const isMixPayment = String(paymentMethod || "").toLowerCase() === "multiple";
  const mixPaymentDetail =
    isMixPayment && paymentParts.length > 0
      ? `Total ₹${fmt(mixTenderTotal > 0 ? mixTenderTotal : grandTotal)} (${paymentParts.join(" | ")})`
      : paymentParts.length > 1
        ? paymentParts.join(" | ")
        : "";

  const billTotal = grandTotal;
  const receivedToday = mixTenderTotal > 0 ? mixTenderTotal : Number(paidAmount) || 0;
  const currentBalance = billTotal - receivedToday;
  const totalDue = currentBalance + previousBalance;

  const pageW = isA4 ? "210mm" : "148mm";
  const pageH = isA4 ? "297mm" : "210mm";
  const pad = isPreprintedA5 ? "2mm" : isA4 ? "10mm" : "4mm";
  const letterheadGap = isPreprinted ? "2in" : pad;
  const fsBody = isPreprintedA5 ? "10px" : isA4 ? "13px" : "12px";
  const fsHeader = isPreprintedA5 ? "10px" : isA4 ? "14px" : "12px";
  const fsHeading = isPreprintedA5 ? "10px" : isA4 ? "13px" : "12px";
  const fsTotals = isPreprintedA5 ? "11px" : isA4 ? "14px" : "13px";
  const fsGrand = isPreprintedA5 ? "13px" : isA4 ? "16px" : "15px";
  const fsFooterMeta = isPreprintedA5 ? "9px" : isA4 ? "14px" : "10px";
  const fsFooterBalance = isPreprintedA5 ? "9px" : isA4 ? "15px" : "10px";
  const fsNoteLabel = isPreprintedA5 ? "10px" : isA4 ? "13px" : "12px";
  const fsNoteBody = isPreprintedA5 ? "10px" : isA4 ? "14px" : "13px";
  const fsSrAdjust = isPreprintedA5 ? "11px" : isA4 ? "15px" : "14px";
  const titleFs = isPreprintedA5 ? "12px" : isA4 ? "16px" : "14px";
  const fsCustName = isPreprintedA5 ? "11px" : isA4 ? "15px" : "14px";
  const fsCustDetail = isPreprintedA5 ? "9px" : isA4 ? "14px" : "12px";
  const fsInvoiceNo = isPreprintedA5 ? "10px" : isA4 ? "15px" : "13px";
  const fsDiscMedium = isPreprintedA5 ? "8px" : isA4 ? "11px" : "10px";

  const ROW_H = isPreprintedA5 ? "16px" : isA4 ? "26px" : "22px";
  const ROW_H_WITH_DISC = isPreprintedA5 ? "22px" : isA4 ? "36px" : "30px";

  // Real Tast: no size or barcode; HSN optional via show_hsn_code setting
  const showHSNCol = showHSN;
  const showBarcodeCol = !isRealTast;

  const cols: { key: string; label: string; width: string; align: "center" | "left" | "right" }[] = [
    { key: "sr", label: "SN", width: isRealTast ? "4%" : isA5Retail ? "5%" : "5%", align: "center" },
    {
      key: "description",
      label: "DESCRIPTION",
      width: isRealTast
        ? (showHSNCol ? "47%" : "54%")
        : isA5Retail
          ? (showHSNCol ? "24%" : "30%")
          : showHSNCol
            ? "24%"
            : "30%",
      align: "left",
    },
    ...(isRealTast
      ? []
      : [{ key: "size", label: "SIZE", width: "6%", align: "center" as const }]),
    ...(showBarcodeCol
      ? [{ key: "barcode", label: "BARCODE", width: "14%", align: "center" as const }]
      : []),
  ];
  if (showHSNCol) {
    cols.push({ key: "hsn", label: "HSN", width: isRealTast ? "10%" : "7%", align: "center" });
  }
  cols.push({ key: "qty", label: "QTY", width: isRealTast ? "6%" : "6%", align: "center" });
  cols.push({ key: "rate", label: "RATE", width: isRealTast ? (showHSNCol ? "11%" : "12%") : "12%", align: "right" });
  cols.push({ key: "amount", label: "AMOUNT", width: isRealTast ? (showHSNCol ? "12%" : "13%") : "14%", align: "right" });

  const cellBase: React.CSSProperties = {
    borderRight: B,
    borderBottom: B,
    padding: isA4 ? "2px 5px" : "1px 3px",
    fontSize: fsBody,
    fontWeight: "bold",
    verticalAlign: "middle",
    lineHeight: "1.25",
    height: ROW_H,
    minHeight: ROW_H,
    maxHeight: ROW_H,
    overflow: "hidden",
  };

  const stampSizeMap: Record<string, string> = { small: "60px", medium: "90px", large: "120px" };
  const stampDim = stampSizeMap[stampSize] || "90px";
  const qrBoxMm = isPreprintedA5 ? 15 : isA4 ? 26 : 20;
  const qrPadMm = isPreprintedA5 ? 0.5 : isA4 ? 2 : 1;
  const showPaymentQr = Boolean(qrCodeUrl && !isRealTast);
  const signColWidth = isA5Retail ? (showPaymentQr ? "34%" : "38%") : "40%";

  return (
    <div className="retail-erp-all-pages">
      {itemPages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === itemPages.length - 1;
        const pageStartSr = pageIndex * MAX_ITEMS_PER_PAGE;
        let srCounter = 0;

        return (
          <div
            key={pageIndex}
            className="retail-erp-invoice-template bg-white text-black"
            data-invoice-variant={
              isRealTast ? "real-tast" : isPreprinted ? "preprinted" : undefined
            }
            style={{
              width: pageW,
              ...(isRealTast
                ? { minHeight: pageH, height: pageH }
                : isPreprintedA5
                  ? { height: pageH, maxHeight: pageH, overflow: "hidden" }
                : isA5Retail && !isPreprinted
                  ? { maxHeight: pageH, overflow: "hidden" }
                  : {}),
              // Preprinted letterhead: reserve 2in from page top, then Tax Invoice body.
              paddingTop: isPreprinted ? letterheadGap : pad,
              paddingRight: pad,
              paddingBottom: isPreprintedA5 ? "1.5mm" : pad,
              paddingLeft: pad,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: fsBody,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: isRealTast || isPreprintedA5 ? "hidden" : "visible",
            }}
          >
            <div
              style={{
                border: B2,
                ...(isRealTast || isPreprintedA5 ? { flex: 1, minHeight: 0 } : {}),
                display: "flex",
                flexDirection: "column",
                overflow: isRealTast || isPreprintedA5 ? "hidden" : "visible",
                justifyContent: isRealTast ? "space-between" : "flex-start",
              }}
            >

              {/* ===== HEADER — Center Aligned (skipped for preprinted letterhead) ===== */}
              {!isPreprinted && (
              <div style={{ borderBottom: B2, padding: isA4 ? "6px 10px 4px" : "3px 6px 2px", textAlign: "center", position: "relative" }}>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    style={{
                      height: isA4 ? "80px" : "48px",
                      maxWidth: isA4 ? "160px" : "96px",
                      objectFit: "contain",
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  />
                )}
                <div style={{ fontSize: isA4 ? "26px" : "17px", fontWeight: "900", letterSpacing: "2px", color: "#000" }}>
                  {businessName}
                </div>
                <div style={{ fontSize: isA4 ? "12px" : "9px", marginTop: "2px", lineHeight: 1.5, fontWeight: "600", color: "#111" }}>
                  {address}
                </div>
                <div style={{ fontSize: isA4 ? "12px" : "9px", lineHeight: 1.4, fontWeight: "600", color: "#111" }}>
                  {mobile && `Mob: ${mobile}`}
                  {email && ` | ${email}`}
                </div>
                {gstNumber && (
                  <div style={{ fontSize: isA4 ? "12px" : "9px", fontWeight: "bold", color: "#000", marginTop: "1px" }}>GSTIN: {gstNumber}</div>
                )}
                {instagramLink && (
                  <div style={{ fontSize: isA4 ? "13px" : "10px", color: "#000", fontWeight: "bold", marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    <svg width={isA4 ? "14" : "11"} height={isA4 ? "14" : "11"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <circle cx="12" cy="12" r="5"/>
                      <circle cx="17.5" cy="6.5" r="1.5"/>
                    </svg>
                    <span>{instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '')}</span>
                  </div>
                )}
                {customHeaderText && (
                  <div style={{ fontSize: isA4 ? "10px" : "8px", color: "#333", marginTop: "1px" }}>{customHeaderText}</div>
                )}
              </div>
              )}

              {/* ===== TAX INVOICE / CREDIT NOTE — flush, no gap ===== */}
              <div style={{ textAlign: "center", fontWeight: "bold", fontSize: titleFs, borderBottom: B2, padding: "1px 0", lineHeight: "1.2", margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>
                {(() => {
                  const docTitle =
                    grandTotal < 0
                      ? "CREDIT NOTE"
                      : isRealTast
                        ? (documentTitle?.trim() || "BILL OF SUPPLY")
                        : "TAX INVOICE";
                  return itemPages.length > 1
                    ? `${docTitle}${pageIndex > 0 ? ` (Page ${pageIndex + 1} of ${itemPages.length})` : ""}`
                    : docTitle;
                })()}
              </div>

              {/* ===== BILL TO + INVOICE INFO — boxed sub-grid ===== */}
              <div style={{ display: "flex", borderBottom: B2, fontSize: fsHeader, lineHeight: 1.3 }}>
                <div style={{ flex: 1, padding: isA4 ? "2px 8px" : "2px 6px", borderRight: B }}>
                  <div style={{ fontWeight: "bold", fontSize: isA4 ? "10px" : "8px" }}>BILL TO:</div>
                  <div style={{ fontWeight: "bold", fontSize: fsCustName }}>{customerName || "Walk-in Customer"}</div>
                  {customerAddress && <div style={{ fontSize: fsCustDetail }}>{customerAddress}</div>}
                  {customerMobile && <div style={{ fontSize: fsCustDetail }}>Ph: {customerMobile}</div>}
                  {!isRealTast && customerGSTIN && (
                    <div style={{ fontSize: fsCustDetail }}>GSTIN: {customerGSTIN}</div>
                  )}
                </div>
                <div style={{ width: "40%", padding: "0" }}>
                  <div style={{ display: "flex", borderBottom: B }}>
                    <div style={{ flex: 1, padding: isA4 ? "2px 8px" : "2px 6px", fontWeight: "bold", fontSize: fsInvoiceNo }}>
                      {isRealTast ? "Supply No" : "Invoice No"}: {invoiceNumber}
                    </div>
                  </div>
                  <div style={{ display: "flex", borderBottom: B }}>
                    <div style={{ flex: 1, padding: isA4 ? "2px 8px" : "2px 6px", fontSize: fsInvoiceNo, fontWeight: "bold" }}>
                      Date:{" "}
                      {invoiceDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {!isRealTast && invoiceTime ? ` ${invoiceTime}` : ""}
                    </div>
                  </div>
                  {gstNumber && !isRealTast && (
                    <div style={{ display: "flex", borderBottom: B }}>
                      <div style={{ flex: 1, padding: isA4 ? "2px 8px" : "2px 6px", fontSize: fsCustDetail }}>
                        <strong>State Code:</strong> {gstNumber.substring(0, 2)}
                      </div>
                    </div>
                  )}
                  {salesman && (
                    <div style={{ display: "flex" }}>
                      <div style={{ flex: 1, padding: isA4 ? "2px 8px" : "2px 6px", fontSize: fsCustDetail }}>
                        <strong>Salesman:</strong> {salesman}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ===== ITEMS TABLE — Full Grid ===== */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  flex: isRealTast ? 1 : isA5Retail ? "0 0 auto" : isLastPage ? "0 0 auto" : "1 1 auto",
                }}
              >
                <colgroup>
                  {cols.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ height: isA4 ? "22px" : "16px" }}>
                    {cols.map((c, ci) => (
                      <th
                        key={c.key}
                        style={{
                          ...cellBase,
                          textAlign: c.align,
                          borderTop: "none",
                          borderBottom: B2,
                          fontWeight: "bold",
                          fontSize: fsHeading,
                          backgroundColor: "#333",
                          color: "#fff",
                          borderRight: ci === cols.length - 1 ? "none" : B,
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, idx) => {
                    if (item) srCounter++;
                    const srNo = pageStartSr + idx + 1;
                    const itemGlobalIdx = item ? pageStartSr + srCounter - 1 : -1;
                    const lineDisc =
                      itemGlobalIdx >= 0 ? lineBillDiscounts[itemGlobalIdx] ?? 0 : 0;
                    const rowHasDisc = lineDisc > 0.005;
                    return (
                      <tr key={idx} style={{ height: rowHasDisc ? ROW_H_WITH_DISC : ROW_H }}>
                        {cols.map((c, ci) => {
                          const isLast = ci === cols.length - 1;
                          const style: React.CSSProperties = {
                            ...cellBase,
                            textAlign: c.align,
                            borderRight: isLast ? "none" : B,
                            ...(isRealTast &&
                            (c.key === "rate" || c.key === "amount" || c.key === "qty" || c.key === "hsn")
                              ? {
                                  padding: isA4 ? "2px 3px" : cellBase.padding,
                                  fontFamily: "ui-monospace, Consolas, Monaco, monospace",
                                  fontVariantNumeric: "tabular-nums",
                                  whiteSpace: "nowrap",
                                }
                              : {}),
                            ...(isRealTast && c.key === "description"
                              ? { padding: isA4 ? "2px 6px" : cellBase.padding }
                              : {}),
                            ...(rowHasDisc && c.key === "amount"
                              ? {
                                  maxHeight: "none",
                                  height: "auto",
                                  minHeight: ROW_H_WITH_DISC,
                                  overflow: "visible",
                                }
                              : {}),
                          };
                          let content: React.ReactNode = "\u00A0";
                          if (item) {
                            switch (c.key) {
                              case "sr": content = srNo; break;
                              case "description":
                                content = (
                                  <span
                                    style={{
                                      overflow: isRealTast ? "visible" : "hidden",
                                      textOverflow: isRealTast ? "clip" : "ellipsis",
                                      whiteSpace: isRealTast ? "normal" : "nowrap",
                                      display: "block",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {item.particulars}
                                    {item.color && <span style={{ fontSize: "9px", marginLeft: "3px" }}>({item.color})</span>}
                                    {item.itemNotes ? (
                                      <span style={{ display: "block", fontSize: "8px", color: "#666", fontStyle: "italic", whiteSpace: "normal" }}>
                                        {item.itemNotes}
                                      </span>
                                    ) : null}
                                  </span>
                                );
                                break;
                              case "size": content = item.size || ""; break;
                              case "barcode":
                                content = (
                                  <span
                                    style={{
                                      display: "block",
                                      fontFamily: "Consolas, Monaco, monospace",
                                      fontSize: isA4 ? "12px" : "10px",
                                      whiteSpace: "nowrap",
                                      letterSpacing: "0.03em",
                                    }}
                                  >
                                    {item.barcode || ""}
                                  </span>
                                );
                                break;
                              case "hsn":
                                content = (
                                  <span
                                    style={
                                      isRealTast
                                        ? {
                                            fontFamily: "ui-monospace, Consolas, Monaco, monospace",
                                            fontSize: isA4 ? "11px" : fsBody,
                                            letterSpacing: "0.02em",
                                            whiteSpace: "nowrap",
                                          }
                                        : undefined
                                    }
                                  >
                                    {item.hsn || ""}
                                  </span>
                                );
                                break;
                              case "qty": content = item.qty; break;
                              case "rate":
                                content = (
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: "1.15" }}>
                                    <span>{fmt(getDisplayBaseRate(item))}</span>
                                    {showDiscountOnRate && !isRealTast && (Number(item.discountPercent || 0) > 0) && (
                                      <span style={{ fontSize: isA4 ? "10px" : "8px", color: "#b45309" }}>
                                        -{Number(item.discountPercent).toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                );
                                break;
                              case "gst": content = ""; break;
                              case "amount": {
                                const netAmt =
                                  itemGlobalIdx >= 0
                                    ? lineNetAmounts[itemGlobalIdx] ?? item.total
                                    : item.total;
                                const qty = Number(item.qty) || 1;
                                const perQtyDisc = qty > 0 ? lineDisc / qty : lineDisc;
                                content = (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "flex-end",
                                      lineHeight: 1.15,
                                      justifyContent: "center",
                                    }}
                                  >
                                    {!isRealTast && lineDisc > 0.005 && (
                                      <span
                                        style={{
                                          fontSize: fsDiscMedium,
                                          fontWeight: "600",
                                          color: "#9a3412",
                                        }}
                                      >
                                        {qty > 1
                                          ? `Disc -${fmt(perQtyDisc)}×${qty}`
                                          : `Disc -${fmt(lineDisc)}`}
                                      </span>
                                    )}
                                    <span>{fmt(netAmt)}</span>
                                  </div>
                                );
                                break;
                              }
                            }
                          }
                          return <td key={c.key} style={style}>{content}</td>;
                        })}
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr style={{ borderTop: B2 }}>
                    <td
                      colSpan={cols.findIndex(c => c.key === "qty")}
                      style={{ ...cellBase, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, height: isA4 ? "26px" : "20px", textAlign: "left" }}
                    >
                      {isLastPage ? `Total Qty: ${totalQty}` : `Page ${pageIndex + 1} — Continued...`}
                    </td>
                    <td style={{ ...cellBase, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, textAlign: "center" }}>
                      {isLastPage ? totalQty : pageItems.filter(Boolean).reduce((s, i) => s + (i?.qty || 0), 0)}
                    </td>
                    <td
                      colSpan={cols.length - cols.findIndex(c => c.key === "qty") - 2}
                      style={{ ...cellBase, fontWeight: "bold", borderTop: B2, fontSize: fsTotals, textAlign: "right" }}
                    >
                      {isLastPage ? "" : "Page Sub"}
                    </td>
                    <td style={{ ...cellBase, fontWeight: "bold", borderRight: "none", borderTop: B2, fontSize: fsTotals, textAlign: "right" }}>
                      {isLastPage ? "" : `₹${fmt(pageItems.filter(Boolean).reduce((s, i) => s + ((i ? getDisplayBaseRate(i) * (i.qty || 0) : 0)), 0))}`}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ===== FOOTER ===== */}
              {isLastPage && (
              <div className="retail-erp-footer" style={{ borderTop: B2, fontSize: fsBody, flexShrink: 0 }}>

                  {/* Note (left) + Totals (right) — uses blank space beside subtotal block */}
                  <div style={{ display: "flex", borderBottom: B, width: "100%", alignItems: "stretch" }}>
                    <div
                      style={{
                        flex: 1,
                        borderRight: B,
                        minHeight: isPreprintedA5 ? "28px" : isA4 ? "78px" : "48px",
                        padding: isPreprintedA5 ? "2px 4px" : isA4 ? "6px 10px" : "3px 5px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignItems: "flex-start",
                      }}
                    >
                      {invoiceNoteText ? (
                        <>
                          <span
                            style={{
                              fontSize: fsNoteLabel,
                              fontWeight: 800,
                              color: "#000",
                              marginBottom: isA4 ? "4px" : "3px",
                            }}
                          >
                            Note:
                          </span>
                          <span
                            style={{
                              fontSize: fsNoteBody,
                              fontWeight: 700,
                              lineHeight: 1.35,
                              color: "#000",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {invoiceNoteText}
                          </span>
                        </>
                      ) : (
                        <span
                          style={{
                            fontSize: fsNoteLabel,
                            fontWeight: 800,
                            color: "#6b7280",
                          }}
                        >
                          Note:
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        width: isA4 ? "46%" : "42%",
                        minWidth: isA4 ? "78mm" : "56mm",
                        fontSize: fsTotals,
                        color: "#111",
                        flexShrink: 0,
                      }}
                    >
                      {!isRealTast && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: B, padding: isA4 ? "3px 8px" : "3px 6px", fontSize: isA4 ? "14px" : "11px", fontWeight: "900", color: "#000" }}>
                          <span>Sub Total</span><span>₹{fmt(displaySubTotal)}</span>
                        </div>
                      )}
                      {saleReturnAdjust > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: B, padding: isA4 ? "4px 8px" : "3px 6px", color: "#000", fontSize: fsSrAdjust, fontWeight: 900 }}>
                          <span style={{ fontWeight: 900 }}>S/R Adjust</span><span style={{ fontWeight: 900 }}>- ₹{fmt(saleReturnAdjust)}</span>
                        </div>
                      )}
                      {!isRealTast && displayDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: B, padding: isA4 ? "3px 8px" : "3px 6px", fontSize: isA4 ? "14px" : "11px", fontWeight: "900", color: "#000" }}>
                          <span>Discount</span><span>- ₹{fmt(displayDiscount)}</span>
                        </div>
                      )}
                      {displayOtherCharges > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: B, padding: isA4 ? "3px 8px" : "3px 6px", fontSize: isA4 ? "14px" : "11px", fontWeight: "900", color: "#000" }}>
                          <span>Other Charges</span><span>+ ₹{fmt(displayOtherCharges)}</span>
                        </div>
                      )}
                      {!isRealTast && roundOff !== 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: B, padding: isA4 ? "3px 8px" : "3px 6px", fontSize: isA4 ? "14px" : "11px", fontWeight: "800", color: "#000" }}>
                          <span>Round Off</span><span>{roundOff > 0 ? "+" : ""}{fmt(roundOff)}</span>
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: isPreprintedA5 ? "2px 5px" : isA4 ? (isRealTast ? "4px 8px" : "5px 8px") : "4px 6px",
                          fontWeight: isRealTast ? 600 : 900,
                          fontSize: isPreprintedA5 ? fsGrand : isA4 ? (isRealTast ? "14px" : "20px") : (isRealTast ? "13px" : "15px"),
                          backgroundColor: "#d1d5db",
                          color: "#000",
                          borderTop: "2px solid #000",
                        }}
                      >
                        <span>{isRealTast ? "Total" : "Bill Total"}</span>
                        <span>₹{fmt(grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Amount in Words */}
                  <div style={{ borderBottom: B, padding: isPreprintedA5 ? "1px 4px" : isA4 ? "4px 8px" : "2px 5px", fontSize: fsFooterMeta, fontWeight: 800, color: "#000", lineHeight: 1.2 }}>
                    <strong>Amount in Words:</strong> {numberToWords(grandTotal)}
                  </div>

                  {/* Payment + mix breakdown */}
                  {paymentMethod && !isRealTast && (
                    <div style={{ borderBottom: B, padding: isPreprintedA5 ? "1px 4px" : isA4 ? "4px 8px" : "2px 5px", fontSize: fsFooterMeta, fontWeight: 800, color: "#000", lineHeight: 1.2 }}>
                      <strong>Payment:</strong>{" "}
                      {isMixPayment ? "Mix Payment" : paymentMethod}
                      {mixPaymentDetail ? ` — ${mixPaymentDetail}` : ""}
                    </div>
                  )}

                  {/* Balance rows */}
                  {!isRealTast && (
                  <div style={{ display: "flex", borderBottom: B }}>
                    <div style={{ flex: 1, borderRight: B, padding: isPreprintedA5 ? "1px 3px" : isA4 ? "4px 8px" : "2px 4px", fontSize: fsFooterBalance, fontWeight: 900, color: "#000", lineHeight: 1.15 }}>
                      <strong>Received:</strong> ₹{fmt(receivedToday)}
                    </div>
                    <div style={{ flex: 1, borderRight: B, padding: isPreprintedA5 ? "1px 3px" : isA4 ? "4px 8px" : "2px 4px", fontSize: fsFooterBalance, fontWeight: 900, color: "#000", lineHeight: 1.15 }}>
                      <strong>Balance:</strong>{" "}
                      <span style={{ color: currentBalance > 0 ? "#dc2626" : "#16a34a", fontWeight: 900 }}>₹{fmt(currentBalance)}</span>
                    </div>
                    <div style={{ flex: 1, padding: isPreprintedA5 ? "1px 3px" : isA4 ? "4px 8px" : "2px 4px", fontSize: fsFooterBalance, fontWeight: 900, color: "#000", lineHeight: 1.15 }}>
                      <strong>Prev Bal:</strong> ₹{fmt(previousBalance)}
                      {" | "}
                      <strong>Total Due:</strong>{" "}
                      <span style={{ color: totalDue > 0 ? "#dc2626" : "#16a34a", fontWeight: 900 }}>₹{fmt(totalDue)}</span>
                    </div>
                  </div>
                  )}

                  {/* Terms + QR Code */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      minHeight: isA4
                        ? (showPaymentQr ? "36mm" : isRealTast ? "110px" : "80px")
                        : isPreprintedA5
                          ? (showPaymentQr ? "22mm" : "40px")
                        : (showPaymentQr ? "30mm" : "56px"),
                      maxHeight: isPreprintedA5
                        ? (showPaymentQr ? "24mm" : "44px")
                        : isA5Retail
                          ? (showPaymentQr ? "34mm" : "60px")
                          : undefined,
                      overflow: isA5Retail ? "hidden" : "visible",
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {/* Left — Terms */}
                    <div style={{ flex: 1, borderRight: B, padding: isA4 ? "4px 8px" : "2px 4px", display: "flex", flexDirection: "column", justifyContent: "flex-start", minWidth: 0, overflow: "hidden" }}>
                      <div>
                        {termsConditions.length > 0 && (
                          <div>
                            <strong
                              style={{
                                textDecoration: "underline",
                                fontSize: isA4 ? (isRealTast ? "14px" : "13px") : "10px",
                                fontWeight: isRealTast ? 900 : 700,
                                color: isRealTast ? "#000" : undefined,
                              }}
                            >
                              Terms & Conditions:
                            </strong>
                            <ul
                              style={{
                                margin: isA5Retail ? "2px 0 0 12px" : "2px 0 0 14px",
                                padding: 0,
                                listStyleType: "disc",
                                fontSize: isA4 ? (isRealTast ? "13px" : "12px") : "10px",
                                lineHeight: isA5Retail ? 1.3 : 1.6,
                                fontWeight: isRealTast ? 800 : 500,
                                color: isRealTast ? "#000" : "#111",
                              }}
                            >
                              {termsConditions.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: isA4 ? (isRealTast ? "11px" : "9px") : "9px",
                            marginTop: isA5Retail ? "2px" : "2px",
                            fontWeight: isRealTast ? 800 : 400,
                            color: isRealTast ? "#000" : undefined,
                          }}
                        >
                          E. & O.E.
                        </div>
                      </div>
                    </div>

                    {/* Right — sign / seal (+ optional QR for standard retail-erp) */}
                    <div
                      style={{
                        width: signColWidth,
                        padding: isA4 ? "4px 8px" : "2px 4px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        position: "relative",
                        boxSizing: "border-box",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {stampImageBase64 && (
                        <img
                          src={stampImageBase64}
                          alt="Stamp"
                          style={{
                            width: stampDim,
                            height: stampDim,
                            objectFit: "contain",
                            position: "absolute",
                            ...(isRealTast
                              ? { top: "8px", right: "8px" }
                              : {
                                  top: "4px",
                                  ...(stampPosition === "bottom-left" ? { left: "8px" } : { right: "8px" }),
                                }),
                          }}
                        />
                      )}
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: isA4 ? (isRealTast ? "12px" : "10px") : "7px",
                          fontWeight: "bold",
                          marginBottom: isRealTast ? "2px" : isA5Retail ? "2px" : "4px",
                          width: "100%",
                          flexShrink: 0,
                          lineHeight: 1.15,
                        }}
                      >
                        For {businessName}
                      </div>
                      {isRealTast && <div style={{ flex: 1, minHeight: "48px" }} aria-hidden="true" />}
                      {showPaymentQr && (
                        <div
                          className="retail-erp-qr-box"
                          style={{
                            width: `${qrBoxMm}mm`,
                            height: `${qrBoxMm}mm`,
                            padding: `${qrPadMm}mm`,
                            boxSizing: "border-box",
                            border: B,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#fff",
                            flexShrink: 0,
                            marginTop: "auto",
                          }}
                        >
                          <img
                            src={qrCodeUrl}
                            alt="Payment QR"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Non-last page footer */}
              {!isLastPage && (
                <div className="retail-erp-footer" style={{ borderTop: B2, fontSize: fsBody }}>
                  <div style={{ display: "flex" }}>
                    <div style={{ flex: 1, borderRight: B, padding: "4px 8px" }}>&nbsp;</div>
                    <div style={{ width: "40%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", fontWeight: "900", fontSize: isA4 ? "14px" : "12px", backgroundColor: "#e5e5e5" }}>
                      <span>Page Total</span>
                      <span>₹{fmt(pageItems.filter(Boolean).reduce((s, i) => s + (i?.total || 0), 0))}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })}

      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          @page { size: ${isA4 ? "210mm 297mm" : "148mm 210mm"}; margin: 0; }
          html, body {
            width: ${pageW} !important;
            ${isPreprintedA5 || isA5Retail ? `height: ${pageH} !important; max-height: ${pageH} !important;` : ""}
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .retail-erp-all-pages {
            width: ${pageW} !important;
            max-width: ${pageW} !important;
            margin: 0 !important;
          }
          .retail-erp-invoice-template {
            width: ${pageW} !important;
            max-width: ${pageW} !important;
            min-height: ${isA4 ? "auto" : "auto"} !important;
            height: ${isPreprintedA5 ? pageH : "auto"} !important;
            max-height: ${isPreprintedA5 || (isA5Retail && !isPreprinted) ? pageH : "none"} !important;
            padding-top: ${isPreprinted ? letterheadGap : pad} !important;
            padding-right: ${pad} !important;
            padding-bottom: ${isPreprintedA5 ? "1.5mm" : pad} !important;
            padding-left: ${pad} !important;
            overflow: ${isPreprintedA5 || (isA5Retail && !isPreprinted) ? "hidden" : "visible"} !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            ${isPreprintedA5 ? "page-break-inside: avoid !important; break-inside: avoid !important;" : ""}
          }
          .retail-erp-invoice-template[data-invoice-variant="preprinted"] {
            ${isPreprintedA5 ? `height: ${pageH} !important; max-height: ${pageH} !important; overflow: hidden !important;` : ""}
          }
          .retail-erp-invoice-template[data-invoice-variant="real-tast"] {
            height: ${pageH} !important;
            min-height: ${pageH} !important;
            overflow: hidden !important;
          }
          .retail-erp-invoice-template[data-invoice-variant="real-tast"] table {
            table-layout: fixed !important;
            width: 100% !important;
          }
          .retail-erp-invoice-template td,
          .retail-erp-invoice-template th,
          .retail-erp-invoice-template div {
            border-color: #000 !important;
          }
          .retail-erp-footer {
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: ${isA5Retail && !isPreprinted ? "hidden" : "visible"} !important;
            ${isPreprintedA5 ? "flex-shrink: 1 !important; min-height: 0 !important;" : ""}
          }
          .retail-erp-qr-box {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .retail-erp-qr-box img {
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .retail-erp-all-pages .retail-erp-invoice-template:not(:last-child) {
            page-break-after: always;
            break-after: page;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};
