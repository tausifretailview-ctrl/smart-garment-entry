import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSettings } from "@/hooks/useSettings";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import { instagramHandleFromLink } from "@/utils/kidsCampThermalReceipt";
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

/** Line 1 = segment before first '-'; line 2 = rest (+ optional notes) on one row. */
export function splitVastrakalaParticulars(
  particulars: string,
  itemNotes?: string,
): { head: string; detailLine: string } {
  const raw = (particulars || "").trim();
  const notes = (itemNotes || "").trim();
  if (!raw) {
    return { head: "", detailLine: notes };
  }
  const dash = raw.indexOf("-");
  if (dash <= 0) {
    return { head: raw, detailLine: notes };
  }
  const head = raw.slice(0, dash).trim();
  let detailLine = raw.slice(dash + 1).trim();
  if (notes && !detailLine.includes(notes)) {
    detailLine = detailLine ? `${detailLine} ${notes}` : notes;
  }
  return { head, detailLine };
}

function layoutForPaper(paper: PosThermalPaper, showMrp: boolean) {
  const is58 = paper === "58mm";
  const itemGridColumns = showMrp
    ? is58
      ? "4mm minmax(0, 1fr) 7mm 14mm 17mm"
      : "5mm minmax(0, 1fr) 8mm 18mm 22mm"
    : is58
      ? "4mm minmax(0, 1fr) 7mm 17mm"
      : "5mm minmax(0, 1fr) 8mm 22mm";
  return {
    paperWidth: is58 ? "48mm" : "76mm",
    padding: is58 ? "1.5mm 1mm" : "2mm 1.5mm",
    baseFont: is58 ? "11px" : "14px",
    headerFont: is58 ? "16px" : "20px",
    subFont: is58 ? "10px" : "13px",
    netFont: is58 ? "13px" : "16px",
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

  const businessName = String(settings?.business_name || "STORE NAME").toUpperCase();
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

  const dashed: React.CSSProperties = { borderTop: "1px dashed #000", margin: "3px 0" };
  const base: React.CSSProperties = {
    width: layout.paperWidth,
    maxWidth: layout.paperWidth,
    margin: "0 auto",
    padding: layout.padding,
    backgroundColor: "#fff",
    color: "#000",
    fontFamily: "'Arial Black', Arial, Helvetica, sans-serif",
    fontSize: layout.baseFont,
    fontWeight: 700,
    lineHeight: 1.22,
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
        <div style={{ fontWeight: 900, fontSize: layout.headerFont, letterSpacing: "0.5px" }}>
          {businessName}
        </div>
        <div style={{ fontWeight: 800, fontSize: layout.subFont, letterSpacing: "1px", marginTop: 1 }}>
          LADIES WEAR
        </div>
        {address ? (
          <div style={{ fontWeight: 700, whiteSpace: "pre-wrap", marginTop: 2 }}>{address.toUpperCase()}</div>
        ) : null}
        {mobile ? <div style={{ fontWeight: 700 }}>CONTACT : {mobile}</div> : null}
        {instagramHandle ? (
          <div style={{ fontWeight: 700, marginTop: 1 }}>{instagramHandle}</div>
        ) : null}
      </div>

      <div style={dashed} />

      <div style={{ fontWeight: 700 }}>
        <div>
          NAME: {(customerName || "CASH").toUpperCase()}
          {customerPhone?.trim() ? `-${customerPhone.trim()}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          <span>BILL NO. {billNo}</span>
          <span>DATE : {format(date, "dd-MM-yyyy")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
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
          columnGap: "0.8mm",
          fontWeight: 800,
        }}
      >
        <span>NO</span>
        <span>PARTICULARS</span>
        <span style={itemNumStyle}>QTY</span>
        {showMrp ? <span style={itemNumStyle}>MRP</span> : null}
        <span style={itemNumStyle}>AMOUNT</span>
      </div>
      <div style={dashed} />
      {items.map((item, i) => {
        const { head, detailLine } = splitVastrakalaParticulars(item.particulars, item.itemNotes);
        const qtyCol = 3;
        const mrpCol = 4;
        const amtCol = showMrp ? 5 : 4;
        const rowSpan = detailLine ? ("1 / span 2" as const) : undefined;
        return (
          <div
            key={i}
            className="vk-items-row"
            style={{
              display: "grid",
              gridTemplateColumns: layout.itemGridColumns,
              columnGap: "0.8mm",
              alignItems: "start",
              marginBottom: 3,
              fontWeight: 700,
            }}
          >
            <span style={{ gridColumn: 1, gridRow: rowSpan }}>{item.sr ?? i + 1}</span>
            <span style={{ gridColumn: 2, gridRow: 1, minWidth: 0, lineHeight: 1.15 }}>
              {head || item.particulars}
            </span>
            {detailLine ? (
              <span
                className="vk-item-detail"
                style={{ gridColumn: 2, gridRow: 2, minWidth: 0, lineHeight: 1.15 }}
              >
                {detailLine}
              </span>
            ) : null}
            <span style={{ ...itemNumStyle, gridColumn: qtyCol, gridRow: rowSpan }}>{item.qty}</span>
            {showMrp ? (
              <span style={{ ...itemNumStyle, gridColumn: mrpCol, gridRow: rowSpan }}>
                {fmtDec(Number(item.mrp) || Number(item.rate) || 0)}
              </span>
            ) : null}
            <span style={{ ...itemNumStyle, gridColumn: amtCol, gridRow: rowSpan }}>{fmtDec(item.total)}</span>
          </div>
        );
      })}

      <div style={dashed} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700 }}>
        <div>
          <div>Tot.QTY : {totalQty}</div>
          {paymentLines.map((line) => (
            <div key={line.label}>
              {line.label} : {fmtDec(line.amount)}
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>TOTAL AMT. : {fmtDec(totalAmt)}</div>
          {mrpDiscount > 0 ? <div>DISCOUNT : {fmtDec(mrpDiscount)}</div> : null}
          {saleReturnAdjust > 0 ? <div>S/R : {fmtDec(saleReturnAdjust)}</div> : null}
          {roundOff !== 0 ? <div>ROUND : {fmtDec(roundOff)}</div> : null}
          <div className="vk-net-amt" style={{ fontWeight: 900, fontSize: layout.netFont }}>
            NET AMT. : {fmtDec(grandTotal)}
          </div>
        </div>
      </div>

      <div style={dashed} />

      <div style={{ fontWeight: 700 }}>
        <div style={{ fontWeight: 800 }}>TERMS:</div>
        {termsToPrint.map((term) => (
          <div key={term}>* {term}</div>
        ))}
      </div>

      <div style={{ textAlign: "center", fontWeight: 900, marginTop: 6, fontSize: layout.subFont }}>
        THANK YOU !!! VISIT AGAIN !!!
      </div>
    </div>
  );
});

VastrakalaThermalReceipt80mm.displayName = "VastrakalaThermalReceipt80mm";
