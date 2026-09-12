import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useSettings } from "@/hooks/useSettings";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import {
  buildKidsCampGstRateBreakdown,
  buildKidsCampGstTaxRows,
  fmtKidsCampAmt,
  formatKidsCampMobile,
  instagramHandleFromLink,
  kidsCampLineDiscAmt,
  kidsCampTermLines,
  sumKidsCampGstTaxRows,
  type KidsCampGstRateEntry,
} from "@/utils/kidsCampThermalReceipt";
import "@/styles/kids-camp-thermal-receipt.css";

export interface KidsCampThermalItem {
  sr?: number;
  particulars: string;
  barcode?: string;
  hsn?: string;
  qty: number;
  rate: number;
  total: number;
  discountPercent?: number;
  gstPercent?: number;
}

interface KidsCampThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  items: KidsCampThermalItem[];
  subTotal: number;
  discount?: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;
  gstRateBreakdown?: KidsCampGstRateEntry[];
  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  refundCash?: number;
  documentType?: "invoice" | "quotation" | "sale-order" | "pos";
  salesman?: string;
  settingsOverride?: Record<string, unknown>;
  thermalPaper?: PosThermalPaper;
}

function PayRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="kc-pay-row">
      <span>{label}</span>
      <span>:&nbsp;{fmtKidsCampAmt(amount)}</span>
    </div>
  );
}

export const KidsCampThermalReceipt80mm = React.forwardRef<
  HTMLDivElement,
  KidsCampThermalReceipt80mmProps
>((props, ref) => {
  const {
    billNo,
    date,
    customerName,
    items,
    subTotal,
    discount = 0,
    saleReturnAdjust = 0,
    roundOff = 0,
    grandTotal,
    gstRateBreakdown,
    paymentMethod,
    cashPaid = 0,
    upiPaid = 0,
    cardPaid = 0,
    creditPaid = 0,
    paidAmount = 0,
    documentType = "invoice",
    salesman,
    thermalPaper = "80mm",
  } = props;
  const settingsOverride = props.settingsOverride;

  const { data: orgSettings } = useSettings();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
    settingsOverride ?? null,
  );

  useEffect(() => {
    if (settingsOverride) {
      setSettings(settingsOverride);
      return;
    }
    if (orgSettings) setSettings(orgSettings as Record<string, unknown>);
  }, [orgSettings, settingsOverride]);

  const itemCount = items.length;
  const totalUnits = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const saleAmount = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalAmount = subTotal > 0 ? subTotal : saleAmount;

  const method = String(paymentMethod || "cash").toLowerCase();
  let cash = Number(cashPaid) || 0;
  let card = Number(cardPaid) || 0;
  let paytm = Number(upiPaid) || 0;
  let mswipe = 0;
  const named = cash + card + paytm + (Number(creditPaid) || 0);
  if (named <= 0 && (Number(paidAmount) || 0) > 0) {
    const paid = Number(paidAmount) || 0;
    if (method.includes("mswipe")) mswipe = paid;
    else if (method.includes("card")) card = paid;
    else if (method.includes("upi") || method.includes("paytm") || method.includes("gpay")) paytm = paid;
    else cash = paid;
  }

  const received = cash + card + paytm + mswipe;
  const balance = Math.max(0, grandTotal - received);

  const taxRows = useMemo(() => {
    const breakdown =
      gstRateBreakdown && gstRateBreakdown.length > 0
        ? gstRateBreakdown
        : buildKidsCampGstRateBreakdown(items);
    return buildKidsCampGstTaxRows(breakdown);
  }, [gstRateBreakdown, items]);
  const taxTotals = sumKidsCampGstTaxRows(taxRows);

  const saleSettings = (settings?.sale_settings ?? {}) as {
    invoice_document_title?: string;
    terms_list?: string[];
  };
  const billSettings = (settings?.bill_barcode_settings ?? {}) as {
    instagram_link?: string;
  };

  const customDocTitle = saleSettings.invoice_document_title?.trim();
  const docTitle =
    documentType === "quotation"
      ? "ESTIMATE"
      : documentType === "sale-order"
        ? "SALE ORDER"
        : grandTotal < 0
          ? "CREDIT NOTE"
          : customDocTitle || "GST INVOICE";

  const terms = kidsCampTermLines(saleSettings.terms_list);
  const partyName = (customerName || "CASH").toUpperCase();

  if (!settings) {
    return (
      <div ref={ref} data-invoice-loading="true" className="kids-camp-thermal-receipt-80mm thermal-receipt">
        Loading...
      </div>
    );
  }

  const businessName = String(settings.business_name || "STORE NAME").toUpperCase();
  const address = String(settings.address || "").trim().toUpperCase();
  const gstNumber = String(settings.gst_number || "").trim();
  const mobile = formatKidsCampMobile(String(settings.mobile_number || ""));
  const phone = String(settings.owner_phone || "").trim();
  const instagram = instagramHandleFromLink(billSettings.instagram_link);

  return (
    <div
      ref={ref}
      className="kids-camp-thermal-receipt-80mm thermal-receipt thermal-print-80mm thermal-receipt-container"
      data-thermal-paper={thermalPaper}
    >
      <div className="kc-header">
        <div className="kc-doc-title">{docTitle}</div>
        <div className="kc-company-name">{businessName}</div>
        {address ? <div className="kc-company-meta">{address}</div> : null}
        {mobile ? <div className="kc-company-meta">Mobile : {mobile}</div> : null}
        {instagram ? <div className="kc-company-meta">Instagram Id : {instagram}</div> : null}
        {phone ? <div className="kc-company-meta">Phone : {phone}</div> : null}
        {gstNumber ? <div className="kc-company-meta">GST NO : {gstNumber}</div> : null}
      </div>

      <div className="kc-meta">
        <div className="kc-meta-row">
          <span>INV. NO. : {billNo}</span>
          <span className="kc-date">DATE : {format(date, "dd/MM/yyyy")}</span>
        </div>
        <div>TIME : {format(date, "HH:mm:ss")}</div>
        <div>Cust. Name : {partyName}</div>
        <div>S. Name : {salesman ? salesman.toUpperCase() : ""}</div>
      </div>

      <table className="kc-box kc-items">
        <colgroup>
          <col className="kc-qt" />
          <col className="kc-part" />
          <col className="kc-rate" />
          <col className="kc-amt" />
        </colgroup>
        <thead>
          <tr>
            <th>QT</th>
            <th>PARTICULAR</th>
            <th>RATE</th>
            <th>AMOUNT</th>
          </tr>
          <tr>
            <th></th>
            <th>BARCODE</th>
            <th>HSNCODE</th>
            <th>DISC AMT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <React.Fragment key={i}>
              <tr>
                <td className="kc-qt">{item.qty}</td>
                <td className="kc-name">{item.particulars}</td>
                <td className="kc-num">{fmtKidsCampAmt(item.rate)}</td>
                <td className="kc-num">{fmtKidsCampAmt(item.total)}</td>
              </tr>
              <tr>
                <td className="kc-qt"></td>
                <td className="kc-name">{item.barcode || ""}</td>
                <td className="kc-num">{item.hsn || ""}</td>
                <td className="kc-num">{fmtKidsCampAmt(kidsCampLineDiscAmt(item))}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="kc-count-row">
        <span>NO. of ITEM: {itemCount}</span>
        <span>TOTAL Unit : {totalUnits}</span>
      </div>

      <table className="kc-box kc-totals">
        <colgroup>
          <col />
          <col className="kc-tot-amt" />
        </colgroup>
        <tbody>
          <tr>
            <td>TOTAL AMOUNT :</td>
            <td className="kc-num">{fmtKidsCampAmt(totalAmount)}</td>
          </tr>
          <tr>
            <td>LESS DISCOUNT:</td>
            <td className="kc-num">{fmtKidsCampAmt(discount)}</td>
          </tr>
          {saleReturnAdjust > 0 ? (
            <tr>
              <td>S/R ADJUST :</td>
              <td className="kc-num">{fmtKidsCampAmt(saleReturnAdjust)}</td>
            </tr>
          ) : null}
          <tr>
            <td>ROUND OFF.E :</td>
            <td className="kc-num">{fmtKidsCampAmt(roundOff)}</td>
          </tr>
          <tr>
            <td>NET PAYABLE :</td>
            <td className="kc-num">{fmtKidsCampAmt(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="kc-pay">
        <PayRow label="RECIEVED AMOUNT" amount={received} />
        <PayRow label="BALANCE AMOUNT" amount={balance} />
        <div className="kc-pay-head">RECIVED DETAIL :-</div>
        <PayRow label="CASH RECIEVED" amount={cash} />
        <PayRow label="ICICI CARD" amount={card} />
        <PayRow label="MSWIPE" amount={mswipe} />
        <PayRow label="PAYTM" amount={paytm} />
      </div>

      <div className="kc-tax-title">TAX DETAIL</div>
      <table className="kc-box kc-tax">
        <thead>
          <tr>
            <th>GST TAX</th>
            <th>TAXABLE</th>
            <th>CGST TAX</th>
            <th>SGST TAX</th>
          </tr>
        </thead>
        <tbody>
          {taxRows.map((row) => (
            <tr key={row.rateLabel}>
              <td>{row.rateLabel}</td>
              <td>{fmtKidsCampAmt(row.taxable)}</td>
              <td>{fmtKidsCampAmt(row.cgst)}</td>
              <td>{fmtKidsCampAmt(row.sgst)}</td>
            </tr>
          ))}
          <tr>
            <td>TOTAL</td>
            <td>{fmtKidsCampAmt(taxTotals.taxable)}</td>
            <td>{fmtKidsCampAmt(taxTotals.cgst)}</td>
            <td>{fmtKidsCampAmt(taxTotals.sgst)}</td>
          </tr>
        </tbody>
      </table>

      <div className="kc-tax-note">**Amount Exclusive of SGST &amp; CGST**</div>

      <div className="kc-terms">
        {terms.map((term) => (
          <div key={term}>* {term.replace(/^\*\s*/, "")}</div>
        ))}
      </div>

      <div className="kc-thanks">THANK YOU VISIT AGAIN</div>
    </div>
  );
});

KidsCampThermalReceipt80mm.displayName = "KidsCampThermalReceipt80mm";
