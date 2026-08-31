import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useSettings } from "@/hooks/useSettings";

interface ThermalItem {
  sr: number;
  particulars: string;
  itemNotes?: string;
  barcode?: string;
  hsn?: string;
  sku?: string;
  qty: number;
  rate: number;
  total: number;
}

interface GSTRateEntry {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst?: number;
  totalTax: number;
}

interface ThermalPrint80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: ThermalItem[];
  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;
  gstBreakdown?: {
    cgst: number;
    sgst: number;
    igst?: number;
  };
  gstRateBreakdown?: GSTRateEntry[];
  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  refundCash?: number;
  documentType?: "invoice" | "quotation" | "sale-order" | "pos";
  /** Settings / prop override for the centered document heading (e.g. BILL OF SUPPLY). */
  documentTitle?: string;
  termsConditions?: string;
  notes?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  cashier?: string;
  salesman?: string;
  counter?: string;
  isDcInvoice?: boolean;
  /** When false, omit the "You Saved" banner (POS enable_mrp display gate). */
  showYouSaved?: boolean;
  showHSN?: boolean;
  showBarcode?: boolean;
  settingsOverride?: Record<string, unknown>;
}

const FONT = "Arial, Helvetica, sans-serif";

const fmtMoney = (n: number): string =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDec = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function hasText(v?: string | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePaymentLabel(method?: string): string {
  if (!method) return "";
  const normalized = method.toLowerCase().replace(/_/g, " ");
  if (normalized.includes("cash")) return "CASH";
  if (normalized.includes("upi")) return "UPI";
  if (normalized.includes("card")) return "CARD";
  if (normalized.includes("credit") || normalized.includes("pay later")) return "CREDIT";
  if (normalized.includes("mix")) return "MIXED";
  if (normalized.includes("estimate")) return "ESTIMATE";
  return method.toUpperCase().replace(/_/g, " ");
}

function resolveItemCode(item: ThermalItem, showBarcode: boolean): string {
  if (showBarcode && hasText(item.barcode)) return item.barcode.trim();
  if (hasText(item.sku)) return item.sku.trim();
  return "";
}

function stripEstimateBanner(notes?: string): string {
  if (!hasText(notes)) return "";
  return notes
    .replace(/\*\*\s*ESTIMATE\s*-\s*NOT A FINAL INVOICE\s*\*\*/gi, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

export const ThermalPrint80mm = React.forwardRef<HTMLDivElement, ThermalPrint80mmProps>(
  (props, ref) => {
    const {
      billNo,
      date,
      customerName,
      customerPhone,
      customerAddress,
      items,
      subTotal,
      discount,
      saleReturnAdjust = 0,
      roundOff = 0,
      grandTotal,
      gstBreakdown,
      gstRateBreakdown,
      paymentMethod,
      cashPaid = 0,
      upiPaid = 0,
      cardPaid = 0,
      creditPaid = 0,
      paidAmount = 0,
      refundCash = 0,
      documentType = "invoice",
      documentTitle: documentTitleProp,
      termsConditions,
      notes,
      showYouSaved = true,
      showHSN = true,
      showBarcode = true,
      pointsRedeemed = 0,
      pointsRedemptionValue = 0,
      pointsBalance = 0,
      cashier,
      salesman,
      counter,
      isDcInvoice,
      settingsOverride,
    } = props;

    const [settings, setSettings] = useState<Record<string, any> | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const invoiceBarcodeRef = useRef<SVGSVGElement | null>(null);
    const { data: orgSettings } = useSettings();

    useEffect(() => {
      if (settingsOverride) {
        setSettings(settingsOverride);
        return;
      }
      if (orgSettings) setSettings(orgSettings as Record<string, any>);
    }, [orgSettings, settingsOverride]);

    useEffect(() => {
      const upiId =
        isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id
          ? settings.bill_barcode_settings.dc_upi_id
          : settings?.bill_barcode_settings?.upi_id;
      if (!upiId || grandTotal <= 0) {
        setQrCodeUrl("");
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          const name = settings?.business_name || "Store";
          const url = await QRCode.toDataURL(
            `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${grandTotal.toFixed(2)}&cu=INR`,
            {
              width: 140,
              margin: 1,
              errorCorrectionLevel: "M",
              color: { dark: "#000000", light: "#FFFFFF" },
            },
          );
          if (!cancelled) setQrCodeUrl(url);
        } catch {
          if (!cancelled) setQrCodeUrl("");
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [settings, grandTotal, isDcInvoice]);

    const invoiceBarcodeValue = useMemo(() => {
      const raw = String(billNo || "").trim();
      if (!raw || /^DRAFT$/i.test(raw) || /^ESTIMATE$/i.test(raw)) return "";
      // CODE128-friendly: keep letters/digits; strip slash/space noise for denser bars.
      return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    }, [billNo]);

    useEffect(() => {
      const el = invoiceBarcodeRef.current;
      if (!el || !invoiceBarcodeValue) return;
      try {
        JsBarcode(el, invoiceBarcodeValue, {
          format: "CODE128",
          height: 36,
          width: 1.4,
          displayValue: false,
          margin: 0,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        el.replaceChildren();
      }
    }, [invoiceBarcodeValue]);

    const saleSettings = (settings?.sale_settings ?? {}) as {
      invoice_document_title?: string;
      invoice_footer_text?: string;
    };
    const customTitle =
      (documentTitleProp || saleSettings.invoice_document_title || "").trim();
    const looksLikeEstimate =
      documentType === "quotation" ||
      (typeof notes === "string" && /\*\*\s*ESTIMATE/i.test(notes)) ||
      /^estimate/i.test(String(paymentMethod || ""));

    const docTitle =
      documentType === "sale-order"
        ? "SALE ORDER"
        : grandTotal < 0
          ? "CREDIT NOTE"
          : looksLikeEstimate
            ? documentType === "quotation"
              ? "QUOTATION"
              : "ESTIMATE"
            : customTitle || "TAX INVOICE";

    const gst = gstBreakdown || { cgst: 0, sgst: 0, igst: 0 };
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const taxableFromRates = (gstRateBreakdown || []).reduce((s, e) => s + e.taxableAmount, 0);
    const hasGstRows =
      (gstRateBreakdown && gstRateBreakdown.length > 0) ||
      (gst.cgst || 0) > 0 ||
      (gst.sgst || 0) > 0 ||
      (gst.igst || 0) > 0;
    const taxableAmount = hasGstRows
      ? taxableFromRates > 0
        ? taxableFromRates
        : Math.max(0, subTotal - discount)
      : 0;

    const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
    const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;
    const balanceDue = grandTotal - totalPaid;
    const salesPerson = (salesman || cashier || "").trim();
    const showCustomer =
      hasText(customerName) &&
      !/^walk[- ]?in(\s+customer)?$/i.test(customerName.trim());
    const displayNotes = stripEstimateBanner(notes);
    const termsLines = hasText(termsConditions)
      ? termsConditions
          .split(/\r?\n/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const paymentLines: { label: string; amount: number }[] = [];
    if (cashPaid > 0) paymentLines.push({ label: "CASH", amount: cashPaid });
    if (upiPaid > 0) paymentLines.push({ label: "UPI", amount: upiPaid });
    if (cardPaid > 0) paymentLines.push({ label: "CARD", amount: cardPaid });
    if (creditPaid > 0) paymentLines.push({ label: "CREDIT", amount: creditPaid });
    if (paymentLines.length === 0 && totalPaid > 0) {
      paymentLines.push({
        label: normalizePaymentLabel(paymentMethod) || "PAID",
        amount: totalPaid,
      });
    }
    const primaryMode =
      paymentLines.length === 1
        ? paymentLines[0].label
        : paymentLines.length > 1
          ? "MIXED"
          : normalizePaymentLabel(paymentMethod);

    const addressLines = hasText(settings?.address)
      ? String(settings.address)
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter(Boolean)
      : [];

    const upiIdShown =
      isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id
        ? settings.bill_barcode_settings.dc_upi_id
        : settings?.bill_barcode_settings?.upi_id;

    if (!settings) {
      return (
        <div
          ref={ref}
          data-invoice-loading="true"
          className="thermal-print-80mm thermal-receipt-container"
          style={{
            width: "76mm",
            maxWidth: "76mm",
            margin: "0 auto",
            padding: "12px",
            textAlign: "center",
            fontFamily: FONT,
            fontSize: "12px",
            background: "#fff",
            color: "#000",
            boxSizing: "border-box",
          }}
        >
          Loading...
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="thermal-print-80mm thermal-receipt-container ezzy-thermal-receipt"
        style={{
          width: "76mm",
          maxWidth: "76mm",
          margin: "0 auto",
          padding: "3mm 2mm",
          backgroundColor: "#fff",
          fontFamily: FONT,
          fontSize: "11px",
          lineHeight: 1.3,
          color: "#000",
          boxSizing: "border-box",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
          overflowX: "hidden",
        }}
      >
        <style>{`
          .ezzy-thermal-receipt, .ezzy-thermal-receipt * { box-sizing: border-box; }
          .ezzy-thermal-receipt table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .ezzy-thermal-receipt img { max-width: 100%; }
          .ezzy-thermal-receipt .tr-sep { border-top: 1px dashed #000; margin: 4px 0; }
          .ezzy-thermal-receipt .tr-sep-solid { border-top: 1px solid #000; margin: 4px 0; }
          .ezzy-thermal-receipt .tr-row {
            display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; width: 100%;
          }
          .ezzy-thermal-receipt .tr-meta-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 1px 3mm; font-size: 10px;
          }
          .ezzy-thermal-receipt .tr-meta-grid .tr-span-2 { grid-column: 1 / -1; }
          .ezzy-thermal-receipt .tr-label { color: #000; }
          .ezzy-thermal-receipt .tr-val { font-weight: 700; word-break: break-word; }
          .ezzy-thermal-receipt .tr-item-name {
            font-size: 11px; font-weight: 700; line-height: 1.25;
            word-break: break-word; overflow-wrap: anywhere;
          }
          .ezzy-thermal-receipt .tr-item-sub {
            font-size: 9px; font-weight: 400; line-height: 1.2; word-break: break-all;
          }
          .ezzy-thermal-receipt .tr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .ezzy-thermal-receipt .tr-qty { text-align: center; font-variant-numeric: tabular-nums; }
          .ezzy-thermal-receipt .tr-grand {
            border: 1.5px solid #000; padding: 4px 5px; margin: 4px 0;
            display: flex; justify-content: space-between; align-items: center; gap: 2mm;
            font-size: 15px; font-weight: 800;
          }
          .ezzy-thermal-receipt .tr-th {
            font-size: 10px; font-weight: 700; border-bottom: 1px solid #000; padding: 2px 1px; vertical-align: bottom;
          }
          .ezzy-thermal-receipt .tr-td {
            padding: 3px 1px; vertical-align: top; font-size: 11px;
          }
          @media print {
            .ezzy-thermal-receipt {
              width: 76mm !important;
              max-width: 76mm !important;
              margin: 0 auto !important;
              padding: 3mm 2mm !important;
              background: #fff !important;
              color: #000 !important;
            }
          }
        `}</style>

        {/* 1. COMPANY HEADER */}
        <div style={{ textAlign: "center", marginBottom: 2 }}>
          {hasText(settings?.bill_barcode_settings?.logo_url) && (
            <img
              src={settings.bill_barcode_settings.logo_url}
              alt=""
              style={{
                display: "block",
                margin: "0 auto 3px",
                maxHeight: 48,
                maxWidth: "42mm",
                objectFit: "contain",
              }}
            />
          )}
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              lineHeight: 1.2,
            }}
          >
            {settings?.business_name || "STORE NAME"}
          </div>
          {addressLines.map((line, i) => (
            <div key={`addr-${i}`} style={{ fontSize: 10, lineHeight: 1.25 }}>
              {line}
            </div>
          ))}
          {hasText(settings?.mobile_number) && (
            <div style={{ fontSize: 10 }}>Mobile: {settings.mobile_number}</div>
          )}
          {hasText(settings?.gst_number) && (
            <div style={{ fontSize: 10, fontWeight: 700 }}>GSTIN: {settings.gst_number}</div>
          )}
        </div>

        <div className="tr-sep" />

        {/* 2. DOCUMENT TITLE */}
        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "1px",
            margin: "2px 0",
            textTransform: "uppercase",
          }}
        >
          {docTitle}
        </div>

        <div className="tr-sep" />

        {/* 3. INVOICE / CUSTOMER INFO */}
        <div className="tr-meta-grid">
          <div>
            <span className="tr-label">Invoice No : </span>
            <span className="tr-val">{billNo}</span>
          </div>
          <div>
            <span className="tr-label">Date : </span>
            <span className="tr-val">{format(date, "dd/MM/yyyy")}</span>
          </div>
          <div>
            <span className="tr-label">Time : </span>
            <span className="tr-val">{format(date, "hh:mm a")}</span>
          </div>
          {salesPerson ? (
            <div>
              <span className="tr-label">Salesman : </span>
              <span className="tr-val">{salesPerson}</span>
            </div>
          ) : hasText(counter) ? (
            <div>
              <span className="tr-label">Counter : </span>
              <span className="tr-val">{counter}</span>
            </div>
          ) : (
            <div />
          )}
          {showCustomer && (
            <div className="tr-span-2">
              <span className="tr-label">Customer : </span>
              <span className="tr-val">{customerName.trim()}</span>
            </div>
          )}
          {hasText(customerPhone) && (
            <div className="tr-span-2">
              <span className="tr-label">Mobile : </span>
              <span className="tr-val">{customerPhone.trim()}</span>
            </div>
          )}
          {showCustomer && hasText(customerAddress) && (
            <div className="tr-span-2">
              <span className="tr-label">Address : </span>
              <span className="tr-val">{customerAddress.trim()}</span>
            </div>
          )}
        </div>

        <div className="tr-sep-solid" />

        {/* 4. PRODUCT TABLE */}
        <table>
          <thead>
            <tr>
              <th className="tr-th" style={{ width: "7%", textAlign: "left" }}>
                SR
              </th>
              <th className="tr-th" style={{ width: "43%", textAlign: "left" }}>
                ITEM
              </th>
              <th className="tr-th" style={{ width: "12%", textAlign: "center" }}>
                QTY
              </th>
              <th className="tr-th" style={{ width: "18%", textAlign: "right" }}>
                RATE
              </th>
              <th className="tr-th" style={{ width: "20%", textAlign: "right" }}>
                AMOUNT
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const code = resolveItemCode(item, showBarcode);
              const hsn = showHSN && hasText(item.hsn) ? item.hsn.trim() : "";
              return (
                <tr key={i} style={{ pageBreakInside: "avoid" }}>
                  <td className="tr-td" style={{ textAlign: "left", fontWeight: 700 }}>
                    {item.sr || i + 1}
                  </td>
                  <td className="tr-td" style={{ textAlign: "left" }}>
                    <div className="tr-item-name">{item.particulars}</div>
                    {hasText(item.itemNotes) && (
                      <div className="tr-item-sub" style={{ fontStyle: "italic" }}>
                        {item.itemNotes}
                      </div>
                    )}
                    {code ? <div className="tr-item-sub">{code}</div> : null}
                    {hsn ? <div className="tr-item-sub">HSN: {hsn}</div> : null}
                  </td>
                  <td className="tr-td tr-qty">{item.qty}</td>
                  <td className="tr-td tr-num">{fmtDec(item.rate)}</td>
                  <td className="tr-td tr-num" style={{ fontWeight: 700 }}>
                    {fmtDec(item.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="tr-sep-solid" />

        {/* 6. ITEM SUMMARY */}
        <div className="tr-row" style={{ fontSize: 11, fontWeight: 700 }}>
          <span>Total Items : {items.length}</span>
          <span>Total Quantity : {Number.isInteger(totalQty) ? totalQty : fmtDec(totalQty)}</span>
        </div>

        <div className="tr-sep" />

        {/* 7. AMOUNT SUMMARY */}
        <div style={{ fontSize: 11 }}>
          <div className="tr-row">
            <span>Subtotal</span>
            <span className="tr-num" style={{ fontWeight: 700 }}>
              {fmtMoney(subTotal)}
            </span>
          </div>
          {discount > 0 && (
            <div className="tr-row">
              <span>Discount</span>
              <span className="tr-num" style={{ fontWeight: 700 }}>
                -{fmtMoney(discount)}
              </span>
            </div>
          )}
          {hasGstRows && (
            <div className="tr-row">
              <span>Taxable Amount</span>
              <span className="tr-num" style={{ fontWeight: 700 }}>
                {fmtMoney(taxableAmount)}
              </span>
            </div>
          )}
          {gstRateBreakdown && gstRateBreakdown.length > 0 ? (
            gstRateBreakdown.map((entry, idx) => (
              <React.Fragment key={`gst-rate-${idx}`}>
                {(entry.cgst || 0) > 0 && (
                  <div className="tr-row">
                    <span>CGST @{entry.rate / 2}%</span>
                    <span className="tr-num">{fmtMoney(entry.cgst)}</span>
                  </div>
                )}
                {(entry.sgst || 0) > 0 && (
                  <div className="tr-row">
                    <span>SGST @{entry.rate / 2}%</span>
                    <span className="tr-num">{fmtMoney(entry.sgst)}</span>
                  </div>
                )}
                {(entry.igst || 0) > 0 && (
                  <div className="tr-row">
                    <span>IGST @{entry.rate}%</span>
                    <span className="tr-num">{fmtMoney(entry.igst)}</span>
                  </div>
                )}
              </React.Fragment>
            ))
          ) : (
            <>
              {(gst.cgst || 0) > 0 && (
                <div className="tr-row">
                  <span>CGST</span>
                  <span className="tr-num">{fmtMoney(gst.cgst)}</span>
                </div>
              )}
              {(gst.sgst || 0) > 0 && (
                <div className="tr-row">
                  <span>SGST</span>
                  <span className="tr-num">{fmtMoney(gst.sgst)}</span>
                </div>
              )}
              {(gst.igst || 0) > 0 && (
                <div className="tr-row">
                  <span>IGST</span>
                  <span className="tr-num">{fmtMoney(gst.igst || 0)}</span>
                </div>
              )}
            </>
          )}
          {roundOff !== 0 && (
            <div className="tr-row">
              <span>Round Off</span>
              <span className="tr-num" style={{ fontWeight: 700 }}>
                {roundOff > 0 ? "+" : "-"}
                {fmtMoney(Math.abs(roundOff))}
              </span>
            </div>
          )}
          {saleReturnAdjust > 0 && (
            <div className="tr-row">
              <span>S/R Adjusted</span>
              <span className="tr-num" style={{ fontWeight: 700 }}>
                -{fmtMoney(saleReturnAdjust)}
              </span>
            </div>
          )}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div className="tr-row">
              <span>Points ({pointsRedeemed} pts)</span>
              <span className="tr-num" style={{ fontWeight: 700 }}>
                -{fmtMoney(pointsRedemptionValue)}
              </span>
            </div>
          )}
        </div>

        {/* 8. GRAND TOTAL */}
        <div className="tr-grand">
          <span>{grandTotal < 0 ? "CREDIT DUE" : "GRAND TOTAL"}</span>
          <span style={{ whiteSpace: "nowrap" }}>
            {grandTotal < 0 ? "-" : ""}
            {fmtMoney(Math.abs(grandTotal))}
          </span>
        </div>

        {/* 9. PAYMENT */}
        {(paymentLines.length > 0 ||
          refundCash > 0 ||
          Math.abs(balanceDue) > 1 ||
          (showYouSaved && discount > 0) ||
          hasText(primaryMode)) && (
          <div style={{ fontSize: 11, marginBottom: 2 }}>
            {hasText(primaryMode) && (
              <div className="tr-row">
                <span>Payment Mode</span>
                <span style={{ fontWeight: 700 }}>{primaryMode}</span>
              </div>
            )}
            {paymentLines.length > 1 &&
              paymentLines.map((line) => (
                <div className="tr-row" key={line.label}>
                  <span>{line.label}</span>
                  <span className="tr-num">{fmtMoney(line.amount)}</span>
                </div>
              ))}
            {totalPaid > 0 && (
              <div className="tr-row" style={{ fontWeight: 700 }}>
                <span>Paid Amount</span>
                <span className="tr-num">{fmtMoney(totalPaid)}</span>
              </div>
            )}
            {Math.abs(balanceDue) > 1 && (
              <div className="tr-row" style={{ fontWeight: 700 }}>
                <span>{balanceDue < 0 ? "Return Amount" : "Balance / Due"}</span>
                <span className="tr-num">
                  {balanceDue < 0 ? "-" : ""}
                  {fmtMoney(Math.abs(balanceDue))}
                </span>
              </div>
            )}
            {refundCash > 0 && (
              <div className="tr-row">
                <span>Refund to Customer</span>
                <span className="tr-num">{fmtMoney(refundCash)}</span>
              </div>
            )}
            {showYouSaved && discount > 0 && (
              <div className="tr-row" style={{ fontWeight: 700 }}>
                <span>You Saved</span>
                <span className="tr-num">{fmtMoney(discount)}</span>
              </div>
            )}
          </div>
        )}

        {/* 10. INVOICE BARCODE */}
        {invoiceBarcodeValue ? (
          <div style={{ textAlign: "center", margin: "6px 0 2px" }}>
            <svg
              ref={invoiceBarcodeRef}
              style={{ display: "block", margin: "0 auto", maxWidth: "68mm", height: 36 }}
            />
            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, letterSpacing: "0.4px" }}>
              {billNo}
            </div>
          </div>
        ) : null}

        {/* Loyalty */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <>
            <div className="tr-sep" />
            <div style={{ fontSize: 10 }}>
              <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 1 }}>
                LOYALTY POINTS
              </div>
              {pointsRedeemed > 0 && (
                <div className="tr-row">
                  <span>Redeemed</span>
                  <span>
                    {pointsRedeemed} pts ({fmtMoney(pointsRedemptionValue)})
                  </span>
                </div>
              )}
              <div className="tr-row" style={{ fontWeight: 700 }}>
                <span>Balance</span>
                <span>{pointsBalance} pts</span>
              </div>
            </div>
          </>
        )}

        {/* UPI QR — existing behaviour */}
        {qrCodeUrl && hasText(upiIdShown) && (
          <div style={{ textAlign: "center", margin: "6px 0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>SCAN TO PAY</div>
            <img
              src={qrCodeUrl}
              alt="UPI QR"
              style={{ width: 72, height: 72, margin: "0 auto", display: "block" }}
            />
            <div style={{ fontSize: 9, marginTop: 1 }}>{upiIdShown}</div>
          </div>
        )}

        {/* 11. TERMS */}
        {termsLines.length > 0 && (
          <>
            <div className="tr-sep" />
            <div style={{ fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 2 }}>
              TERMS & CONDITIONS
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.35, textAlign: "left" }}>
              {termsLines.map((line, i) => (
                <div key={`term-${i}`}>• {line}</div>
              ))}
            </div>
          </>
        )}

        {/* Notes */}
        {hasText(displayNotes) && !/^\d+$/.test(displayNotes) && (
          <>
            <div className="tr-sep" />
            <div style={{ fontSize: 10, lineHeight: 1.3 }}>
              <span style={{ fontWeight: 700 }}>Note: </span>
              <span style={{ whiteSpace: "pre-wrap" }}>{displayNotes}</span>
            </div>
          </>
        )}

        {/* 12. FOOTER */}
        <div className="tr-sep" />
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, margin: "4px 0 1px" }}>
          THANK YOU FOR SHOPPING WITH US
        </div>
        <div style={{ textAlign: "center", fontSize: 10, marginBottom: 4 }}>Visit Again!</div>

        {hasText(settings?.bill_barcode_settings?.footer_text) ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 9,
              whiteSpace: "pre-wrap",
              marginBottom: 2,
            }}
          >
            {settings.bill_barcode_settings.footer_text}
          </div>
        ) : hasText(saleSettings.invoice_footer_text) ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 9,
              whiteSpace: "pre-wrap",
              marginBottom: 2,
            }}
          >
            {saleSettings.invoice_footer_text}
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 8, marginTop: 2, lineHeight: 1.25 }}>
            <div style={{ fontWeight: 700 }}>Powered by Ezzy ERP</div>
            <div>Smart ERP. Simple Business.</div>
          </div>
        )}
      </div>
    );
  },
);

ThermalPrint80mm.displayName = "ThermalPrint80mm";
