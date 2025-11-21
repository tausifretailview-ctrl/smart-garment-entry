import React from 'react';

interface ClassicTemplateProps {
  businessName: string;
  businessAddress: string;
  businessContact: string;
  businessEmail: string;
  logoUrl?: string;
  billNo: string;
  date: Date;
  customerName: string;
  customerPhone: string;
  items: Array<{
    sr: number;
    particulars: string;
    brand?: string;
    category?: string;
    color?: string;
    style?: string;
    size: string;
    qty: number;
    rate: number;
    discPercent: number;
    total: number;
  }>;
  subTotal: number;
  discountAmount: number;
  totalGST: number;
  netAmount: number;
  paymentMethod?: string;
  termsConditions?: string;
  productDetailsSettings?: {
    show_brand?: boolean;
    show_category?: boolean;
    show_color?: boolean;
    show_style?: boolean;
    show_hsn_code?: boolean;
  };
}

export const ClassicTemplate: React.FC<ClassicTemplateProps> = ({
  businessName,
  businessAddress,
  businessContact,
  businessEmail,
  logoUrl,
  billNo,
  date,
  customerName,
  customerPhone,
  items,
  subTotal,
  discountAmount,
  totalGST,
  netAmount,
  paymentMethod,
  termsConditions,
  productDetailsSettings,
}) => {
  const formatProductDetails = (item: any) => {
    const details: string[] = [];
    if (productDetailsSettings?.show_brand && item.brand) details.push(item.brand);
    if (productDetailsSettings?.show_category && item.category) details.push(item.category);
    if (productDetailsSettings?.show_color && item.color) details.push(item.color);
    if (productDetailsSettings?.show_style && item.style) details.push(item.style);
    return details.length > 0 ? details.join(' | ') : '';
  };
  return (
    <div style={{
      width: '210mm',
      minHeight: '297mm',
      margin: '0 auto',
      padding: '15mm',
      fontFamily: 'Georgia, serif',
      fontSize: '11pt',
      backgroundColor: 'white',
      color: '#333'
    }}>
      {/* Header */}
      <div style={{ 
        borderBottom: '3px solid #2c3e50', 
        paddingBottom: '10px', 
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1 }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: '60px', marginBottom: '10px' }} />
          )}
          <h1 style={{ margin: 0, fontSize: '24pt', color: '#2c3e50' }}>{businessName}</h1>
          <p style={{ margin: '5px 0', fontSize: '10pt', color: '#666' }}>
            {businessAddress}<br />
            {businessContact} | {businessEmail}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ margin: 0, fontSize: '18pt', color: '#2c3e50' }}>INVOICE</h2>
          <p style={{ margin: '5px 0', fontSize: '10pt' }}>
            <strong>Invoice #:</strong> {billNo}<br />
            <strong>Date:</strong> {date.toLocaleDateString('en-GB')}
          </p>
        </div>
      </div>

      {/* Customer Info */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '12pt', color: '#2c3e50' }}>Bill To:</h3>
        <p style={{ margin: 0 }}>
          <strong>{customerName}</strong><br />
          {customerPhone && `Phone: ${customerPhone}`}
        </p>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Sr.</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Description</th>
            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #2c3e50' }}>Size</th>
            <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #2c3e50' }}>Qty</th>
            <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #2c3e50' }}>Rate</th>
            <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #2c3e50' }}>Disc%</th>
            <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #2c3e50' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const productDetails = formatProductDetails(item);
            return (
              <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '10px' }}>{item.sr}</td>
                <td style={{ padding: '10px' }}>
                  <div>{item.particulars}</div>
                  {productDetails && (
                    <div style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>{productDetails}</div>
                  )}
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>{item.size}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{item.qty}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{item.discPercent}%</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>₹{item.total.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <div style={{ width: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
            <span>Subtotal:</span>
            <span>₹{subTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
            <span>Discount:</span>
            <span>- ₹{discountAmount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
            <span>GST:</span>
            <span>₹{totalGST.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#2c3e50', color: 'white', fontWeight: 'bold' }}>
            <span>Total Amount:</span>
            <span>₹{netAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      {paymentMethod && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#e9ecef', borderLeft: '4px solid #2c3e50' }}>
          <strong>Payment Method:</strong> {paymentMethod}
        </div>
      )}

      {/* Terms */}
      {termsConditions && (
        <div style={{ marginTop: '30px', borderTop: '1px solid #dee2e6', paddingTop: '15px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '11pt' }}>Terms & Conditions:</h4>
          <p style={{ margin: 0, fontSize: '9pt', color: '#666', whiteSpace: 'pre-wrap' }}>{termsConditions}</p>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '9pt', color: '#999' }}>
        <p style={{ margin: 0 }}>Thank you for your business!</p>
      </div>
    </div>
  );
};
