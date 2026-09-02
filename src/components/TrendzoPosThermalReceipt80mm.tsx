import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useSettings } from "@/hooks/useSettings";
import { buildUpiPayLink } from "@/lib/upiPayLink";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import "@/styles/trendzo-pos-thermal-receipt.css";

export interface TrendzoPosThermalItem {
  sr: number;
  particulars: string;
  barcode?: string;
  hsn?: string;
  qty: number;
  rate: number;
  total: number;
  mrp?: number;
}

interface GSTRateEntry {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst?: number;
  totalTax: number;
}

interface TrendzoPosThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  items: TrendzoPosThermalItem[];
  subTotal: number;
  discount?: number;
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
  salesman?: string;
  cashier?: string;
  settingsOverride?: Record<string, unknown>;
  thermalPaper?: PosThermalPaper;
  showYouSaved?: boolean;
}

const TRENDZO_DEFAULT_TERMS = [
  "GST charged as applicable.",
  "Final amount is inclusive of applicable taxes.",
  "No return; exchange only within the permitted period.",
];

const fmtDec = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

const fmtMoney = (n: number): string => {
  const value = Number.isFinite(n) ? n : 0;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    <div className="tz-info-row">
      <span className="tz-info-label">{label}</span>
      <span className="tz-info-value">: {v}</span>
    </div>
  );
}

function AmountRow({ label, amount, show = true }: { label: string; amount: number; show?: boolean }) {
  if (!show || !Number.isFinite(amount) || Math.abs(amount) < 0.005) return null;
  return (
    <div className="tz-row-between">
      <span>{label}</span>
      <span>{fmtMoney(amount)}</span>
    </div>
  );
}

function itemBarcodeLine(item: TrendzoPosThermalItem): string | null {
  const barcode = (item.barcode || "").trim();
  return barcode || null;
}

export const TrendzoPosThermalReceipt80mm = React.forwardRef<
  HTMLDivElement,
  TrendzoPosThermalReceipt80mmProps
>((props, ref) => {
  const {
    billNo,
    date,
    customerName,
    customerPhone,
    items,
    subTotal,
    discount = 0,
    saleReturnAdjust = 0,
    roundOff = 0,
    grandTotal,
    paymentMethod,
    cashPaid = 0,
    upiPaid = 0,
    cardPaid = 0,
    creditPaid = 0,
    paidAmount = 0,
    refundCash = 0,
    documentType = "pos",
    salesman,
    cashier,
    thermalPaper = "80mm",
    showYouSaved = true,
  } = props;

  const { data: orgSettings } = useSettings();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const invoiceBarcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (props.settingsOverride) {
      setSettings(props.settingsOverride);
      return;
    }
    if (orgSettings) setSettings(orgSettings as Record<string, unknown>);
  }, [orgSettings, props.settingsOverride]);

  useEffect(() => {
    const el = invoiceBarcodeRef.current;
    const code = (billNo || "").trim();
    if (!el || !code) return;
    try {
      JsBarcode(el, code, {
        format: "CODE128",
        height: 28,
        width: 1.1,
        displayValue: false,
        margin: 0,
        background: "transparent",
        lineColor: "#000000",
      });
    } catch {
      el.replaceChildren();
    }
  }, [billNo, settings]);

  const billSettings = (settings?.bill_barcode_settings ?? {}) as {
    logo_url?: string;
    login_display_name?: string;
    upi_id?: string;
  };
  const saleSettings = (settings?.sale_settings ?? {}) as {
    invoice_document_title?: string;
    terms_list?: string[];
    declaration_text?: string;
  };

  const businessName = String(settings?.business_name || "STORE NAME").toUpperCase();
  const address = String(settings?.address || "").trim();
  const mobile = String(settings?.mobile_number || settings?.owner_phone || "").trim();
  const gstNumber = String(settings?.gst_number || "").trim();
  const logoUrl = billSettings.logo_url?.trim() || "";

  const customTitle = saleSettings.invoice_document_title?.trim();
  const docTitle =
    documentType === "quotation"
      ? "QUOTATION"
      : documentType === "sale-order"
        ? "SALE ORDER"
        : documentType === "pos"
          ? "ESTIMATE"
          : grandTotal < 0
            ? "CREDIT NOTE"
            : customTitle || "TAX INVOICE";

  const terms = (saleSettings.terms_list || [])
    .map((t) => (t || "").trim())
    .filter(Boolean);
  const termsToPrint = terms.length > 0 ? terms : TRENDZO_DEFAULT_TERMS;
  const declaration = saleSettings.declaration_text?.trim() || "";

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const itemCount = items.length;
  const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
  const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;
  const balanceDue = grandTotal - totalPaid;
  const staffLabel = (salesman || cashier || billSettings.login_display_name || "").trim();
  const partyName = (customerName || "").trim();

  const upiId = String(billSettings.upi_id || "").trim();

  useEffect(() => {
    if (!upiId || grandTotal <= 0) {
      setQrCodeUrl("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await QRCode.toDataURL(
          buildUpiPayLink({
            upiId,
            payeeName: businessName,
            amount: grandTotal,
            note: billNo,
          }),
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
  }, [upiId, grandTotal, businessName, billNo]);

  const savedFromMrp = useMemo(() => {
    if (!showYouSaved) return 0;
    const mrpTotal = items.reduce((s, i) => s + (Number(i.mrp) || Number(i.rate) || 0) * i.qty, 0);
    const saleAmount = items.reduce((s, i) => s + i.total, 0);
    return Math.max(0, mrpTotal - saleAmount);
  }, [items, showYouSaved]);

  const youSaved = savedFromMrp > 0 ? savedFromMrp : discount > 0 ? discount : 0;

  const paymentModeLabel = (() => {
    const parts: string[] = [];
    if (cashPaid > 0) parts.push("CASH");
    if (upiPaid > 0) parts.push("UPI");
    if (cardPaid > 0) parts.push("CARD");
    if (creditPaid > 0) parts.push("CREDIT");
    if (parts.length > 0) return parts.join(" + ");
    return (paymentMethod || "CASH").toUpperCase().replace(/_/g, " ");
  })();

  if (!settings) {
    return (
      <div
        ref={ref}
        data-invoice-loading="true"
        className="trendzo-pos-thermal-receipt-80mm thermal-receipt thermal-print-80mm thermal-receipt-container"
        style={{ textAlign: "center", padding: "12px" }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="trendzo-pos-thermal-receipt-80mm thermal-receipt thermal-print-80mm thermal-receipt-container"
      data-thermal-paper={thermalPaper}
    >
      <div className="tz-header">
        {logoUrl ? <img src={logoUrl} alt="" className="tz-logo" /> : null}
        <div className="tz-company-name">{businessName}</div>
        {address ? <div className="tz-company-meta">{address}</div> : null}
        {mobile ? <div className="tz-company-meta">Mobile: {mobile}</div> : null}
        {gstNumber ? <div className="tz-company-meta">GSTIN: {gstNumber}</div> : null}
      </div>

      <div className="tz-sep-dashed" />

      <div className="tz-doc-title">{docTitle}</div>

      <div className="tz-sep-solid" />

      <div className="tz-info-grid">
        <div className="tz-info-col">
          <InfoRow label="Invoice No" value={billNo} />
          <InfoRow label="Date" value={format(date, "dd/MM/yyyy")} />
          <InfoRow label="Time" value={format(date, "hh:mm a")} />
        </div>
        <div className="tz-info-col">
          <InfoRow label="Customer" value={partyName || undefined} />
          <InfoRow label="Mobile" value={customerPhone} />
          <InfoRow label="Salesman" value={staffLabel || undefined} />
        </div>
      </div>

      <div className="tz-sep-solid" />

      <div className="tz-items">
        <div className="tz-items-head">
          <span className="tz-items-item-col">ITEM</span>
          <span className="tz-items-qty-col">QTY</span>
          <span className="tz-items-num-col">RATE</span>
          <span className="tz-items-num-col">AMT</span>
        </div>
        {items.map((item) => {
          const barcodeLine = itemBarcodeLine(item);
          return (
            <div className="tz-items-row" key={`${item.sr}-${item.particulars}`}>
              <div className="tz-items-item-col">
                <div className="tz-item-name">{item.particulars}</div>
                {barcodeLine ? <div className="tz-item-barcode">{barcodeLine}</div> : null}
              </div>
              <span className="tz-items-qty-col tz-items-num">{item.qty}</span>
              <span className="tz-items-num-col tz-items-num">{fmtDec(item.rate)}</span>
              <span className="tz-items-num-col tz-items-num">{fmtDec(item.total)}</span>
            </div>
          );
        })}
      </div>

      <div className="tz-sep-dashed" />

      <div className="tz-summary-grid">
        <div className="tz-summary-left">
          <div>Total Items : {itemCount}</div>
          <div>Total Quantity : {fmtDec(totalQty)}</div>
        </div>
        <div className="tz-summary-right">
          <AmountRow label="Subtotal" amount={subTotal} show={subTotal > 0} />
          <AmountRow label="Discount" amount={discount} />
          <AmountRow label="S/R Adjust" amount={saleReturnAdjust} />
          <AmountRow label="Round Off" amount={roundOff} show={roundOff !== 0} />
        </div>
      </div>

      <div className="tz-grand-total">
        <span>GRAND TOTAL</span>
        <span>{fmtMoney(grandTotal)}</span>
      </div>

      <div className="tz-payment">
        <InfoRow label="Payment Mode" value={paymentModeLabel} />
        <AmountRow label="Paid Amount" amount={totalPaid > 0 ? totalPaid : grandTotal} show />
        <AmountRow label="Balance / Due" amount={balanceDue} show={balanceDue > 0.5} />
        <AmountRow label="Return Amount" amount={refundCash} />
        <AmountRow label="You Saved" amount={youSaved} show={youSaved > 0} />
      </div>

      {qrCodeUrl && upiId ? (
        <div className="tz-upi-qr">
          <div className="tz-upi-qr-title">SCAN TO PAY</div>
          <img src={qrCodeUrl} alt="UPI QR" className="tz-upi-qr-img" />
          <div className="tz-upi-id">{upiId}</div>
        </div>
      ) : null}

      <div className="tz-invoice-barcode">
        <svg
          ref={invoiceBarcodeRef}
          className="tz-barcode-svg"
          width={180}
          height={28}
          aria-hidden="true"
        />
        <div className="tz-invoice-barcode-no">{billNo}</div>
      </div>

      <div className="tz-sep-dashed" />

      <div className="tz-terms-title">TERMS &amp; CONDITIONS</div>
      <div className="tz-terms-list">
        {termsToPrint.map((term) => (
          <div key={term}>• {term}</div>
        ))}
      </div>
      {declaration ? (
        <div className="tz-terms-list" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
          {declaration}
        </div>
      ) : null}

      <div className="tz-sep-dashed" />

      <div className="tz-footer">
        THANK YOU FOR SHOPPING WITH US
        <div className="tz-footer-sub">Visit Again!</div>
      </div>

      <div className="tz-branding">
        Powered by Ezzy ERP
        <br />
        Smart ERP. Simple Business.
      </div>
    </div>
  );
});

TrendzoPosThermalReceipt80mm.displayName = "TrendzoPosThermalReceipt80mm";
