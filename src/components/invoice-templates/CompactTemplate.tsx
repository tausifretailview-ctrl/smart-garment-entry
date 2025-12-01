import React from 'react';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface CompactTemplateProps {
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
  customerMobile?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paymentMethod?: string;
  qrCodeUrl?: string;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export const CompactTemplate: React.FC<CompactTemplateProps> = ({
  businessName,
  address,
  mobile,
  gstNumber,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerMobile,
  items,
  subtotal,
  discount,
  grandTotal,
  paymentMethod,
  qrCodeUrl,
  format = 'a5-vertical',
  customHeaderText,
  customFooterText,
  logoPlacement = 'left',
  fontFamily = 'inter',
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  };

  const width = format === 'a4' ? '210mm' : format === 'a5-horizontal' ? '210mm' : '148mm';
  const minHeight = format === 'a4' ? '297mm' : format === 'a5-horizontal' ? '148mm' : '210mm';

  const fontFamilyMap: Record<string, string> = {
    inter: "'Inter', sans-serif",
    roboto: "'Roboto', sans-serif",
    montserrat: "'Montserrat', sans-serif",
    opensans: "'Open Sans', sans-serif",
    poppins: "'Poppins', sans-serif",
    raleway: "'Raleway', sans-serif",
    playfair: "'Playfair Display', serif",
    merriweather: "'Merriweather', serif",
    lora: "'Lora', serif",
  };

  const logoAlign = logoPlacement === 'center' ? 'center' : logoPlacement === 'right' ? 'right' : 'left';

  return (
    <div style={{
      width,
      minHeight,
      maxHeight: minHeight,
      margin: '0 auto',
      padding: '8mm',
      backgroundColor: 'white',
      fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.inter,
      fontSize: '10px',
      color: '#000',
      overflow: 'hidden'
    }}>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
          {customHeaderText}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: logoAlign, marginBottom: '8px', borderBottom: '2px solid #000', paddingBottom: '6px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>{businessName}</div>
        <div style={{ fontSize: '9px', lineHeight: '1.3' }}>{address}</div>
        <div style={{ fontSize: '9px' }}>Ph: {mobile} {gstNumber && `| GSTIN: ${gstNumber}`}</div>
      </div>

      {/* Invoice Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '9px' }}>
        <div>
          <strong>Bill No:</strong> {invoiceNumber}<br/>
          <strong>Customer:</strong> {customerName}
          {customerMobile && <><br/><strong>Mobile:</strong> {customerMobile}</>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
          {invoiceTime && <><strong>Time:</strong> {invoiceTime}</>}
        </div>
      </div>

      {/* Items Table - Compact */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '9px' }}>
        <thead>
          <tr style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '3px 2px' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '3px 2px', width: '35px' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '3px 2px', width: '50px' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '3px 2px', width: '55px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} style={{ borderBottom: index === items.length - 1 ? '1px solid #000' : '1px dotted #ccc' }}>
              <td style={{ padding: '3px 2px' }}>
                {item.particulars}
                {item.size && ` (${item.size})`}
              </td>
              <td style={{ textAlign: 'center', padding: '3px 2px' }}>{item.qty}</td>
              <td style={{ textAlign: 'right', padding: '3px 2px' }}>{formatCurrency(item.rate)}</td>
              <td style={{ textAlign: 'right', padding: '3px 2px', fontWeight: 'bold' }}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginBottom: '8px', fontSize: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Subtotal:</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Discount:</span>
            <span>- {formatCurrency(discount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '4px', marginTop: '4px', fontWeight: 'bold', fontSize: '12px' }}>
          <span>TOTAL:</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      {/* Payment Method */}
      {paymentMethod && (
        <div style={{ marginBottom: '8px', fontSize: '9px', textAlign: 'center' }}>
          <strong>Payment Mode:</strong> {paymentMethod.toUpperCase()}
        </div>
      )}

      {/* QR Code */}
      {qrCodeUrl && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px' }} />
          <div style={{ fontSize: '8px', marginTop: '4px' }}>Scan to Pay</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '9px', borderTop: '1px solid #000', paddingTop: '6px' }}>
        {customFooterText ? (
          <div style={{ fontWeight: 'bold' }}>{customFooterText}</div>
        ) : (
          <div style={{ fontWeight: 'bold' }}>Thank You! Visit Again</div>
        )}
      </div>
    </div>
  );
};
