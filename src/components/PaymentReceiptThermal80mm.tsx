import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import type {
  PaymentReceiptCompanyDetails,
  OrgSettingsForPaymentReceipt,
} from "@/utils/paymentReceiptPrintConfig";
import type { PosThermalPaper } from "@/utils/invoicePrintFormat";
import { paymentAmountToWords } from "@/utils/paymentReceiptWords";
import { splitVastrakalaShopHeader } from "@/utils/vastrakalaThermalHeader";
import { instagramHandleFromLink } from "@/utils/kidsCampThermalReceipt";
import "@/styles/vastrakala-thermal-receipt.css";

export type PaymentReceiptData = {
  voucherNumber: string;
  voucherDate: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  paidAmount: number;
  paymentMethod: string;
  previousBalance: number;
  currentBalance: number;
  discountAmount?: number;
  discountReason?: string;
};

export type PaymentReceiptSettingsSlice = {
  headerText?: string;
  footerText?: string;
  showCompanyLogo?: boolean;
  showQrCode?: boolean;
  showSignature?: boolean;
  signatureLabel?: string;
};

type HeaderMode = "vastrakala" | "retail-pos" | "classic";

function headerModeForTemplate(template: string): HeaderMode {
  if (template === "vastrakala-80mm") return "vastrakala";
  if (
    template === "retail-pos-80mm" ||
    template === "trendzo-pos-80mm" ||
    template === "kids-80mm" ||
    template === "kids-camp-80mm"
  ) {
    return "retail-pos";
  }
  return "classic";
}

function layoutForPaper(paper: PosThermalPaper, mode: HeaderMode) {
  const is58 = paper === "58mm";
  return {
    paperWidth: mode === "vastrakala" ? (is58 ? "48mm" : "76mm") : is58 ? "48mm" : "72mm",
    padding: is58 ? "1.5mm 1.5mm" : "2mm 2.5mm",
    baseFont: is58 ? "10px" : mode === "vastrakala" ? "13px" : "12px",
    headerFont: is58 ? "14px" : mode === "vastrakala" ? "22px" : "16px",
    taglineFont: is58 ? "9px" : "12px",
    logoMax: is58 ? "14mm" : mode === "vastrakala" ? "22mm" : "18mm",
    logoHeight: is58 ? "16mm" : "26mm",
    sectionGap: is58 ? 6 : 10,
    fontFamily:
      mode === "retail-pos"
        ? "'Courier New', Courier, monospace"
        : "Arial, Helvetica, sans-serif",
  };
}

const mmValue = (v: string): number => parseFloat(v) || 0;

interface PaymentReceiptThermal80mmProps {
  receiptData: PaymentReceiptData;
  companyDetails: PaymentReceiptCompanyDetails;
  receiptSettings?: PaymentReceiptSettingsSlice;
  posInvoiceTemplate: string;
  thermalPaper?: PosThermalPaper;
  orgSettings?: OrgSettingsForPaymentReceipt | null;
}

export const PaymentReceiptThermal80mm = React.forwardRef<
  HTMLDivElement,
  PaymentReceiptThermal80mmProps
>(
  (
    {
      receiptData,
      companyDetails,
      receiptSettings = {},
      posInvoiceTemplate,
      thermalPaper = "80mm",
      orgSettings,
    },
    ref,
  ) => {
    const headerMode = headerModeForTemplate(posInvoiceTemplate);
    const layout = useMemo(
      () => layoutForPaper(thermalPaper, headerMode),
      [thermalPaper, headerMode],
    );
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [logoAspect, setLogoAspect] = useState<number | null>(null);

    const paidAmount = receiptData.paidAmount || 0;
    const discountAmount = receiptData.discountAmount || 0;
    const totalSettled = paidAmount + discountAmount;

    const logoUrl =
      receiptSettings.showCompanyLogo !== false ? (companyDetails.logoUrl || "").trim() : "";
    useEffect(() => setLogoAspect(null), [logoUrl]);

    useEffect(() => {
      if (!receiptSettings.showQrCode || !companyDetails.upiId || paidAmount <= 0) {
        setQrCodeUrl("");
        return;
      }
      const upiString = `upi://pay?pa=${companyDetails.upiId}&pn=${encodeURIComponent(
        companyDetails.businessName || "",
      )}&am=${paidAmount}&cu=INR`;
      void QRCode.toDataURL(upiString, { width: 160, margin: 1, errorCorrectionLevel: "M" })
        .then(setQrCodeUrl)
        .catch(() => setQrCodeUrl(""));
    }, [companyDetails.upiId, companyDetails.businessName, paidAmount, receiptSettings.showQrCode]);

    const billSettings = orgSettings?.bill_barcode_settings;
    const shopHeader = useMemo(
      () => splitVastrakalaShopHeader(String(companyDetails.businessName || "STORE NAME")),
      [companyDetails.businessName],
    );
    const businessNameUpper = String(companyDetails.businessName || "STORE NAME").toUpperCase();
    const address = String(companyDetails.address || "").trim();
    const mobile = String(companyDetails.mobileNumber || "").trim();
    const instagramHandle = instagramHandleFromLink(billSettings?.instagram_link);

    const logoWidthMm = Math.min(
      mmValue(layout.logoMax),
      mmValue(layout.logoHeight) * (logoAspect ?? 1),
    );

    const dashed: React.CSSProperties = {
      borderTop: "1px dashed #000",
      margin: `${layout.sectionGap}px 0`,
    };

    const base: React.CSSProperties = {
      width: layout.paperWidth,
      maxWidth: layout.paperWidth,
      margin: "0 auto",
      padding: layout.padding,
      backgroundColor: "#fff",
      color: "#000",
      fontFamily: layout.fontFamily,
      fontSize: layout.baseFont,
      lineHeight: 1.35,
      boxSizing: "border-box",
      WebkitPrintColorAdjust: "exact",
      printColorAdjust: "exact",
      textTransform: headerMode === "retail-pos" ? "uppercase" : undefined,
    };

    const rootClass =
      headerMode === "vastrakala"
        ? "thermal-print-80mm thermal-receipt-container vastrakala-thermal-receipt-80mm payment-receipt-thermal"
        : "thermal-print-80mm thermal-receipt-container payment-receipt-thermal";

    const renderLogo = (centered?: boolean) => {
      if (!logoUrl) return null;
      if (headerMode === "vastrakala") {
        return (
          <img
            src={logoUrl}
            alt=""
            className="vk-header-logo"
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) setLogoAspect(naturalWidth / naturalHeight);
            }}
            style={
              {
                "--vk-logo-h": layout.logoHeight,
                "--vk-logo-max-w": layout.logoMax,
                display: "block",
                flex: "0 0 auto",
                width: `${logoWidthMm.toFixed(2)}mm`,
                maxHeight: layout.logoHeight,
                objectFit: "contain",
              } as React.CSSProperties
            }
          />
        );
      }
      return (
        <img
          src={logoUrl}
          alt=""
          style={{
            display: "block",
            margin: centered ? "0 auto 2px" : undefined,
            maxHeight: layout.logoMax,
            maxWidth: centered ? "70%" : layout.logoMax,
            objectFit: "contain",
          }}
        />
      );
    };

    const renderShopHeader = () => {
      if (headerMode === "vastrakala") {
        const shopDetails = (
          <>
            <div className="vk-header-title" style={{ fontSize: layout.headerFont, letterSpacing: "0.4px" }}>
              {shopHeader.title}
            </div>
            {shopHeader.tagline ? (
              <div className="vk-header-tagline" style={{ fontSize: layout.taglineFont, marginTop: 2 }}>
                {shopHeader.tagline}
              </div>
            ) : null}
            <div className="vk-header-meta">
              {address ? (
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4, textTransform: "uppercase" }}>
                  {address}
                </div>
              ) : null}
              {mobile ? <div>CONTACT : {mobile}</div> : null}
              {instagramHandle ? <div style={{ marginTop: 3 }}>{instagramHandle}</div> : null}
            </div>
          </>
        );
        return (
          <div className="vk-header vk-section">
            {logoUrl ? (
              <div
                className="vk-header-brand-row"
                style={{ display: "flex", alignItems: "center", gap: "2.5mm" }}
              >
                {renderLogo()}
                <div className="vk-header-shop" style={{ flex: "1 1 auto", minWidth: 0, textAlign: "center" }}>
                  {shopDetails}
                </div>
              </div>
            ) : (
              <div className="vk-header-shop" style={{ textAlign: "center" }}>
                {shopDetails}
              </div>
            )}
          </div>
        );
      }

      return (
        <div style={{ textAlign: "center" }}>
          {renderLogo(true)}
          <div style={{ fontWeight: 700, fontSize: layout.headerFont, textTransform: "uppercase" }}>
            {businessNameUpper}
          </div>
          {address ? (
            <div style={{ whiteSpace: "pre-wrap", textTransform: "uppercase", marginTop: 2 }}>{address}</div>
          ) : null}
          {mobile ? (
            <div style={{ marginTop: 2 }}>
              {headerMode === "retail-pos" ? `MOB.:${mobile}` : `Phone: ${mobile}`}
            </div>
          ) : null}
          {companyDetails.gstNumber ? (
            <div style={{ marginTop: 2, fontSize: "0.95em" }}>GSTIN: {companyDetails.gstNumber}</div>
          ) : null}
        </div>
      );
    };

    const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

    return (
      <div ref={ref} className={rootClass} data-thermal-paper={thermalPaper} style={base}>
        {renderShopHeader()}

        <div
          style={{
            textAlign: "center",
            fontWeight: 700,
            fontSize: layout.baseFont,
            letterSpacing: headerMode === "vastrakala" ? "0.5px" : undefined,
            marginTop: layout.sectionGap,
            textTransform: "uppercase",
          }}
        >
          PAYMENT RECEIPT
        </div>
        {receiptSettings.headerText ? (
          <div style={{ textAlign: "center", fontSize: "0.9em", marginTop: 2 }}>{receiptSettings.headerText}</div>
        ) : null}

        <div style={dashed} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 4 }}>
          <span>
            <span style={{ fontWeight: 600 }}>Receipt No: </span>
            {receiptData.voucherNumber}
          </span>
          <span>
            <span style={{ fontWeight: 600 }}>Date: </span>
            {receiptData.voucherDate
              ? format(new Date(receiptData.voucherDate), headerMode === "retail-pos" ? "dd-MM-yyyy" : "dd MMM yyyy")
              : "-"}
          </span>
        </div>

        <div style={{ marginBottom: layout.sectionGap }}>
          <div style={{ fontWeight: 700, fontSize: "0.95em" }}>Received From:</div>
          <div style={{ fontWeight: 600, textTransform: "uppercase" }}>{receiptData.customerName}</div>
          {receiptData.customerPhone ? (
            <div style={{ fontSize: "0.95em" }}>Phone: {receiptData.customerPhone}</div>
          ) : null}
          {receiptData.customerAddress ? (
            <div style={{ fontSize: "0.9em" }}>{receiptData.customerAddress}</div>
          ) : null}
        </div>

        <div style={dashed} />

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: layout.sectionGap }}>
          <thead>
            <tr>
              <th
                style={{
                  backgroundColor: "#000",
                  color: "#fff",
                  textAlign: "left",
                  padding: "4px 6px",
                  fontSize: "1.05em",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                DESCRIPTION
              </th>
              <th
                style={{
                  backgroundColor: "#000",
                  color: "#fff",
                  textAlign: "right",
                  padding: "4px 6px",
                  width: "28%",
                  fontSize: "1.05em",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                AMOUNT
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>
                Payment for Invoice: {receiptData.invoiceNumber || "-"}
                <span style={{ fontSize: "0.9em", marginLeft: 4 }}>
                  (
                  {receiptData.invoiceDate
                    ? format(new Date(receiptData.invoiceDate), "dd MMM yyyy")
                    : "-"}
                  )
                </span>
              </td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right" }}>
                {fmtInr(receiptData.invoiceAmount)}
              </td>
            </tr>
            <tr>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>Previous Balance</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right" }}>
                {fmtInr(receiptData.previousBalance)}
              </td>
            </tr>
            <tr>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", fontWeight: 700 }}>
                Amount Received
              </td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>
                {fmtInr(paidAmount)}
              </td>
            </tr>
            {discountAmount > 0 ? (
              <>
                <tr>
                  <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>
                    Discount
                    {receiptData.discountReason ? ` (${receiptData.discountReason})` : ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right" }}>
                    {fmtInr(discountAmount)}
                  </td>
                </tr>
                <tr>
                  <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", fontWeight: 700 }}>
                    Total Settled
                  </td>
                  <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>
                    {fmtInr(totalSettled)}
                  </td>
                </tr>
              </>
            ) : null}
            <tr>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px" }}>Payment Method</td>
              <td style={{ borderBottom: "1px solid #ccc", padding: "4px 6px", textAlign: "right" }}>
                {(receiptData.paymentMethod || "-").toUpperCase()}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "4px 6px", fontWeight: 700 }}>Current Balance</td>
              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>
                {fmtInr(receiptData.currentBalance)}
              </td>
            </tr>
          </tbody>
        </table>

        {receiptSettings.showQrCode && qrCodeUrl ? (
          <div style={{ textAlign: "center", marginBottom: layout.sectionGap }}>
            <img src={qrCodeUrl} alt="" style={{ width: 96, height: 96 }} />
            <div style={{ fontSize: "0.85em" }}>Scan to Pay</div>
          </div>
        ) : null}

        <div style={{ fontSize: "0.92em", marginBottom: layout.sectionGap }}>
          <span style={{ fontWeight: 600 }}>Amount in Words: </span>
          <span style={{ fontStyle: "italic" }}>
            Rupees {paymentAmountToWords(paidAmount)} Only
          </span>
        </div>

        {receiptSettings.showSignature !== false ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, marginBottom: 8 }}>
            <div style={{ textAlign: "center", width: "40%" }}>
              <div style={{ borderTop: "2px solid #000", paddingTop: 4, fontWeight: 600, fontSize: "0.9em" }}>
                {receiptSettings.signatureLabel || "Authorized Signature"}
              </div>
            </div>
          </div>
        ) : null}

        {receiptSettings.footerText ? (
          <div style={{ borderTop: "1px solid #ccc", paddingTop: 6, textAlign: "center", fontSize: "0.9em" }}>
            {receiptSettings.footerText}
          </div>
        ) : null}

        <div style={{ textAlign: "center", fontSize: "0.85em", marginTop: 8, opacity: 0.85 }}>
          This is a computer-generated receipt and does not require a signature.
        </div>
      </div>
    );
  },
);

PaymentReceiptThermal80mm.displayName = "PaymentReceiptThermal80mm";
