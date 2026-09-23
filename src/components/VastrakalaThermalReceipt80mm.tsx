import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSettings } from "@/hooks/useSettings";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import { instagramHandleFromLink } from "@/utils/kidsCampThermalReceipt";
import { splitVastrakalaShopHeader } from "@/utils/vastrakalaThermalHeader";
import {
  vastrakalaParticularsLines,
} from "@/utils/vastrakalaThermalParticulars";
import "@/styles/vastrakala-thermal-receipt.css";

export interface VastrakalaThermalItem {
  sr?: number;
  particulars: string;
  /** Optional second line under Particulars — e.g. a set/piece note ("3 PC"). */
  itemNotes?: string;
  mrp?: number;
  qty: number;
  rate: number;
  total: number;
}

interface VastrakalaThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  items: VastrakalaThermalItem[];
  /** Sum of item.total — used only as the MRP-off fallback (see totalAmt below). */
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
  settingsOverride?: Record<string, unknown>;
  /** Roll width — 58mm POS printers need a narrower layout (Settings → Direct print POS paper). Drives font size. */
  thermalPaper?: PosThermalPaper;
  /** Settings → Show MRP Column. Gates the MRP column and the MRP-based Discount total. */
  showMrp?: boolean;
}

const VASTRAKALA_DEFAULT_TERMS = [
  "NO RETURN. NO REFUND.",
  "EXCHANGE WITHIN TWO DAYS",
  "NO EXCHANGE ON SATURDAY AND SUNDAY.",
  "NO EXCHANGE WITHOUT BARCODE & INVOICE",
];

const fmtDec = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

function VastrakalaHeaderBrandText({
  title,
  tagline,
  headerFont,
  subFont,
}: {
  title: string;
  tagline: string;
  headerFont: string;
  subFont: string;
}) {
  return (
    <>
      <div
        className="vk-header-title"
        style={{ fontSize: headerFont, letterSpacing: "0.4px" }}
      >
        {title}
      </div>
      <div
        className="vk-header-tagline"
        style={{ fontSize: subFont, marginTop: 1 }}
      >
        {tagline}
      </div>
    </>
  );
}

function layoutForPaper(paper: PosThermalPaper, showMrp: boolean) {
  const is58 = paper === "58mm";  const itemGridColumns = showMrp
    ? is58
      ? "4mm minmax(0, 1fr) 8mm 13mm 15mm"
      : "5mm minmax(0, 1fr) 10mm 15mm 18mm"
    : is58
      ? "4mm minmax(0, 1fr) 8mm 15mm"
      : "5mm minmax(0, 1fr) 10mm 18mm";
  return {
    paperWidth: is58 ? "48mm" : "76mm",
    padding: is58 ? "1.5mm 1.5mm" : "2mm 2.5mm",
    baseFont: is58 ? "10px" : "13px",
    headerFont: is58 ? "14px" : "22px",
    subFont: is58 ? "10px" : "14px",
    netFont: is58 ? "11px" : "15px",
    logoMax: is58 ? "14mm" : "20mm",
    itemGridColumns,
  };
}

const itemNumStyle: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

export const VastrakalaThermalReceipt80mm = React.forwardRef<
  HTMLDivElement,
  VastrakalaThermalReceipt80mmProps
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
    salesman,
    thermalPaper = "80mm",
    showMrp = true,
  } = props;
  const layout = useMemo(() => layoutForPaper(thermalPaper, showMrp), [thermalPaper, showMrp]);
  const { data: orgSettings } = useSettings();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (props.settingsOverride) {
      setSettings(props.settingsOverride);
      return;
    }
    if (orgSettings) setSettings(orgSettings as Record<string, unknown>);
  }, [orgSettings, props.settingsOverride]);

  const billSettings = (settings?.bill_barcode_settings ?? {}) as {
    logo_url?: string;
    instagram_link?: string;
  };
  const saleSettings = (settings?.sale_settings ?? {}) as {
    terms_list?: string[];
  };

  const shopHeader = useMemo(
    () => splitVastrakalaShopHeader(String(settings?.business_name || "STORE NAME")),
    [settings?.business_name],
  );
  const address = String(settings?.address || "").trim();
  const mobile = String(settings?.mobile_number || settings?.owner_phone || "").trim();
  const logoUrl = billSettings.logo_url?.trim() || "";
  const instagramHandle = instagramHandleFromLink(billSettings.instagram_link);

  const terms = (saleSettings.terms_list || [])
    .map((t) => (t || "").trim())
    .filter(Boolean);
  const termsToPrint = terms.length > 0 ? terms : VASTRAKALA_DEFAULT_TERMS;

  // MRP column on: totals are MRP-based (Total Amt = sum(MRP*qty), Discount = that minus Net).
  // MRP column off: no MRP data to total against, so fall back to the plain sale-amount total
  // and the caller-supplied discount — same convention as KidsThermalReceipt80mm's showMrp gate.
  const totalMrpAmt = items.reduce((s, i) => s + (Number(i.mrp) || Number(i.rate) || 0) * i.qty, 0);
  const totalAmt = showMrp ? totalMrpAmt : subTotal;
  const mrpDiscount = showMrp ? Math.max(0, totalMrpAmt - grandTotal) : discount;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
  const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;
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

  const dashed: React.CSSProperties = { borderTop: "1px dashed #000", margin: "6px 0" };
  const base: React.CSSProperties = {
    width: layout.paperWidth,
    maxWidth: layout.paperWidth,
    margin: "0 auto",
    padding: layout.padding,
    backgroundColor: "#fff",
    color: "#000",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: layout.baseFont,
    fontWeight: 400,
    lineHeight: 1.35,
    letterSpacing: 0,
    boxSizing: "border-box",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
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
      className="thermal-print-80mm thermal-receipt-container vastrakala-thermal-receipt-80mm"
      data-thermal-paper={thermalPaper}
      style={base}
    >
      <div className="vk-header">
        {logoUrl ? (
          <div
            className="vk-header-brand-row"
            style={{
              display: "grid",
              gridTemplateColumns: `${layout.logoMax} minmax(0, 1fr) ${layout.logoMax}`,
              alignItems: "center",
              columnGap: "0.5mm",
              marginBottom: 4,
            }}
          >
            <img
              src={logoUrl}
              alt=""
              className="vk-header-logo"
              style={{
                display: "block",
                maxHeight: layout.logoMax,
                maxWidth: layout.logoMax,
                width: "100%",
                height: "auto",
                objectFit: "contain",
                justifySelf: "start",
              }}
            />
            <div style={{ textAlign: "center", minWidth: 0 }}>
              <VastrakalaHeaderBrandText
                title={shopHeader.title}
                tagline={shopHeader.tagline}
                headerFont={layout.headerFont}
                subFont={layout.subFont}
              />
            </div>
            <span className="vk-header-logo-spacer" aria-hidden />
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <VastrakalaHeaderBrandText
              title={shopHeader.title}
              tagline={shopHeader.tagline}
              headerFont={layout.headerFont}
              subFont={layout.subFont}
            />
          </div>
        )}
        <div className="vk-header-meta" style={{ textAlign: "center" }}>
          {address ? (
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{address.toUpperCase()}</div>
          ) : null}
          {mobile ? <div>CONTACT : {mobile}</div> : null}
          {instagramHandle ? <div style={{ marginTop: 3 }}>{instagramHandle}</div> : null}
        </div>
      </div>

      <div style={dashed} />

      <div className="vk-meta" style={{ marginBottom: 8, marginTop: 2 }}>
        <div>
          NAME: {(customerName || "CASH").toUpperCase()}
          {customerPhone?.trim() ? `-${customerPhone.trim()}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          <span>BILL NO. {billNo}</span>
          <span>DATE : {format(date, "dd-MM-yyyy")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 4 }}>
          <span>SALESMAN : {(salesman || "-").toUpperCase()}</span>
          <span>TIME - {format(date, "h:mm a")}</span>
        </div>
      </div>

      <div style={dashed} />

      <div
        className="vk-items-head"
        style={{
          display: "grid",
          gridTemplateColumns: layout.itemGridColumns,
          columnGap: "1mm",
          rowGap: "1mm",
          marginTop: 7,
          marginBottom: 6,
        }}
      >
        <span style={{ gridColumn: 1 }}>NO</span>
        <span style={{ gridColumn: 2, minWidth: 0 }}>PARTICULARS</span>
        <span style={{ ...itemNumStyle, gridColumn: 3 }}>QTY</span>
        {showMrp ? <span style={{ ...itemNumStyle, gridColumn: 4 }}>MRP</span> : null}
        <span style={{ ...itemNumStyle, gridColumn: showMrp ? 5 : 4 }}>AMOUNT</span>
      </div>
      <div style={dashed} />
      {items.map((item, i) => {
        const { line1, line2 } = vastrakalaParticularsLines(item.particulars, item.itemNotes);
        const qtyCol = 3;
        const mrpCol = 4;
        const amtCol = showMrp ? 5 : 4;
        return (
          <div
            key={i}
            className="vk-items-row"
            style={{
              display: "grid",
              gridTemplateColumns: layout.itemGridColumns,
              columnGap: "1mm",
              alignItems: "start",
              marginBottom: 5,
            }}
          >
            <span style={{ gridColumn: 1 }}>{item.sr ?? i + 1}</span>
            <div
              className="vk-particular-name"
              style={{ gridColumn: 2, minWidth: 0, lineHeight: 1.3 }}
            >
              <div>{line1}</div>
              {line2 ? <div className="vk-particular-notes">{line2}</div> : null}
            </div>
            <span style={{ ...itemNumStyle, gridColumn: qtyCol }}>{item.qty}</span>
            {showMrp ? (
              <span style={{ ...itemNumStyle, gridColumn: mrpCol }}>
                {fmtDec(Number(item.mrp) || Number(item.rate) || 0)}
              </span>
            ) : null}
            <span style={{ ...itemNumStyle, gridColumn: amtCol }}>{fmtDec(item.total)}</span>
          </div>
        );
      })}

      <div style={dashed} />

      <div className="vk-totals" style={{ display: "flex", justifyContent: "space-between", gap: 6, paddingRight: "0.5mm", marginTop: 2, marginBottom: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div>Tot.QTY : {totalQty}</div>
          {paymentLines.map((line) => (
            <div key={line.label}>
              {line.label} : {fmtDec(line.amount)}
            </div>
          ))}
        </div>
        <div className="vk-totals-right" style={{ textAlign: "right", flexShrink: 0, paddingRight: "1mm" }}>
          <div>TOTAL AMT. : {fmtDec(totalAmt)}</div>
          {mrpDiscount > 0 ? <div>DISCOUNT : {fmtDec(mrpDiscount)}</div> : null}
          {saleReturnAdjust > 0 ? <div>S/R : {fmtDec(saleReturnAdjust)}</div> : null}
          {roundOff !== 0 ? <div>ROUND : {fmtDec(roundOff)}</div> : null}
          <div className="vk-net-amt" style={{ fontSize: layout.netFont }}>
            NET AMT. : {fmtDec(grandTotal)}
          </div>
        </div>
      </div>

      <div style={dashed} />

      <div style={{ marginTop: 2 }}>
        <div className="vk-terms-label">TERMS:</div>
        <div className="vk-terms-body">
          {termsToPrint.map((term) => (
            <div key={term}>* {term}</div>
          ))}
        </div>
      </div>

      <div
        className="vk-footer-thanks"
        style={{ textAlign: "center", marginTop: 10, fontSize: layout.subFont }}
      >
        THANK YOU !!! VISIT AGAIN !!!
      </div>
    </div>
  );
});

VastrakalaThermalReceipt80mm.displayName = "VastrakalaThermalReceipt80mm";
