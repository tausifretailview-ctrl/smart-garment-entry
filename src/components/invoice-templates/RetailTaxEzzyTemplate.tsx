import React from "react";
import { numberToWords } from "@/lib/utils";
import "@/styles/print-invoice-core.css";

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

interface RetailTaxEzzyTemplateProps {
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
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  paidAmount?: number;

  qrCodeUrl?: string;
  declarationText?: string;
  termsConditions?: string[];
  notes?: string;

  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  amountWithDecimal?: boolean;
  amountWithGrouping?: boolean;

  customHeaderText?: string;
  salesman?: string;

  stampImageBase64?: string;
  stampPosition?: string;
  stampSize?: string;
  instagramLink?: string;
}

const MAX_ITEMS_PER_PAGE = 12;
/** Minimum product rows on the last page (incl. blanks) so A5 looks balanced with 1–2 lines. */
const MIN_PRODUCT_TABLE_ROWS = 6;

export const RetailTaxEzzyTemplate: React.FC<RetailTaxEzzyTemplateProps> = ({
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
  igstAmount,
  totalTax,
  roundOff = 0,
  grandTotal,
  termsConditions = [],
  notes,
  showHSN = true,
  showBarcode = true,
  showGSTBreakdown = true,
  amountWithDecimal = true,
  amountWithGrouping = true,
  customHeaderText,
  salesman,
  declarationText,
  qrCodeUrl,
  stampImageBase64,
  stampPosition = "bottom-right",
  stampSize = "medium",
  instagramLink,
}) => {
  const fmt = (amount: number) => {
    const value = amountWithDecimal ? amount.toFixed(2) : Math.round(amount).toString();
    if (amountWithGrouping) {
      const parts = value.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }
    return value;
  };

  const moneyEpsilon = 0.005;
  const showDiscountRow = discount > moneyEpsilon;
  const showSrRow = Math.abs(saleReturnAdjust) > moneyEpsilon;
  const showRoundOffRow = Math.abs(roundOff) >= moneyEpsilon;

  const itemPages: (InvoiceItem | null)[][] = [];
  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_PAGE) {
    itemPages.push(items.slice(i, i + MAX_ITEMS_PER_PAGE));
  }
  if (itemPages.length === 0) {
    itemPages.push([]);
  }
  {
    const lastPage = itemPages[itemPages.length - 1];
    const targetRows = Math.min(
      MAX_ITEMS_PER_PAGE,
      Math.max(lastPage.length, MIN_PRODUCT_TABLE_ROWS),
    );
    while (lastPage.length < targetRows) {
      lastPage.push(null);
    }
  }

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const gstBreakup: Record<
    number,
    { taxableValue: number; cgst: number; sgst: number; igst: number }
  > = {};
  const isInterState = igstAmount > 0;

  items.forEach((item) => {
    const gstPct = item.gstPercent || 0;
    if (gstPct > 0) {
      const taxOnItem = (item.total * gstPct) / (100 + gstPct);
      const taxableVal = item.total - taxOnItem;
      if (!gstBreakup[gstPct]) {
        gstBreakup[gstPct] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      gstBreakup[gstPct].taxableValue += taxableVal;
      if (isInterState) {
        gstBreakup[gstPct].igst += taxOnItem;
      } else {
        gstBreakup[gstPct].cgst += taxOnItem / 2;
        gstBreakup[gstPct].sgst += taxOnItem / 2;
      }
    }
  });

  const gstRates = Object.keys(gstBreakup)
    .map(Number)
    .sort((a, b) => a - b);
  const hasGSTData = gstRates.length > 0;

  const stampSizeMap: Record<string, string> = { small: "48px", medium: "72px", large: "96px" };
  const stampDim = stampSizeMap[stampSize] || "72px";

  const docTitle = grandTotal < 0 ? "Credit note" : "Retail Tax Invoice";

  type ColKey =
    | "sr"
    | "barcode"
    | "description"
    | "hsn"
    | "size"
    | "qty"
    | "rate"
    | "disc"
    | "amount";

  const colDefs: { key: ColKey; label: string; width: string; align: "left" | "center" | "right" }[] = [
    { key: "sr", label: "S.No", width: "4%", align: "center" },
  ];
  if (showBarcode) {
    colDefs.push({ key: "barcode", label: "Barcode", width: "11%", align: "center" });
  }
  colDefs.push(
    { key: "description", label: "Product Description", width: showHSN ? "22%" : "28%", align: "left" },
  );
  if (showHSN) colDefs.push({ key: "hsn", label: "HSN", width: "7%", align: "center" });
  colDefs.push(
    { key: "size", label: "Size", width: "6%", align: "center" },
    { key: "qty", label: "Qty", width: "5%", align: "center" },
    { key: "rate", label: "Rate", width: "9%", align: "right" },
    { key: "disc", label: "Disc %", width: "6%", align: "right" },
    { key: "amount", label: "Amount", width: "11%", align: "right" },
  );

  const qtyColIndex = colDefs.findIndex((c) => c.key === "qty");

  const alignClass = (a: "left" | "center" | "right") =>
    a === "left" ? "text-left" : a === "center" ? "text-center" : "text-right";

  const cellBorder =
    "border border-slate-300 px-1 py-0.5 text-[10px] leading-tight text-slate-950 align-middle";
  const thBorder =
    "border border-slate-300 bg-slate-100 px-1 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-950";

  const renderCell = (item: InvoiceItem | null, col: ColKey, srNo: number | null) => {
    if (!item) return "\u00a0";
    switch (col) {
      case "sr":
        return srNo ?? "\u00a0";
      case "barcode":
        return (
          <span className="font-mono tabular-nums tracking-tight">{item.barcode || "—"}</span>
        );
      case "description":
        return (
          <span className="block truncate" title={[item.particulars, item.itemNotes].filter(Boolean).join(" — ")}>
            {item.particulars}
            {item.color ? <span className="text-slate-600"> ({item.color})</span> : null}
            {item.itemNotes ? (
              <span className="mt-0.5 block truncate text-[8px] italic text-slate-600">{item.itemNotes}</span>
            ) : null}
          </span>
        );
      case "hsn":
        return item.hsn || "—";
      case "size":
        return item.size || "—";
      case "qty":
        return item.qty;
      case "rate":
        return fmt(item.rate);
      case "disc": {
        const d = Number(item.discountPercent ?? 0);
        return d > 0 ? d.toFixed(0) : "0";
      }
      case "amount":
        return fmt(item.total);
      default:
        return "";
    }
  };

  return (
    <div className="retail-tax-ezzy-print-root retail-tax-ezzy-all-pages text-slate-950">
      {itemPages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === itemPages.length - 1;
        const pageStartSr = pageIndex * MAX_ITEMS_PER_PAGE;
        let srCounter = 0;

        return (
          <div
            key={pageIndex}
            className="retail-tax-ezzy-page mb-4 box-border w-[148mm] min-h-0 bg-white px-[3mm] py-[3mm] print:mb-0 print:px-[2mm] print:py-[2mm]"
          >
            <div className="flex min-h-0 flex-col border border-slate-300">
              {/* Header */}
              <div className="relative border-b border-slate-300 px-2 py-1 text-center">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="absolute left-2 top-1/2 max-h-[52px] max-w-[100px] -translate-y-1/2 object-contain"
                  />
                ) : null}
                <div className="text-base font-black tracking-wide text-slate-950">{businessName}</div>
                <div className="mt-0.5 text-[9px] font-semibold leading-snug text-slate-800">{address}</div>
                <div className="text-[9px] font-semibold text-slate-800">
                  {mobile ? `Mob: ${mobile}` : ""}
                  {email ? `${mobile ? " | " : ""}${email}` : ""}
                </div>
                {gstNumber ? (
                  <div className="mt-0.5 text-[9px] font-bold">GSTIN: {gstNumber}</div>
                ) : null}
                {instagramLink ? (
                  <div className="mt-0.5 flex items-center justify-center gap-1 text-[8px] font-bold text-slate-950">
                    <span>
                      {instagramLink
                        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@")
                        .replace(/\/$/, "")}
                    </span>
                  </div>
                ) : null}
                {customHeaderText ? (
                  <div className="mt-0.5 text-[8px] text-slate-600">{customHeaderText}</div>
                ) : null}
              </div>

              <div className="border-b border-slate-300 py-0.5 text-center text-xs font-bold uppercase tracking-wide text-slate-950">
                {itemPages.length > 1
                  ? `${docTitle}${pageIndex > 0 ? ` (Page ${pageIndex + 1} of ${itemPages.length})` : ""}`
                  : docTitle}
              </div>

              <div className="flex border-b-2 border-slate-300 text-[10px] leading-snug">
                <div className="flex-1 border-r border-slate-300 p-1.5">
                  <div className="text-[8px] font-bold">Bill To</div>
                  <div className="font-bold">{customerName || "Walk-in Customer"}</div>
                  {customerAddress ? <div>{customerAddress}</div> : null}
                  {customerMobile ? <div>Ph: {customerMobile}</div> : null}
                  {customerGSTIN ? <div>GSTIN: {customerGSTIN}</div> : null}
                </div>
                <div className="w-[40%] shrink-0">
                  <div className="border-b border-slate-300 p-1.5 font-bold">Invoice No: {invoiceNumber}</div>
                  <div className="border-b border-slate-300 p-1.5 font-semibold">
                    Date: {invoiceDate.toLocaleDateString("en-IN")}
                    {invoiceTime ? ` ${invoiceTime}` : ""}
                  </div>
                  {gstNumber ? (
                    <div className="border-b border-slate-300 p-1.5">
                      <span className="font-semibold">State Code:</span> {gstNumber.substring(0, 2)}
                    </div>
                  ) : null}
                  {salesman ? (
                    <div className="p-1.5">
                      <span className="font-semibold">Salesman:</span> {salesman}
                    </div>
                  ) : null}
                </div>
              </div>

              <table className="w-full border-collapse table-fixed text-slate-950">
                <colgroup>
                  {colDefs.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {colDefs.map((c) => (
                      <th key={c.key} className={`${thBorder} ${alignClass(c.align)}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, idx) => {
                    if (item) srCounter++;
                    const srNo = item ? pageStartSr + srCounter : null;
                    return (
                      <tr key={idx} className="min-h-0">
                        {colDefs.map((c) => (
                          <td
                            key={c.key}
                            className={`${cellBorder} ${alignClass(c.align)} ${c.key === "barcode" ? "font-mono tabular-nums" : ""}`}
                          >
                            {renderCell(item, c.key, srNo)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="font-bold">
                    <td
                      colSpan={qtyColIndex}
                      className={`${cellBorder} text-left text-[10px]`}
                    >
                      {isLastPage ? `Total Qty: ${totalQty}` : `Page ${pageIndex + 1} — Continued…`}
                    </td>
                    <td className={`${cellBorder} text-center text-[10px]`}>
                      {isLastPage
                        ? totalQty
                        : pageItems.filter(Boolean).reduce((s, i) => s + (i?.qty || 0), 0)}
                    </td>
                    <td
                      colSpan={colDefs.length - qtyColIndex - 2}
                      className={`${cellBorder} text-right text-[10px]`}
                    >
                      {isLastPage ? "" : "Page sub"}
                    </td>
                    <td className={`${cellBorder} text-right text-[10px]`}>
                      {isLastPage
                        ? ""
                        : `₹${fmt(pageItems.filter(Boolean).reduce((s, i) => s + (i?.total || 0), 0))}`}
                    </td>
                  </tr>
                </tbody>
              </table>

              {isLastPage ? (
                <div className="mt-auto border-t border-slate-300 text-[9px]">
                  <div className="flex border-b border-slate-300">
                    <div className="min-h-0 flex-1 border-r border-slate-300 p-1">
                      {notes?.trim() && !/^\d+$/.test(notes.trim()) ? (
                        <div>
                          <span className="font-bold">Note:</span>{" "}
                          <span className="italic text-slate-800">{notes}</span>
                        </div>
                      ) : (
                        "\u00a0"
                      )}
                    </div>
                    <div className="w-[42%] shrink-0 border-slate-300">
                      <div className="flex justify-between border-b border-slate-300 px-1.5 py-0.5">
                        <span className="leading-tight">
                          Sub Total{" "}
                          <span className="block text-[7px] font-normal normal-case text-slate-600">(incl. GST)</span>
                        </span>
                        <span>₹{fmt(subtotal)}</span>
                      </div>
                      {showDiscountRow ? (
                        <div className="flex justify-between border-b border-slate-300 px-1.5 py-0.5">
                          <span>Discount</span>
                          <span>- ₹{fmt(discount)}</span>
                        </div>
                      ) : null}
                      {showSrRow ? (
                        <div className="flex justify-between border-b border-slate-300 px-1.5 py-0.5">
                          <span>S/R Adjust</span>
                          <span>
                            {saleReturnAdjust > 0
                              ? `- ₹${fmt(saleReturnAdjust)}`
                              : `+ ₹${fmt(-saleReturnAdjust)}`}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex justify-between border-b border-slate-300 px-1.5 py-0.5">
                        <span className="leading-tight">
                          GST{" "}
                          <span className="text-[7px] font-normal normal-case text-slate-600"> (incl. in Sub Total)</span>
                        </span>
                        <span>₹{fmt(totalTax)}</span>
                      </div>
                      {showRoundOffRow ? (
                        <div className="flex justify-between border-b border-slate-300 px-1.5 py-0.5">
                          <span>Round Off</span>
                          <span>
                            {roundOff > 0 ? "+" : ""}
                            ₹{fmt(roundOff)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex justify-between bg-slate-100 px-1.5 py-1 text-sm font-semibold text-slate-950">
                        <span>Total</span>
                        <span>₹{fmt(grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {showGSTBreakdown && hasGSTData ? (
                    <div className="border-b border-slate-300 p-1">
                      <div className="mb-0.5 text-[8px] font-bold uppercase text-slate-950">GST summary (slab)</div>
                      <table className="w-full border-collapse text-[8px]">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-slate-300 px-1 py-0.5">Tax Slab (%)</th>
                            <th className="border border-slate-300 px-1 py-0.5">Taxable Value</th>
                            {isInterState ? (
                              <>
                                <th className="border border-slate-300 px-1 py-0.5">IGST</th>
                                <th className="border border-slate-300 px-1 py-0.5">Total Tax</th>
                              </>
                            ) : (
                              <>
                                <th className="border border-slate-300 px-1 py-0.5">CGST</th>
                                <th className="border border-slate-300 px-1 py-0.5">SGST</th>
                                <th className="border border-slate-300 px-1 py-0.5">Total Tax</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {gstRates.map((rate) => {
                            const row = gstBreakup[rate];
                            const slabTotal = isInterState ? row.igst : row.cgst + row.sgst;
                            return (
                              <tr key={rate}>
                                <td className="border border-slate-300 px-1 py-0.5 text-center">{rate}%</td>
                                <td className="border border-slate-300 px-1 py-0.5 text-right">{fmt(row.taxableValue)}</td>
                                {isInterState ? (
                                  <>
                                    <td className="border border-slate-300 px-1 py-0.5 text-right">{fmt(row.igst)}</td>
                                    <td className="border border-slate-300 px-1 py-0.5 text-right font-semibold">
                                      {fmt(slabTotal)}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="border border-slate-300 px-1 py-0.5 text-right">{fmt(row.cgst)}</td>
                                    <td className="border border-slate-300 px-1 py-0.5 text-right">{fmt(row.sgst)}</td>
                                    <td className="border border-slate-300 px-1 py-0.5 text-right font-semibold">
                                      {fmt(slabTotal)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div className="border-b border-slate-300 px-1 py-0.5 text-[8px] font-semibold leading-tight">
                    <span className="font-bold">Amount in words:</span> {numberToWords(grandTotal)}
                  </div>

                  <div className="relative flex min-h-0">
                    <div className="flex-1 border-r border-slate-300 p-1 pr-1.5">
                      {termsConditions.length > 0 ? (
                        <div>
                          <div className="text-[8px] font-bold underline">Terms &amp; Conditions</div>
                          <ul className="mt-0.5 list-disc pl-2.5 text-[7px] leading-tight text-slate-900">
                            {termsConditions.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {declarationText ? (
                        <div className="mt-0.5 text-[6px] leading-tight text-slate-700">{declarationText}</div>
                      ) : null}
                      <div className="mt-0.5 text-[6px] text-slate-600">E. &amp; O.E.</div>
                    </div>
                    <div className="relative flex w-[38%] shrink-0 flex-col items-center justify-start p-1">
                      {stampImageBase64 ? (
                        <img
                          src={stampImageBase64}
                          alt=""
                          className="object-contain"
                          style={{
                            width: stampDim,
                            height: stampDim,
                            position: "absolute",
                            top: "4px",
                            ...(stampPosition === "bottom-left" ? { left: "6px" } : { right: "6px" }),
                          }}
                        />
                      ) : null}
                      <div className="text-center text-[7px] font-bold">For {businessName}</div>
                      {qrCodeUrl ? (
                        <img
                          src={qrCodeUrl}
                          alt=""
                          className="mt-0.5 h-[48px] w-[48px] border border-slate-300 object-contain"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex border-t border-slate-300 bg-slate-50 text-[9px] font-bold">
                  <div className="flex-1 border-r border-slate-300 p-1.5">&nbsp;</div>
                  <div className="flex w-[42%] justify-between p-1.5">
                    <span>Page total</span>
                    <span>₹{fmt(pageItems.filter(Boolean).reduce((s, i) => s + (i?.total || 0), 0))}</span>
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
          @page { size: A5 portrait; margin: 4mm; }
          .retail-tax-ezzy-page {
            width: 148mm !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .retail-tax-ezzy-all-pages .retail-tax-ezzy-page:not(:last-child) {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>
    </div>
  );
};
