import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

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
    
    // Calculate GST (assuming inclusive)
    const gstRate = invoice.sale_items?.[0]?.gst_percent || 5;
    const taxableValue = invoice.net_amount / (1 + gstRate / 100);
    const totalGst = invoice.net_amount - taxableValue;
    const cgst = totalGst / 2;
    const sgst = totalGst / 2;

    return (
      <div
        ref={ref}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "10mm",
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          backgroundColor: "#fff",
          color: "#000",
        }}
      >
        {/* Header with e-Invoice badge */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", borderBottom: "2px solid #000", paddingBottom: "10px" }}>
          <div style={{ flex: 1 }}>
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="Logo" style={{ height: "50px", marginBottom: "5px" }} />
            )}
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "bold" }}>{settings?.company_name || "Company Name"}</h2>
            <p style={{ margin: "3px 0", fontSize: "10px" }}>{settings?.company_address || ""}</p>
            <p style={{ margin: "3px 0", fontSize: "10px" }}>
              Phone: {settings?.company_phone || ""} | Email: {settings?.company_email || ""}
            </p>
            <p style={{ margin: "3px 0", fontSize: "11px", fontWeight: "bold" }}>GSTIN: {settings?.gst_number || ""}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ 
              backgroundColor: "#4CAF50", 
              color: "#fff", 
              padding: "5px 15px", 
              borderRadius: "3px",
              display: "inline-block",
              marginBottom: "10px"
            }}>
              <strong>e-Invoice</strong>
            </div>
            <h3 style={{ margin: "5px 0", fontSize: "14px" }}>TAX INVOICE</h3>
            <p style={{ margin: "3px 0" }}><strong>Invoice No:</strong> {invoice.sale_number}</p>
            <p style={{ margin: "3px 0" }}><strong>Date:</strong> {formatDate(invoice.sale_date)}</p>
          </div>
        </div>

        {/* IRN & QR Code Section */}
        <div style={{ 
          border: "1px solid #4CAF50", 
          borderRadius: "5px", 
          padding: "10px", 
          marginBottom: "15px",
          backgroundColor: "#f8fff8"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "3px 0", fontSize: "10px" }}>
                <strong>IRN:</strong> <span style={{ wordBreak: "break-all" }}>{invoice.irn || "N/A"}</span>
              </p>
              <p style={{ margin: "3px 0", fontSize: "10px" }}>
                <strong>Ack No:</strong> {invoice.ack_no || "N/A"}
              </p>
              <p style={{ margin: "3px 0", fontSize: "10px" }}>
                <strong>Ack Date:</strong> {invoice.ack_date || "N/A"}
              </p>
            </div>
            <div style={{ marginLeft: "20px", textAlign: "center" }}>
              {qrCodeImage ? (
                <div>
                  <img src={qrCodeImage} alt="e-Invoice QR Code" style={{ width: "100px", height: "100px" }} />
                  <p style={{ fontSize: "8px", margin: "3px 0" }}>Scan for verification</p>
                </div>
              ) : (
                <div style={{ width: "100px", height: "100px", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "9px", color: "#999" }}>QR Code</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Buyer Details */}
        <div style={{ display: "flex", marginBottom: "15px", border: "1px solid #ddd", borderRadius: "3px" }}>
          <div style={{ flex: 1, padding: "10px", borderRight: "1px solid #ddd" }}>
            <h4 style={{ margin: "0 0 5px 0", fontSize: "11px", color: "#666" }}>Bill To:</h4>
            <p style={{ margin: "2px 0", fontWeight: "bold" }}>{invoice.customer_name}</p>
            <p style={{ margin: "2px 0" }}>{invoice.customer_address || ""}</p>
            <p style={{ margin: "2px 0" }}>Phone: {invoice.customer_phone || "-"}</p>
            <p style={{ margin: "2px 0", fontWeight: "bold" }}>GSTIN: {invoice.customers?.gst_number || "-"}</p>
          </div>
          <div style={{ flex: 1, padding: "10px" }}>
            <h4 style={{ margin: "0 0 5px 0", fontSize: "11px", color: "#666" }}>Ship To:</h4>
            <p style={{ margin: "2px 0", fontWeight: "bold" }}>{invoice.customer_name}</p>
            <p style={{ margin: "2px 0" }}>{invoice.customer_address || "Same as billing address"}</p>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "center", fontSize: "10px" }}>Sr</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "left", fontSize: "10px" }}>Description</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "center", fontSize: "10px" }}>HSN</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "center", fontSize: "10px" }}>Size</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "center", fontSize: "10px" }}>Qty</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "right", fontSize: "10px" }}>Rate</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "right", fontSize: "10px" }}>Disc%</th>
              <th style={{ border: "1px solid #ddd", padding: "6px", textAlign: "right", fontSize: "10px" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.sale_items?.map((item, index) => (
              <tr key={index}>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "center", fontSize: "10px" }}>{index + 1}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", fontSize: "10px" }}>{item.product_name}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "center", fontSize: "10px" }}>{item.hsn_code || "-"}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "center", fontSize: "10px" }}>{item.size}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "center", fontSize: "10px" }}>{item.quantity}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "right", fontSize: "10px" }}>₹{item.unit_price.toFixed(2)}</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "right", fontSize: "10px" }}>{item.discount_percent}%</td>
                <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "right", fontSize: "10px" }}>₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
              <td colSpan={4} style={{ border: "1px solid #ddd", padding: "5px", textAlign: "right", fontSize: "10px" }}>Total:</td>
              <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "center", fontSize: "10px" }}>{totalQty}</td>
              <td colSpan={2} style={{ border: "1px solid #ddd", padding: "5px" }}></td>
              <td style={{ border: "1px solid #ddd", padding: "5px", textAlign: "right", fontSize: "10px" }}>₹{invoice.gross_amount?.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Summary Section */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "15px" }}>
          <div style={{ width: "250px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px" }}>
              <span>Gross Amount:</span>
              <span>₹{invoice.gross_amount?.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px", color: "#c00" }}>
                <span>Discount:</span>
                <span>-₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px" }}>
              <span>Taxable Value:</span>
              <span>₹{taxableValue.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px" }}>
              <span>CGST ({(gstRate / 2).toFixed(1)}%):</span>
              <span>₹{cgst.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px" }}>
              <span>SGST ({(gstRate / 2).toFixed(1)}%):</span>
              <span>₹{sgst.toFixed(2)}</span>
            </div>
            {(invoice.round_off ?? 0) !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "10px" }}>
                <span>Round Off:</span>
                <span>₹{(invoice.round_off ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "12px", fontWeight: "bold", borderTop: "2px solid #000", marginTop: "5px" }}>
              <span>Grand Total:</span>
              <span>₹{invoice.net_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Declaration */}
        <div style={{ borderTop: "1px solid #ddd", paddingTop: "10px", marginTop: "20px" }}>
          <p style={{ fontSize: "9px", color: "#666", margin: "3px 0" }}>
            <strong>Declaration:</strong> This is a computer-generated e-Invoice and does not require a physical signature.
          </p>
          <p style={{ fontSize: "9px", color: "#666", margin: "3px 0" }}>
            Certified that the particulars given above are true and correct.
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "20px", borderTop: "1px solid #ddd", paddingTop: "10px" }}>
          <p style={{ fontSize: "10px", color: "#666" }}>Thank you for your business!</p>
        </div>
      </div>
    );
  }
);

EInvoicePrint.displayName = "EInvoicePrint";
