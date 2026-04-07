import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { numberToWords } from "@/lib/utils";

interface EInvoicePrintProps {
  invoice: {
    sale_number: string;
    sale_date: string;
    customer_name: string;
    customer_phone?: string;
    customer_address?: string;
    net_amount: number;
    gross_amount: number;
    discount_amount?: number;
    flat_discount_amount?: number;
    round_off?: number;
    gst_amount?: number;
    irn?: string;
    ack_no?: string;
    ack_date?: string;
    einvoice_qr_code?: string;
    sale_items?: Array<{
      product_name: string;
      size: string;
      quantity: number;
      unit_price: number;
      mrp: number;
      discount_percent: number;
      line_total: number;
      hsn_code?: string;
      gst_percent?: number;
    }>;
    customers?: {
      gst_number?: string;
    };
  };
  settings?: {
    company_name?: string;
    company_address?: string;
    company_phone?: string;
    company_email?: string;
    gst_number?: string;
    logo_url?: string;
  };
}

export const EInvoicePrint = React.forwardRef<HTMLDivElement, EInvoicePrintProps>(
  ({ invoice, settings }, ref) => {
    const [qrCodeImage, setQrCodeImage] = useState<string>("");

    useEffect(() => {
      const generateQR = async () => {
        if (invoice.einvoice_qr_code) {
          try {
            const qrDataUrl = await QRCode.toDataURL(invoice.einvoice_qr_code, {
              width: 120,
              margin: 1,
            });
            setQrCodeImage(qrDataUrl);
          } catch (error) {
            console.error("Error generating QR code:", error);
          }
        }
      };
      generateQR();
    }, [invoice.einvoice_qr_code]);

    const formatDate = (dateString: string) => {
      if (!dateString) return "-";
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    const totalQty = invoice.sale_items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const totalDiscount = (invoice.discount_amount || 0) + (invoice.flat_discount_amount || 0);

    // Compute per-item taxable and GST amounts
    const itemTaxDetails = (invoice.sale_items || []).map(item => {
      const rate = item.gst_percent || 0;
      const taxable = rate > 0 ? item.line_total / (1 + rate / 100) : item.line_total;
      const gstAmt = item.line_total - taxable;
      return {
        taxable: Math.round(taxable * 100) / 100,
        cgst: Math.round((gstAmt / 2) * 100) / 100,
        sgst: Math.round((gstAmt / 2) * 100) / 100,
        igst: 0,
        rate,
      };
    });

    const totalTaxable = itemTaxDetails.reduce((s, i) => s + i.taxable, 0);
    const totalCgst = itemTaxDetails.reduce((s, i) => s + i.cgst, 0);
    const totalSgst = itemTaxDetails.reduce((s, i) => s + i.sgst, 0);

    // HSN-wise summary grouped by rate
    const hsnSummary = (invoice.sale_items || []).reduce((acc, item, idx) => {
      const hsn = item.hsn_code || '-';
      const rate = item.gst_percent || 0;
      const key = `${hsn}_${rate}`;
      if (!acc[key]) {
        acc[key] = { hsn, rate, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      }
      acc[key].taxable += itemTaxDetails[idx].taxable;
      acc[key].cgst += itemTaxDetails[idx].cgst;
      acc[key].sgst += itemTaxDetails[idx].sgst;
      acc[key].total += item.line_total;
      return acc;
    }, {} as Record<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; total: number }>);

    const th = { border: "1px solid #333", padding: "5px 6px", fontSize: "9px", fontWeight: "bold" as const, backgroundColor: "#f0f0f0" };
    const td = { border: "1px solid #999", padding: "4px 5px", fontSize: "9px" };
    const tdRight = { ...td, textAlign: "right" as const };
    const tdCenter = { ...td, textAlign: "center" as const };

    return (
      <div
        ref={ref}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "8mm 10mm",
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          backgroundColor: "#fff",
          color: "#000",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", borderBottom: "2px solid #000", paddingBottom: "8px" }}>
          <div style={{ flex: 1 }}>
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="Logo" style={{ height: "45px", marginBottom: "4px" }} />
            )}
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{settings?.company_name || "Company Name"}</h2>
            <p style={{ margin: "2px 0", fontSize: "9px" }}>{settings?.company_address || ""}</p>
            <p style={{ margin: "2px 0", fontSize: "9px" }}>
              Phone: {settings?.company_phone || ""} | Email: {settings?.company_email || ""}
            </p>
            <p style={{ margin: "2px 0", fontSize: "10px", fontWeight: "bold" }}>GSTIN: {settings?.gst_number || ""}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              backgroundColor: "#4CAF50",
              color: "#fff",
              padding: "4px 12px",
              borderRadius: "3px",
              display: "inline-block",
              marginBottom: "6px",
              fontSize: "11px",
            }}>
              <strong>e-Invoice</strong>
            </div>
            <h3 style={{ margin: "4px 0", fontSize: "13px" }}>TAX INVOICE</h3>
            <p style={{ margin: "2px 0", fontSize: "10px" }}><strong>Invoice No:</strong> {invoice.sale_number}</p>
            <p style={{ margin: "2px 0", fontSize: "10px" }}><strong>Date:</strong> {formatDate(invoice.sale_date)}</p>
          </div>
        </div>

        {/* IRN & QR Code Section */}
        <div style={{
          border: "1px solid #4CAF50",
          borderRadius: "4px",
          padding: "8px",
          marginBottom: "10px",
          backgroundColor: "#f8fff8"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "2px 0", fontSize: "9px" }}>
                <strong>IRN:</strong> <span style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{invoice.irn || "N/A"}</span>
              </p>
              <p style={{ margin: "2px 0", fontSize: "9px" }}>
                <strong>Ack No:</strong> {invoice.ack_no || "N/A"}
              </p>
              <p style={{ margin: "2px 0", fontSize: "9px" }}>
                <strong>Ack Date:</strong> {invoice.ack_date || "N/A"}
              </p>
            </div>
            <div style={{ marginLeft: "15px", textAlign: "center" }}>
              {qrCodeImage ? (
                <div>
                  <img src={qrCodeImage} alt="e-Invoice QR Code" style={{ width: "95px", height: "95px" }} />
                  <p style={{ fontSize: "7px", margin: "2px 0" }}>Scan for verification</p>
                </div>
              ) : (
                <div style={{ width: "95px", height: "95px", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "8px", color: "#999" }}>QR Code</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Buyer Details */}
        <div style={{ display: "flex", marginBottom: "10px", border: "1px solid #999", borderRadius: "2px" }}>
          <div style={{ flex: 1, padding: "8px", borderRight: "1px solid #999" }}>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "10px", color: "#333", fontWeight: "bold" }}>Bill To:</h4>
            <p style={{ margin: "1px 0", fontWeight: "bold", fontSize: "10px" }}>{invoice.customer_name}</p>
            <p style={{ margin: "1px 0", fontSize: "9px" }}>{invoice.customer_address || ""}</p>
            <p style={{ margin: "1px 0", fontSize: "9px" }}>Phone: {invoice.customer_phone || "-"}</p>
            <p style={{ margin: "1px 0", fontWeight: "bold", fontSize: "10px" }}>GSTIN: {invoice.customers?.gst_number || "N/A"}</p>
          </div>
          <div style={{ flex: 1, padding: "8px" }}>
            <h4 style={{ margin: "0 0 4px 0", fontSize: "10px", color: "#333", fontWeight: "bold" }}>Ship To:</h4>
            <p style={{ margin: "1px 0", fontWeight: "bold", fontSize: "10px" }}>{invoice.customer_name}</p>
            <p style={{ margin: "1px 0", fontSize: "9px" }}>{invoice.customer_address || "Same as billing address"}</p>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "center", width: "4%" }}>Sr</th>
              <th style={{ ...th, textAlign: "left", width: "22%" }}>Description</th>
              <th style={{ ...th, textAlign: "center", width: "8%" }}>HSN</th>
              <th style={{ ...th, textAlign: "center", width: "6%" }}>Size</th>
              <th style={{ ...th, textAlign: "center", width: "5%" }}>Qty</th>
              <th style={{ ...th, textAlign: "right", width: "8%" }}>Rate</th>
              <th style={{ ...th, textAlign: "right", width: "6%" }}>Disc%</th>
              <th style={{ ...th, textAlign: "right", width: "9%" }}>Taxable</th>
              <th style={{ ...th, textAlign: "center", width: "5%" }}>GST%</th>
              <th style={{ ...th, textAlign: "right", width: "8%" }}>CGST</th>
              <th style={{ ...th, textAlign: "right", width: "8%" }}>SGST</th>
              <th style={{ ...th, textAlign: "right", width: "9%" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.sale_items?.map((item, index) => (
              <tr key={index}>
                <td style={tdCenter}>{index + 1}</td>
                <td style={td}>{item.product_name}</td>
                <td style={tdCenter}>{item.hsn_code || "-"}</td>
                <td style={tdCenter}>{item.size}</td>
                <td style={tdCenter}>{item.quantity}</td>
                <td style={tdRight}>₹{item.unit_price.toFixed(2)}</td>
                <td style={tdRight}>{item.discount_percent}%</td>
                <td style={tdRight}>₹{itemTaxDetails[index]?.taxable.toFixed(2)}</td>
                <td style={tdCenter}>{item.gst_percent || 0}%</td>
                <td style={tdRight}>₹{itemTaxDetails[index]?.cgst.toFixed(2)}</td>
                <td style={tdRight}>₹{itemTaxDetails[index]?.sgst.toFixed(2)}</td>
                <td style={tdRight}>₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#f0f0f0", fontWeight: "bold" }}>
              <td colSpan={4} style={{ ...td, textAlign: "right", fontWeight: "bold" }}>Total:</td>
              <td style={{ ...tdCenter, fontWeight: "bold" }}>{totalQty}</td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalTaxable.toFixed(2)}</td>
              <td style={td}></td>
              <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalCgst.toFixed(2)}</td>
              <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalSgst.toFixed(2)}</td>
              <td style={{ ...tdRight, fontWeight: "bold" }}>₹{invoice.gross_amount?.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {/* HSN-wise Tax Summary */}
        <div style={{ marginBottom: "10px" }}>
          <p style={{ fontSize: "9px", fontWeight: "bold", margin: "0 0 4px 0", borderBottom: "1px solid #333", paddingBottom: "2px" }}>HSN/SAC Summary</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", width: "15%" }}>HSN/SAC</th>
                <th style={{ ...th, textAlign: "right", width: "18%" }}>Taxable Value</th>
                <th style={{ ...th, textAlign: "center", width: "10%" }}>Rate</th>
                <th style={{ ...th, textAlign: "right", width: "15%" }}>CGST</th>
                <th style={{ ...th, textAlign: "right", width: "15%" }}>SGST</th>
                <th style={{ ...th, textAlign: "right", width: "15%" }}>Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(hsnSummary).map((row, i) => (
                <tr key={i}>
                  <td style={td}>{row.hsn}</td>
                  <td style={tdRight}>₹{row.taxable.toFixed(2)}</td>
                  <td style={tdCenter}>{row.rate}%</td>
                  <td style={tdRight}>₹{row.cgst.toFixed(2)}</td>
                  <td style={tdRight}>₹{row.sgst.toFixed(2)}</td>
                  <td style={tdRight}>₹{(row.cgst + row.sgst).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold", backgroundColor: "#f0f0f0" }}>
                <td style={{ ...td, fontWeight: "bold" }}>Total</td>
                <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalTaxable.toFixed(2)}</td>
                <td style={td}></td>
                <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalCgst.toFixed(2)}</td>
                <td style={{ ...tdRight, fontWeight: "bold" }}>₹{totalSgst.toFixed(2)}</td>
                <td style={{ ...tdRight, fontWeight: "bold" }}>₹{(totalCgst + totalSgst).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Summary Section */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
          <div style={{ width: "260px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px" }}>
              <span>Gross Amount:</span>
              <span>₹{invoice.gross_amount?.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px", color: "#c00" }}>
                <span>Discount:</span>
                <span>-₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px" }}>
              <span>Taxable Value:</span>
              <span>₹{totalTaxable.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px" }}>
              <span>CGST:</span>
              <span>₹{totalCgst.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px" }}>
              <span>SGST:</span>
              <span>₹{totalSgst.toFixed(2)}</span>
            </div>
            {(invoice.round_off ?? 0) !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "9px" }}>
                <span>Round Off:</span>
                <span>₹{(invoice.round_off ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px", fontWeight: "bold", borderTop: "2px solid #000", marginTop: "4px" }}>
              <span>Grand Total:</span>
              <span>₹{invoice.net_amount.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px solid #ddd", paddingTop: "4px", marginTop: "2px" }}>
              <p style={{ fontSize: "9px", fontStyle: "italic", margin: 0 }}>
                <strong>Amount in Words:</strong> {numberToWords(invoice.net_amount)}
              </p>
            </div>
          </div>
        </div>

        {/* Declaration */}
        <div style={{ borderTop: "1px solid #999", paddingTop: "8px", marginTop: "15px" }}>
          <p style={{ fontSize: "8px", color: "#666", margin: "2px 0" }}>
            <strong>Declaration:</strong> This is a computer-generated e-Invoice and does not require a physical signature.
          </p>
          <p style={{ fontSize: "8px", color: "#666", margin: "2px 0" }}>
            Certified that the particulars given above are true and correct.
          </p>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "15px", borderTop: "1px solid #999", paddingTop: "8px" }}>
          <div>
            <p style={{ fontSize: "9px", color: "#666" }}>Thank you for your business!</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "9px", marginBottom: "25px" }}>For {settings?.company_name || "Company Name"}</p>
            <p style={{ fontSize: "8px", borderTop: "1px solid #333", paddingTop: "3px" }}>Authorized Signatory</p>
          </div>
        </div>
      </div>
    );
  }
);

EInvoicePrint.displayName = "EInvoicePrint";
