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
  organization: {
    name: string;
    address: string;
    phone: string;
    email?: string;
    upiId?: string;
    terms?: string;
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
            padding: 10mm;
            box-sizing: border-box;
            background: white;
            border-right: 1px dashed #eee; 
            border-bottom: 1px dashed #eee;
          }
          
          body * { visibility: hidden; }
          .a5-container, .a5-container * { visibility: visible; }
        }

        .a5-container {
          width: 148mm;
          min-height: 210mm;
          margin: 20px auto;
          padding: 10mm;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          font-family: 'Inter', sans-serif;
          color: black;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .org-name { font-size: 18pt; font-weight: 800; text-transform: uppercase; line-height: 1.2; }
        .org-details { font-size: 9pt; color: #444; margin-top: 2px; }

        .bill-meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 9pt; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .meta-col { display: flex; flex-direction: column; gap: 3px; }
        .label { font-weight: 600; color: #666; margin-right: 4px; }

        table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: auto; }
        thead th { 
          border-top: 2px solid #000; 
          border-bottom: 2px solid #000; 
          text-align: left; 
          padding: 6px 4px; 
          font-weight: 700;
        }
        tbody td { 
          border-bottom: 1px dotted #ccc; 
          padding: 6px 4px; 
          vertical-align: top; 
        }
        .t-right { text-align: right; }
        .t-center { text-align: center; }

        .footer { 
          margin-top: 20px; 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-end; 
          border-top: 2px solid #000; 
          padding-top: 10px; 
        }
        
        .totals { width: 60%; font-size: 10pt; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .grand-total { font-weight: 800; font-size: 14pt; margin-top: 5px; padding-top: 5px; border-top: 1px solid #000; }

        .qr-section { 
          width: 35%; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          text-align: center;
        }
        .qr-section img {
          width: 80px;
          height: 80px;
        }
        .terms { font-size: 7pt; text-align: center; margin-top: 20px; color: #666; }
      `}</style>

      {/* Header */}
      <div className="header">
        <div className="org-name">{data.organization.name}</div>
        <div className="org-details">{data.organization.address}</div>
        <div className="org-details">Phone: {data.organization.phone}</div>
      </div>

      {/* Customer & Bill Info */}
      <div className="bill-meta">
        <div className="meta-col">
          <div><span className="label">Bill No:</span>{data.invoiceNo}</div>
          <div><span className="label">Date:</span>{data.date}</div>
        </div>
        <div className="meta-col t-right">
          <div><span className="label">Customer:</span>{data.customerName}</div>
          {data.customerPhone && <div>{data.customerPhone}</div>}
        </div>
      </div>

      {/* Items Table */}
      <table>
        <thead>
          <tr>
            <th style={{width: '20%'}}>Barcode</th>
            <th style={{width: '35%'}}>Item</th>
            <th className="t-center" style={{width: '10%'}}>Qty</th>
            <th className="t-right" style={{width: '15%'}}>Price</th>
            <th className="t-right" style={{width: '20%'}}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={index}>
              <td style={{fontSize: '8pt', fontFamily: 'monospace'}}>{item.barcode}</td>
              <td>
                <div style={{fontWeight: 500}}>{item.name}</div>
                <div style={{fontSize: '8pt', color: '#666'}}>{item.variant}</div>
              </td>
              <td className="t-center">{item.quantity}</td>
              <td className="t-right">{item.price.toFixed(2)}</td>
              <td className="t-right">{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer: Totals & QR */}
      <div className="footer">
        <div className="totals">
          <div className="total-row" style={{borderBottom: '1px dashed #ccc', paddingBottom: '5px'}}>
             <span>Total Quantity:</span>
             <strong>{totalQty}</strong>
          </div>
          <div className="total-row">
            <span>Subtotal:</span>
            <span>₹{data.subtotal.toFixed(2)}</span>
          </div>
          {data.discount > 0 && (
            <div className="total-row" style={{color: 'red'}}>
              <span>Discount:</span>
              <span>-₹{data.discount.toFixed(2)}</span>
            </div>
          )}
          <div className="total-row grand-total">
            <span>Grand Total:</span>
            <span>₹{data.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="qr-section">
          {qrCodeUrl && (
            <>
              <img src={qrCodeUrl} alt="UPI QR Code" />
              <span style={{fontSize: '8pt', marginTop: '5px', fontWeight: 600}}>Scan to Pay</span>
              <span style={{fontSize: '7pt', color: '#555'}}>UPI Accepted</span>
            </>
          )}
        </div>
      </div>

      <div className="terms">
        {data.organization.terms || "Thanks for visiting! Goods once sold will not be taken back."}
      </div>
    </div>
  );
};
