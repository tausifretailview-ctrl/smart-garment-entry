import React, { useMemo, useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface BillItem {
  name: string;
  variant: string;
  barcode: string;
  quantity: number;
  price: number;
  total: number;
}

interface BillData {
  invoiceNo: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  organization: {
    name: string;
    address: string;
    phone: string;
    email?: string;
    upiId?: string;
    terms?: string;
    logo?: string;
  };
}

export const A5BillFormat = ({ data }: { data: BillData }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  const totalQty = useMemo(() => {
    return data.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [data.items]);

  // Generate QR code for UPI payment
  useEffect(() => {
    const generateQR = async () => {
      try {
        const upiString = `upi://pay?pa=${data.organization.upiId || data.organization.phone}&pn=${encodeURIComponent(data.organization.name)}&cu=INR`;
        const qrUrl = await QRCode.toDataURL(upiString, { 
          width: 80, 
          margin: 1,
          errorCorrectionLevel: 'M'
        });
        setQrCodeUrl(qrUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };
    generateQR();
  }, [data.organization]);

  return (
    <div className="a5-container">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .a5-container {
            width: 148mm;
            height: 210mm;
            position: absolute;
            top: 0;
            left: 0;
            padding: 8mm;
            box-sizing: border-box;
            background: white;
            border-right: 1px dashed #ddd; 
            border-bottom: 1px dashed #ddd;
          }
          
          body * { visibility: hidden; }
          .a5-container, .a5-container * { visibility: visible; }
        }

        .a5-container {
          width: 148mm;
          min-height: 210mm;
          margin: 20px auto;
          padding: 8mm;
          background: white;
          box-shadow: 0 2px 20px rgba(0,0,0,0.15);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          color: #1a1a1a;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .invoice-header { 
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 12px; 
          padding-bottom: 12px;
          border-bottom: 3px solid #2563eb;
          background: linear-gradient(to bottom, #f8fafc, white);
          padding: 12px;
          border-radius: 4px 4px 0 0;
        }
        
        .logo-section {
          width: 60px;
          flex-shrink: 0;
        }
        
        .logo-section img {
          width: 100%;
          height: auto;
          max-height: 60px;
          object-fit: contain;
        }
        
        .org-info {
          flex: 1;
          text-align: center;
        }
        
        .org-name { 
          font-size: 18pt; 
          font-weight: 800; 
          text-transform: uppercase; 
          line-height: 1.2; 
          color: #1e40af;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }
        
        .org-details { 
          font-size: 9pt; 
          color: #64748b; 
          margin: 2px 0;
          line-height: 1.4;
        }
        
        .invoice-label {
          width: 60px;
          text-align: right;
          font-size: 12pt;
          font-weight: 700;
          color: #1e40af;
          text-transform: uppercase;
        }

        .bill-info-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
          padding: 10px;
          background: #f8fafc;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }
        
        .info-box {
          padding: 8px;
          background: white;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }
        
        .info-title {
          font-size: 8pt;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
          margin-bottom: 5px;
        }
        
        .info-content {
          font-size: 10pt;
          color: #1e293b;
          font-weight: 600;
        }
        
        .info-sub {
          font-size: 9pt;
          color: #64748b;
          margin-top: 2px;
        }

        .items-table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 9pt; 
          margin-bottom: 12px;
          border: 2px solid #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .items-table thead th { 
          background: linear-gradient(to bottom, #2563eb, #1e40af);
          color: white;
          text-align: left; 
          padding: 8px 6px; 
          font-weight: 700;
          font-size: 9pt;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: none;
        }
        
        .items-table tbody td { 
          padding: 8px 6px; 
          vertical-align: top; 
          border-bottom: 1px solid #e2e8f0;
        }
        
        .items-table tbody tr:last-child td {
          border-bottom: none;
        }
        
        .items-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }
        
        .t-right { text-align: right; }
        .t-center { text-align: center; }

        .payment-terms-section {
          margin-bottom: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        
        .payment-box {
          padding: 10px;
          background: #ecfdf5;
          border: 2px solid #10b981;
          border-radius: 6px;
        }
        
        .payment-label {
          font-size: 8pt;
          color: #065f46;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .payment-value {
          font-size: 11pt;
          font-weight: 700;
          color: #047857;
          text-transform: uppercase;
        }
        
        .terms-box {
          padding: 10px;
          background: #fef3c7;
          border: 2px solid #f59e0b;
          border-radius: 6px;
        }
        
        .terms-label {
          font-size: 8pt;
          color: #92400e;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .terms-text {
          font-size: 8pt;
          color: #78350f;
          line-height: 1.3;
        }
        
        .summary-section { 
          margin-top: 15px; 
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 15px;
          align-items: start;
        }
        
        .qr-box { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center;
          text-align: center;
          padding: 12px;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 6px;
        }
        
        .qr-box img {
          width: 75px;
          height: 75px;
          margin-bottom: 5px;
        }
        
        .qr-label {
          font-size: 8pt;
          font-weight: 600;
          color: #2563eb;
          margin-top: 3px;
        }
        
        .qr-sub {
          font-size: 7pt;
          color: #64748b;
        }
        
        .totals-box {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }
        
        .total-row { 
          display: flex; 
          justify-content: space-between; 
          padding: 8px 12px;
          font-size: 10pt;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .total-row:last-child {
          border-bottom: none;
        }
        
        .total-row.qty-row {
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
        }
        
        .total-row.subtotal {
          font-weight: 500;
        }
        
        .total-row.discount {
          color: #dc2626;
          font-weight: 500;
        }
        
        .grand-total { 
          background: linear-gradient(to right, #2563eb, #1e40af);
          color: white;
          font-weight: 800; 
          font-size: 13pt;
          padding: 12px !important;
        }

        .terms-footer { 
          font-size: 7pt; 
          text-align: center; 
          margin-top: 15px; 
          padding-top: 10px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
          line-height: 1.4;
        }
        
        .item-name {
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 2px;
        }
        
        .item-details {
          font-size: 8pt;
          color: #64748b;
        }
      `}</style>

      {/* Professional Header with Logo */}
      <div className="invoice-header">
        <div className="logo-section">
          {data.organization.logo && (
            <img src={data.organization.logo} alt="Logo" />
          )}
        </div>
        <div className="org-info">
          <div className="org-name">{data.organization.name}</div>
          <div className="org-details">{data.organization.address}</div>
          <div className="org-details">Phone: {data.organization.phone}</div>
          {data.organization.email && <div className="org-details">Email: {data.organization.email}</div>}
        </div>
        <div className="invoice-label">
          Invoice
        </div>
      </div>

      {/* Bill & Customer Info Section */}
      <div className="bill-info-section">
        <div className="info-box">
          <div className="info-title">Invoice Details</div>
          <div className="info-content">{data.invoiceNo}</div>
          <div className="info-sub">{data.date}</div>
        </div>
        <div className="info-box">
          <div className="info-title">Bill To</div>
          <div className="info-content">{data.customerName}</div>
          {data.customerPhone && <div className="info-sub">{data.customerPhone}</div>}
        </div>
      </div>

      {/* Payment Method & Terms */}
      <div className="payment-terms-section">
        {data.paymentMethod && (
          <div className="payment-box">
            <div className="payment-label">Payment Method</div>
            <div className="payment-value">{data.paymentMethod}</div>
            
            {/* Payment Breakdown for Mix Payment */}
            {data.paymentMethod === 'Mix Payment' && (
              <div style={{ marginTop: '6px', fontSize: '8pt', lineHeight: '1.4' }}>
                {data.cashAmount && data.cashAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cash:</span>
                    <span style={{ fontWeight: 600 }}>₹{data.cashAmount.toFixed(2)}</span>
                  </div>
                )}
                {data.cardAmount && data.cardAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Card:</span>
                    <span style={{ fontWeight: 600 }}>₹{data.cardAmount.toFixed(2)}</span>
                  </div>
                )}
                {data.upiAmount && data.upiAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>UPI:</span>
                    <span style={{ fontWeight: 600 }}>₹{data.upiAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {data.organization.terms && (
          <div className="terms-box">
            <div className="terms-label">Terms & Conditions</div>
            <div className="terms-text">{data.organization.terms}</div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <table className="items-table">
        <thead>
          <tr>
            <th style={{width: '5%'}}>Sr</th>
            <th style={{width: '18%'}}>Barcode</th>
            <th style={{width: '33%'}}>Description</th>
            <th className="t-center" style={{width: '12%'}}>Qty</th>
            <th className="t-right" style={{width: '16%'}}>Price</th>
            <th className="t-right" style={{width: '16%'}}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={index}>
              <td className="t-center" style={{fontWeight: 600, color: '#64748b'}}>{index + 1}</td>
              <td style={{fontSize: '8pt', fontFamily: 'monospace', color: '#475569'}}>{item.barcode}</td>
              <td>
                <div className="item-name">{item.name}</div>
                <div className="item-details">{item.variant}</div>
              </td>
              <td className="t-center" style={{fontWeight: 600}}>{item.quantity}</td>
              <td className="t-right">₹{item.price.toFixed(2)}</td>
              <td className="t-right" style={{fontWeight: 600}}>₹{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Section */}
      <div className="summary-section">
        {/* QR Code */}
        <div className="qr-box">
          {qrCodeUrl ? (
            <>
              <img src={qrCodeUrl} alt="UPI QR Code" />
              <div className="qr-label">Scan to Pay</div>
              <div className="qr-sub">UPI Accepted</div>
            </>
          ) : (
            <div style={{padding: '20px', color: '#94a3b8'}}>
              <div style={{fontSize: '9pt'}}>Payment QR</div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="totals-box">
          <div className="total-row qty-row">
            <span>Total Items:</span>
            <strong>{totalQty} pcs</strong>
          </div>
          <div className="total-row subtotal">
            <span>Subtotal:</span>
            <span>₹{data.subtotal.toFixed(2)}</span>
          </div>
          {data.discount > 0 && (
            <div className="total-row discount">
              <span>Discount:</span>
              <span>- ₹{data.discount.toFixed(2)}</span>
            </div>
          )}
          {data.tax > 0 && (
            <div className="total-row">
              <span>Tax/GST:</span>
              <span>₹{data.tax.toFixed(2)}</span>
            </div>
          )}
          <div className="total-row grand-total">
            <span>Grand Total:</span>
            <span>₹{data.grandTotal.toFixed(2)}</span>
          </div>
          {data.paidAmount !== undefined && data.paidAmount < data.grandTotal && (
            <>
              <div className="total-row" style={{ fontWeight: 600, color: '#10b981' }}>
                <span>Paid:</span>
                <span>₹{data.paidAmount.toFixed(2)}</span>
              </div>
              <div className="total-row" style={{ fontWeight: 600, color: '#f59e0b' }}>
                <span>Balance:</span>
                <span>₹{(data.grandTotal - data.paidAmount).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer Note */}
      <div className="terms-footer">
        Thank you for your business! Visit again.
      </div>
    </div>
  );
};
