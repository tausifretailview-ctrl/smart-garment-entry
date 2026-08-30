import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import { useSettings } from "@/hooks/useSettings";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";

export interface RetailPosThermalItem {
  particulars: string;
  size?: string;
  qty: number;
  rate: number;
  total: number;
}

interface RetailPosThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerPhone?: string;
  items: RetailPosThermalItem[];
  subTotal: number;
  discount?: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;
  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  documentType?: "invoice" | "quotation" | "sale-order" | "pos";
  salesman?: string;
  cashier?: string;
  settingsOverride?: Record<string, unknown>;
  thermalPaper?: PosThermalPaper;
}

const DEFAULT_TERMS = [
  "NO EXCHANGE WITHOUT BARCODE LABELS AND BILLS",
  "GOODS ONCE SOLD ARE NOT REFUNDABLES",
  "EXCHANGING WITHIN SEVEN DAYS ONLY",
  "90 DAYS SERVICE WILL BE PROVIDED ON FRESH STOCK",
  "NO GUARANTEE & NO WARRANTY ON SALE PRODUCTS",
];

const GSTIN_STATE: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "36": "Telangana",
  "37": "Andhra Pradesh",
};

const fmtDec = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

function cleanSize(raw?: string): string {
  const size = (raw || "").trim();
  if (!size || /^(none|n\/a|na|null|undefined|-|\.)$/i.test(size)) return "";
  return size;
}

function gstinStateLine(gstin: string): string {
  const code = gstin.slice(0, 2);
  const name = GSTIN_STATE[code];
  return name ? `${code}-${name}` : code;
}

function layoutForPaper(paper: PosThermalPaper) {
  const is58 = paper === "58mm";
  return {
    paperWidth: is58 ? "48mm" : "72mm",
    padding: is58 ? "1.5mm 1mm" : "2mm 2.5mm",
    baseFont: is58 ? "10px" : "12px",
    headerFont: is58 ? "13px" : "16px",
    titleFont: is58 ? "11px" : "13px",
    logoMax: is58 ? "14mm" : "18mm",
    qrSize: is58 ? 88 : 118,
  };
}

export const RetailPosThermalReceipt80mm = React.forwardRef<
  HTMLDivElement,
  RetailPosThermalReceipt80mmProps
>((props, ref) => {
  const {
    billNo,
    date,
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
    documentType = "pos",
    salesman,
    cashier,
    thermalPaper = "80mm",
  } = props;
  const layout = useMemo(() => layoutForPaper(thermalPaper), [thermalPaper]);
  const { data: orgSettings } = useSettings();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    if (props.settingsOverride) {
      setSettings(props.settingsOverride);
      return;
    }
    if (orgSettings) setSettings(orgSettings as Record<string, unknown>);
  }, [orgSettings, props.settingsOverride]);

  const billSettings = (settings?.bill_barcode_settings ?? {}) as {
    logo_url?: string;
    upi_id?: string;
    dc_upi_id?: string;
    login_display_name?: string;
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
  const upiId = billSettings.upi_id?.trim() || "";

  useEffect(() => {
    if (!upiId || grandTotal <= 0) {
      setQrCodeUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${grandTotal.toFixed(2)}&cu=INR`, {
      width: layout.qrSize,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setQrCodeUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrCodeUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [upiId, grandTotal, businessName, layout.qrSize]);

  const customTitle = saleSettings.invoice_document_title?.trim();
  const docTitle =
    documentType === "quotation"
      ? "QUOTATION"
      : documentType === "sale-order"
        ? "SALE ORDER"
        : grandTotal < 0
          ? "CREDIT NOTE"
          : customTitle || "BILL OF SUPPLY";

  const terms = (saleSettings.terms_list || [])
    .map((t) => (t || "").trim())
    .filter(Boolean);
  const termsToPrint = terms.length > 0 ? terms : DEFAULT_TERMS;
  const declaration = saleSettings.declaration_text?.trim() || "";

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const itemCount = items.length;
  const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
  const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;
  const userLabel = (cashier || salesman || billSettings.login_display_name || "").trim();

  const paymentLines: { label: string; amount: number }[] = [];
  if (cashPaid > 0) paymentLines.push({ label: "CASH", amount: cashPaid });
  if (upiPaid > 0) paymentLines.push({ label: "UPI", amount: upiPaid });
  if (cardPaid > 0) paymentLines.push({ label: "CARD", amount: cardPaid });
  if (creditPaid > 0) paymentLines.push({ label: "CREDIT", amount: creditPaid });
  if (paymentLines.length === 0 && totalPaid > 0) {
    paymentLines.push({
      label: (paymentMethod || "CASH").toUpperCase().replace(/_/g, " "),
      amount: totalPaid,
    });
  }

  const dashed: React.CSSProperties = {
    borderTop: "1px dashed #000",
    margin: "3px 0",
  };
  const solid: React.CSSProperties = {
    borderTop: "1px solid #000",
    margin: "3px 0",
  };
  const base: React.CSSProperties = {
    width: layout.paperWidth,
    maxWidth: layout.paperWidth,
    margin: "0 auto",
    padding: layout.padding,
    backgroundColor: "#fff",
    color: "#000",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: layout.baseFont,
    lineHeight: 1.25,
    letterSpacing: 0,
    boxSizing: "border-box",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
    textTransform: "uppercase",
  };

  if (!settings) {
    return (
      <div ref={ref} data-invoice-loading="true" style={{ ...base, textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="thermal-print-80mm thermal-receipt-container retail-pos-thermal-receipt-80mm"
      data-thermal-paper={thermalPaper}
      style={base}
    >
      <div style={{ textAlign: "center" }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{
              display: "block",
              margin: "0 auto 2px",
              maxHeight: layout.logoMax,
              maxWidth: "70%",
              objectFit: "contain",
            }}
          />
        ) : null}
        <div style={{ fontWeight: 700, fontSize: layout.headerFont }}>{businessName}</div>
        {address ? <div style={{ fontWeight: 400, whiteSpace: "pre-wrap" }}>{address.toUpperCase()}</div> : null}
        {mobile ? <div style={{ fontWeight: 400 }}>MOB.:{mobile}</div> : null}
        <div style={{ fontWeight: 400, marginTop: 2 }}>{docTitle}</div>
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          <span>Date : {format(date, "dd-MM-yyyy")}</span>
          <span>Time : {format(date, "hh:mm:ss a")}</span>
        </div>
        <div>Bill No : {billNo}</div>
        {customerPhone?.trim() ? <div>MOB NO : {customerPhone.trim()}</div> : null}
      </div>

      <div style={dashed} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 10mm 10mm 16mm 18mm",
          columnGap: "1mm",
          fontWeight: 400,
        }}
      >
        <span>Item Name</span>
        <span style={{ textAlign: "right" }}>Sp</span>
        <span style={{ textAlign: "right" }}>Qty</span>
        <span style={{ textAlign: "right" }}>Rate</span>
        <span style={{ textAlign: "right" }}>Amount</span>
      </div>
      <div style={dashed} />
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 10mm 10mm 16mm 18mm",
            columnGap: "1mm",
            alignItems: "start",
            marginBottom: 2,
          }}
        >
          <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{item.particulars}</span>
          <span style={{ textAlign: "right" }}>{cleanSize(item.size)}</span>
          <span style={{ textAlign: "right" }}>{item.qty}</span>
          <span style={{ textAlign: "right" }}>{fmtDec(item.rate)}</span>
          <span style={{ textAlign: "right" }}>{fmtDec(item.total)}</span>
        </div>
      ))}

      <div style={solid} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div>ITEM : {itemCount}</div>
          <div>TOTAL QTY : {fmtDec(totalQty)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>SUB TOTAL : {fmtDec(subTotal)}</div>
          {discount > 0 ? <div>DISC : {fmtDec(discount)}</div> : null}
          {saleReturnAdjust > 0 ? <div>S/R : {fmtDec(saleReturnAdjust)}</div> : null}
          {roundOff !== 0 ? <div>ROUND : {fmtDec(roundOff)}</div> : null}
          <div style={{ fontWeight: 700 }}>TOTAL : {fmtDec(grandTotal)}</div>
        </div>
      </div>

      {paymentLines.length > 0 ? (
        <>
          <div style={dashed} />
          {paymentLines.map((line) => (
            <div key={line.label} style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>{line.label} :</span>
              <span>{fmtDec(line.amount)}</span>
            </div>
          ))}
        </>
      ) : null}

      {qrCodeUrl ? (
        <div style={{ textAlign: "center", marginTop: 6, textTransform: "none" }}>
          <img
            src={qrCodeUrl}
            alt="UPI QR"
            style={{ width: layout.qrSize, height: layout.qrSize, margin: "0 auto", display: "block" }}
          />
          <div style={{ fontSize: "10px", marginTop: 2, textTransform: "none" }}>{upiId}</div>
        </div>
      ) : null}

      <div style={dashed} />

      {userLabel ? <div style={{ textTransform: "none" }}>User : {userLabel}</div> : null}
      {gstNumber ? (
        <>
          <div>GSTIN : {gstNumber}</div>
          <div>{gstinStateLine(gstNumber)}</div>
        </>
      ) : null}

      <div style={{ marginTop: 6, fontWeight: 400 }}>
        {termsToPrint.map((term) => (
          <div key={term}>{term}</div>
        ))}
      </div>
      {declaration ? (
        <div style={{ marginTop: 4, whiteSpace: "pre-wrap", textTransform: "none" }}>{declaration}</div>
      ) : null}

      <div style={{ textAlign: "center", fontWeight: 700, marginTop: 6 }}>!! THANK YOU !! VISIT AGAIN !!</div>
    </div>
  );
});

RetailPosThermalReceipt80mm.displayName = "RetailPosThermalReceipt80mm";
