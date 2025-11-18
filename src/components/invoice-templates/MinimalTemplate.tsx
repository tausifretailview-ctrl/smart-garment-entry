import React from 'react';

interface MinimalTemplateProps {
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
}

export const MinimalTemplate: React.FC<MinimalTemplateProps> = ({
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
}) => {
  return (
    <div style={{
      width: '210mm',
      minHeight: '297mm',
      margin: '0 auto',
      padding: '20mm',
      fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
      fontSize: '10pt',
      backgroundColor: 'white',
      color: '#000'
    }}>
      {/* Minimal Header */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '40px',
        paddingBottom: '20px',
        borderBottom: '1px solid #000'
      }}>
        <div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: '40px', marginBottom: '15px' }} />
          )}
          <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: '300', letterSpacing: '1px' }}>{businessName}</h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '9pt', lineHeight: '1.5', color: '#666' }}>
            {businessAddress}<br />
            {businessContact}<br />
            {businessEmail}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10pt', color: '#666', marginBottom: '8px' }}>INVOICE</div>
          <div style={{ fontSize: '18pt', fontWeight: '300', marginBottom: '8px' }}>{billNo}</div>
          <div style={{ fontSize: '9pt', color: '#666' }}>{date.toLocaleDateString('en-GB')}</div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '8pt', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Billed To</div>
        <div style={{ fontSize: '11pt', fontWeight: '400' }}>{customerName}</div>
        {customerPhone && <div style={{ fontSize: '9pt', color: '#666', marginTop: '4px' }}>{customerPhone}</div>}
      </div>

      {/* Items - Minimal Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ padding: '10px 0', textAlign: 'left', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Description</th>
            <th style={{ padding: '10px 0', textAlign: 'center', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Size</th>
            <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Qty</th>
            <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Rate</th>
            <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Disc</th>
            <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', fontWeight: '400' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px 0', fontSize: '10pt' }}>{item.particulars}</td>
              <td style={{ padding: '12px 0', textAlign: 'center', fontSize: '9pt', color: '#666' }}>{item.size}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontSize: '9pt' }}>{item.qty}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontSize: '9pt' }}>₹{item.rate.toFixed(2)}</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontSize: '9pt', color: '#999' }}>{item.discPercent}%</td>
              <td style={{ padding: '12px 0', textAlign: 'right', fontSize: '10pt', fontWeight: '400' }}>₹{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary - Clean and Minimal */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
        <div style={{ width: '280px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '9pt' }}>
            <span style={{ color: '#666' }}>Subtotal</span>
            <span>₹{subTotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '9pt' }}>
              <span style={{ color: '#666' }}>Discount</span>
              <span style={{ color: '#999' }}>- ₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          {totalGST > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '9pt' }}>
              <span style={{ color: '#666' }}>GST</span>
              <span>₹{totalGST.toFixed(2)}</span>
            </div>
          )}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '15px 0',
            marginTop: '10px',
            borderTop: '2px solid #000',
            fontSize: '13pt',
            fontWeight: '400'
          }}>
            <span>Total</span>
            <span>₹{netAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment */}
      {paymentMethod && (
        <div style={{ marginBottom: '30px', fontSize: '9pt' }}>
          <span style={{ color: '#666' }}>Payment Method: </span>
          <span style={{ fontWeight: '500' }}>{paymentMethod}</span>
        </div>
      )}

      {/* Terms - Minimal */}
      {termsConditions && (
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', marginBottom: '10px' }}>Terms & Conditions</div>
          <p style={{ margin: 0, fontSize: '9pt', color: '#666', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{termsConditions}</p>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '60px', textAlign: 'center', fontSize: '8pt', color: '#999' }}>
        <p style={{ margin: 0 }}>Thank you</p>
      </div>
    </div>
  );
};
