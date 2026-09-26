import React, { forwardRef } from "react";
import { format } from "date-fns";
import {
  buildPurchaseBillSizeGrid,
  formatPurchaseBillProductSubtitle,
  type PurchaseBillPdfItemLayout,
  type PurchaseBillPrintLine,
} from "@/utils/purchaseBillPrintLayouts";

export type PurchaseBillPrintBill = {
  software_bill_no?: string | null;
  supplier_invoice_no?: string | null;
  supplier_name?: string | null;
  bill_date?: string | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  gst_amount?: number | null;
  net_amount?: number | null;
  total_qty?: number | null;
  is_dc_purchase?: boolean | null;
  paymentLabel?: string;
  notes?: string | null;
};

type BusinessDetails = {
  business_name?: string;
  address?: string;
  mobile_number?: string;
  email_id?: string;
  gst_number?: string;
};

export type PurchaseBillPrintProps = {
  bill: PurchaseBillPrintBill;
  items: PurchaseBillPrintLine[];
  businessDetails?: BusinessDetails;
  logoUrl?: string;
  itemLayout: PurchaseBillPdfItemLayout;
};

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const th: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "4px 5px",
  background: "#f4f4f4",
  fontWeight: 700,
  fontSize: "9pt",
  textTransform: "uppercase",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "4px 5px",
  fontSize: "9pt",
  verticalAlign: "middle",
};

export const PurchaseBillPrint = forwardRef<HTMLDivElement, PurchaseBillPrintProps>(
  ({ bill, items, businessDetails, logoUrl, itemLayout }, ref) => {
    const isDc = !!bill.is_dc_purchase;
    const billNo = bill.software_bill_no || "—";
    const billDate = bill.bill_date
      ? format(new Date(bill.bill_date + "T12:00:00"), "dd MMM yyyy")
      : "—";
    const totalQty = bill.total_qty ?? items.reduce((s, i) => s + i.qty, 0);

    const sizeGrid =
      itemLayout === "size-grid" ? buildPurchaseBillSizeGrid(items) : null;

    const renderStandardOrBarcodeTable = () => {
      const showBarcode = itemLayout === "barcode";
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "4%" }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>Product</th>
              {showBarcode && <th style={{ ...th, width: "14%" }}>Barcode</th>}
              {!showBarcode && !isDc && <th style={{ ...th, width: "8%" }}>HSN</th>}
              {!showBarcode && (
                <>
                  <th style={{ ...th, width: "7%" }}>Size</th>
                  <th style={{ ...th, width: "8%" }}>Color</th>
                </>
              )}
              {showBarcode && (
                <>
                  <th style={{ ...th, width: "6%" }}>Size</th>
                  <th style={{ ...th, width: "8%" }}>Color</th>
                </>
              )}
              <th style={{ ...th, width: "6%" }}>Qty</th>
              <th style={{ ...th, width: "10%", textAlign: "right" }}>Buy Rate</th>
              {!isDc && <th style={{ ...th, width: "6%" }}>GST%</th>}
              <th style={{ ...th, width: "11%", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={showBarcode ? 9 : isDc ? 8 : 9} style={{ ...td, textAlign: "center" }}>
                  No line items
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const subtitle = formatPurchaseBillProductSubtitle(item);
                return (
                  <tr key={item.id} style={{ breakInside: "avoid" }}>
                    <td style={{ ...td, textAlign: "center" }}>{idx + 1}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      {!showBarcode && subtitle && (
                        <div style={{ fontSize: "8pt", color: "#444" }}>{subtitle}</div>
                      )}
                    </td>
                    {showBarcode && (
                      <td
                        style={{
                          ...td,
                          fontFamily: "monospace",
                          fontSize: "8pt",
                          textAlign: "center",
                        }}
                      >
                        {item.barcode || "—"}
                      </td>
                    )}
                    {!showBarcode && !isDc && (
                      <td style={{ ...td, textAlign: "center" }}>{item.hsn || "—"}</td>
                    )}
                    <td style={{ ...td, textAlign: "center" }}>{item.size || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{item.color || "—"}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 600 }}>{item.qty}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt(item.purPrice)}</td>
                    {!isDc && (
                      <td style={{ ...td, textAlign: "center" }}>{item.gstPercent}%</td>
                    )}
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                      {fmt(item.lineTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      );
    };

    const renderSizeGridTable = () => {
      if (!sizeGrid) return null;
      const { columns, rows } = sizeGrid;
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "4%" }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>Product</th>
              <th style={{ ...th, width: "8%" }}>Color</th>
              {!isDc && <th style={{ ...th, width: "7%" }}>HSN</th>}
              {columns.map((sz) => (
                <th key={sz} style={{ ...th, width: "5%", textAlign: "center" }}>
                  {sz}
                </th>
              ))}
              <th style={{ ...th, width: "6%" }}>Total</th>
              <th style={{ ...th, width: "9%", textAlign: "right" }}>Buy Rate</th>
              {!isDc && <th style={{ ...th, width: "5%" }}>GST%</th>}
              <th style={{ ...th, width: "10%", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.key} style={{ breakInside: "avoid" }}>
                <td style={{ ...td, textAlign: "center" }}>{idx + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{row.productName}</td>
                <td style={{ ...td, textAlign: "center" }}>{row.color || "—"}</td>
                {!isDc && <td style={{ ...td, textAlign: "center" }}>{row.hsn || "—"}</td>}
                {columns.map((sz) => (
                  <td key={sz} style={{ ...td, textAlign: "center", fontWeight: 600 }}>
                    {row.qtyBySize[sz] ? row.qtyBySize[sz] : "—"}
                  </td>
                ))}
                <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{row.totalPairs}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmt(row.netRate)}</td>
                {!isDc && (
                  <td style={{ ...td, textAlign: "center" }}>{row.gstPercent}%</td>
                )}
                <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmt(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    };

    return (
      <div
        ref={ref}
        className="purchase-bill-print print-document bg-white text-black"
        style={{ width: "210mm", minHeight: "297mm", padding: "8mm", fontFamily: "Arial, sans-serif" }}
      >
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 8mm; }
            .purchase-bill-print { margin: 0; padding: 0; }
          }
        `}</style>

        <div style={{ display: "flex", gap: 12, borderBottom: "2px solid #0f766e", paddingBottom: 8 }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ width: 48, height: 48, objectFit: "contain" }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14pt", fontWeight: 800, color: "#0f766e" }}>
              {businessDetails?.business_name || "Business"}
            </div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 2 }}>{businessDetails?.address}</div>
            <div style={{ fontSize: "8pt", color: "#666", marginTop: 2 }}>
              {[businessDetails?.mobile_number, businessDetails?.email_id].filter(Boolean).join(" | ")}
              {businessDetails?.gst_number ? ` | GSTIN: ${businessDetails.gst_number}` : ""}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: "11pt",
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: "#134e4a",
          }}
        >
          PURCHASE BILL{isDc ? " (DC — No GST)" : ""}
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 8,
            fontSize: "9pt",
          }}
        >
          <tbody>
            <tr>
              <td style={{ ...td, width: "50%" }}>
                <strong>Bill No:</strong> {billNo}
              </td>
              <td style={td}>
                <strong>Supplier Inv No:</strong> {bill.supplier_invoice_no || "—"}
              </td>
            </tr>
            <tr>
              <td style={td}>
                <strong>Supplier:</strong> {bill.supplier_name || "—"}
              </td>
              <td style={td}>
                <strong>Bill Date:</strong> {billDate}
              </td>
            </tr>
            <tr>
              <td style={td} colSpan={2}>
                <strong>Payment:</strong> {bill.paymentLabel || "—"}
                <span style={{ marginLeft: 16 }}>
                  <strong>Total Qty:</strong> {totalQty}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {itemLayout === "size-grid" ? renderSizeGridTable() : renderStandardOrBarcodeTable()}

        <div
          style={{
            marginTop: 12,
            marginLeft: "auto",
            width: "55%",
            fontSize: "9pt",
            border: "1px solid #ddd",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 8px",
              borderBottom: "1px solid #eee",
            }}
          >
            <span>Gross</span>
            <span>{fmt(Number(bill.gross_amount) || 0)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 8px",
              borderBottom: "1px solid #eee",
            }}
          >
            <span>Discount</span>
            <span>{fmt(Number(bill.discount_amount) || 0)}</span>
          </div>
          {!isDc && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 8px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span>GST</span>
              <span>{fmt(Number(bill.gst_amount) || 0)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 8px",
              fontWeight: 800,
              fontSize: "10pt",
              background: "#f0fdfa",
            }}
          >
            <span>Net Payable</span>
            <span>{fmt(Number(bill.net_amount) || 0)}</span>
          </div>
        </div>

        {bill.notes ? (
          <div style={{ fontSize: "9pt", marginTop: 8 }}>Note: {bill.notes}</div>
        ) : null}
        <div style={{ fontSize: "8pt", color: "#666", marginTop: 12, textAlign: "right" }}>
          Generated{" "}
          {new Date().toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  },
);

PurchaseBillPrint.displayName = "PurchaseBillPrint";
