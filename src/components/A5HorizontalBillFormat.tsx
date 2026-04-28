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
  creditAmount?: number;
  paidAmount?: number;
  refundCash?: number;
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

export const A5HorizontalBillFormat = ({ data }: { data: BillData }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  const totalQty = useMemo(() => {
    return data.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [data.items]);

  useEffect(() => {
    const generateQR = async () => {
      try {
        const upiString = `upi://pay?pa=${data.organization.upiId || data.organization.phone}&pn=${encodeURIComponent(data.organization.name)}&cu=INR`;
        const qrUrl = await QRCode.toDataURL(upiString, { 
          width: 200, 
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
    <div className="a5h-container">
      <style>{`
        @media print {
          @page {
            size: A5 landscape;
            margin: 3mm;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .a5h-container {
            width: 210mm;
            height: 148mm;
            max-height: 148mm;
            position: absolute;
            top: 0;
            left: 0;
            padding: 3mm;
            box-sizing: border-box;
            background: white;
            overflow: hidden;
            page-break-inside: avoid;
            page-break-after: avoid;
          }
          body * { visibility: hidden; }
          .a5h-container, .a5h-container * { visibility: visible; }
        }

        .a5h-container {
          width: 210mm;
          height: 148mm;
          max-height: 148mm;
          margin: 20px auto;
          padding: 3mm;
          background: white;
          box-shadow: 0 2px 20px rgba(0,0,0,0.15);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          color: #1a1a1a;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        .a5h-header { 
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3px; 
          padding: 4px 8px;
          border-bottom: 2px solid #2563eb;
          background: linear-gradient(to right, #f8fafc, white);
          border-radius: 3px 3px 0 0;
          flex-shrink: 0;
        }
        
        .a5h-logo {
          width: 35px;
          flex-shrink: 0;
        }
        
        .a5h-logo img {
          width: 100%;
          height: auto;
          max-height: 35px;
          object-fit: contain;
        }
        
        .a5h-org-info {
          flex: 1;
          text-align: center;
        }
        
        .a5h-org-name { 
          font-size: 12pt; 
          font-weight: 800; 
          text-transform: uppercase; 
          line-height: 1.1; 
          color: #1e40af;
          letter-spacing: 0.5px;
        }
        
        .a5h-org-details { 
          font-size: 7pt; 
          color: #64748b; 
          line-height: 1.2;
        }
        
        .a5h-invoice-label {
          text-align: right;
          font-size: 9pt;
          font-weight: 700;
          color: #1e40af;
          text-transform: uppercase;
        }

        .a5h-info-row {
          display: flex;
          gap: 6px;
          margin-bottom: 3px;
          flex-shrink: 0;
        }
        
        .a5h-info-box {
          padding: 3px 6px;
          background: #f8fafc;
          border-radius: 2px;
          border: 1px solid #e2e8f0;
        }
        
        .a5h-info-box.invoice-box {
          flex: 0 0 auto;
          min-width: 80px;
        }
        
        .a5h-info-box.date-box {
          flex: 0 0 auto;
          min-width: 70px;
        }
        
        .a5h-info-box.customer-box {
          flex: 1;
          max-width: 150px;
        }
        
        .a5h-info-box.phone-box {
          flex: 0 0 auto;
          min-width: 80px;
        }
        
        .a5h-info-title {
          font-size: 6pt;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 600;
        }
        
        .a5h-info-value {
          font-size: 8pt;
          color: #1e293b;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .a5h-main-content {
          display: flex;
          gap: 6px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .a5h-items-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow: hidden;
        }

        .a5h-items-table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 7pt;
          border: 1px solid #e2e8f0;
          border-radius: 2px;
          overflow: hidden;
        }
        
        .a5h-items-table thead th { 
          background: linear-gradient(to bottom, #2563eb, #1e40af);
          color: white;
          text-align: left; 
          padding: 3px 3px; 
          font-weight: 600;
          font-size: 7pt;
          text-transform: uppercase;
          border: none;
        }
        
        .a5h-items-table tbody td { 
          padding: 2px 3px; 
          vertical-align: middle; 
          border-bottom: 1px solid #e2e8f0;
        }
        
        .a5h-items-table tbody tr:last-child td {
          border-bottom: none;
        }
        
        .a5h-items-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }

        .a5h-summary-section {
          width: 140px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .a5h-payment-qr-box {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px;
          background: #ecfdf5;
          border: 1px solid #10b981;
          border-radius: 3px;
        }
        
        .a5h-payment-info {
          flex: 1;
        }
        
        .a5h-payment-label {
          font-size: 6pt;
          color: #065f46;
          text-transform: uppercase;
          font-weight: 600;
        }
        
        .a5h-payment-value {
          font-size: 8pt;
          font-weight: 700;
          color: #047857;
          text-transform: uppercase;
        }
        
        .a5h-qr-small {
          width: 80px;
          height: 80px;
          flex-shrink: 0;
        }
        
        .a5h-qr-small img {
          width: 100%;
          height: 100%;
        }

        .a5h-totals-box {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
          flex: 1;
        }
        
        .a5h-total-row { 
          display: flex; 
          justify-content: space-between; 
          padding: 2px 5px;
          font-size: 7pt;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .a5h-total-row:last-child {
          border-bottom: none;
        }
        
        .a5h-total-row.qty-row {
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
        }
        
        .a5h-total-row.discount {
          color: #dc2626;
        }
        
        .a5h-grand-total { 
          background: linear-gradient(to right, #2563eb, #1e40af);
          color: white;
          font-weight: 700; 
          font-size: 9pt;
          padding: 4px 5px !important;
        }

        .a5h-footer { 
          font-size: 6pt; 
          text-align: center; 
          padding-top: 2px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
          margin-top: auto;
          flex-shrink: 0;
        }
        
        .t-right { text-align: right; }
        .t-center { text-align: center; }
      `}</style>

      {/* Header */}
      <div className="a5h-header">
        <div className="a5h-logo">
          {data.organization.logo && (
            <img src={data.organization.logo} alt="Logo" />
          )}
        </div>
        <div className="a5h-org-info">
          <div className="a5h-org-name">{data.organization.name}</div>
          <div className="a5h-org-details">
            {data.organization.address} | Phone: {data.organization.phone}
          </div>
        </div>
        <div className="a5h-invoice-label">
          Invoice
        </div>
      </div>

      {/* Info Row - Compact */}
      <div className="a5h-info-row">
        <div className="a5h-info-box invoice-box">
          <div className="a5h-info-title">Invoice No</div>
          <div className="a5h-info-value">{data.invoiceNo}</div>
        </div>
        <div className="a5h-info-box date-box">
          <div className="a5h-info-title">Date</div>
          <div className="a5h-info-value">{data.date}</div>
        </div>
        <div className="a5h-info-box customer-box">
          <div className="a5h-info-title">Bill To</div>
          <div className="a5h-info-value">{data.customerName}</div>
        </div>
        {data.customerPhone && (
          <div className="a5h-info-box phone-box">
            <div className="a5h-info-title">Phone</div>
            <div className="a5h-info-value">{data.customerPhone}</div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="a5h-main-content">
        {/* Items Table */}
        <div className="a5h-items-section">
          <table className="a5h-items-table">
            <thead>
              <tr>
                <th style={{width: '5%'}}>#</th>
                <th style={{width: '15%'}}>Barcode</th>
                <th style={{width: '40%'}}>Description</th>
                <th className="t-center" style={{width: '10%'}}>Qty</th>
                <th className="t-right" style={{width: '15%'}}>Price</th>
                <th className="t-right" style={{width: '15%'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index}>
                  <td className="t-center" style={{fontWeight: 600, color: '#64748b'}}>{index + 1}</td>
                  <td style={{fontSize: '6pt', fontFamily: 'monospace', color: '#475569'}}>{item.barcode}</td>
                  <td>
                    <span style={{fontWeight: 600}}>{item.name}</span>
                    <span style={{fontSize: '6pt', color: '#64748b', marginLeft: '3px'}}>{item.variant}</span>
                  </td>
                  <td className="t-center" style={{fontWeight: 600}}>{item.quantity}</td>
                  <td className="t-right">₹{item.price.toFixed(2)}</td>
                  <td className="t-right" style={{fontWeight: 600}}>₹{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Section */}
        <div className="a5h-summary-section">
          {/* Payment Method with QR Code */}
          <div className="a5h-payment-qr-box">
            <div className="a5h-payment-info">
              <div className="a5h-payment-label">Payment Mode</div>
              <div className="a5h-payment-value">{data.paymentMethod || 'Cash'}</div>
              
              {/* Payment Breakdown for Mix Payment */}
              {data.paymentMethod === 'Mix Payment' && (
                <div style={{ marginTop: '4px', fontSize: '6pt', lineHeight: '1.3' }}>
                  {data.cashAmount && data.cashAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                      <span>Cash:</span>
                      <span style={{ fontWeight: 600 }}>₹{data.cashAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {data.cardAmount && data.cardAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                      <span>Card:</span>
                      <span style={{ fontWeight: 600 }}>₹{data.cardAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {data.upiAmount && data.upiAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                      <span>UPI:</span>
                      <span style={{ fontWeight: 600 }}>₹{data.upiAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {data.creditAmount && data.creditAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                      <span>Credit:</span>
                      <span style={{ fontWeight: 600 }}>₹{data.creditAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              {data.refundCash && data.refundCash > 0 && (
                <div style={{ marginTop: '4px', fontSize: '6pt', lineHeight: '1.3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', color: '#b45309' }}>
                    <span>Refund to Customer:</span>
                    <span style={{ fontWeight: 700 }}>₹{data.refundCash.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
            {qrCodeUrl && (
              <div className="a5h-qr-small">
                <img src={qrCodeUrl} alt="UPI QR" />
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="a5h-totals-box">
            <div className="a5h-total-row qty-row">
              <span>Items:</span>
              <strong>{totalQty} pcs</strong>
            </div>
            <div className="a5h-total-row">
              <span>Subtotal:</span>
              <span>₹{data.subtotal.toFixed(2)}</span>
            </div>
            {data.discount > 0 && (
              <div className="a5h-total-row discount">
                <span>Discount:</span>
                <span>- ₹{data.discount.toFixed(2)}</span>
              </div>
            )}
            {data.tax > 0 && (
              <div className="a5h-total-row">
                <span>Tax:</span>
                <span>₹{data.tax.toFixed(2)}</span>
              </div>
            )}
            <div className="a5h-total-row a5h-grand-total">
              <span>Total:</span>
              <span>₹{data.grandTotal.toFixed(2)}</span>
            </div>
            {data.paidAmount !== undefined && data.paidAmount < data.grandTotal && (
              <>
                <div className="a5h-total-row" style={{ fontWeight: 600, color: '#10b981' }}>
                  <span>Paid:</span>
                  <span>₹{data.paidAmount.toFixed(2)}</span>
                </div>
                <div className="a5h-total-row" style={{ fontWeight: 600, color: '#f59e0b' }}>
                  <span>Balance:</span>
                  <span>₹{(data.grandTotal - data.paidAmount).toFixed(2)}</span>
                </div>
              </>
            )}
            {data.refundCash !== undefined && data.refundCash > 0 && (
              <div className="a5h-total-row" style={{ fontWeight: 700, color: '#b45309' }}>
                <span>Refund to Customer:</span>
                <span>₹{data.refundCash.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer - Compact */}
      <div className="a5h-footer">
        {data.organization.terms || 'Thank you for your business!'}
      </div>
    </div>
  );
};
