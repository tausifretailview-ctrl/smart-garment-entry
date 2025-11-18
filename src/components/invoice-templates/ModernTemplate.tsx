import React from 'react';

interface ModernTemplateProps {
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

export const ModernTemplate: React.FC<ModernTemplateProps> = ({
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
      padding: '0',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      fontSize: '10pt',
      backgroundColor: '#f8f9fa',
      color: '#212529'
    }}>
      {/* Header with Gradient */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: '50px', marginBottom: '15px', filter: 'brightness(0) invert(1)' }} />
          )}
          <h1 style={{ margin: 0, fontSize: '26pt', fontWeight: '700' }}>{businessName}</h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '10pt', opacity: 0.9 }}>
            {businessAddress}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '9pt', opacity: 0.9 }}>
            {businessContact} | {businessEmail}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14pt', fontWeight: '300', marginBottom: '5px' }}>INVOICE</div>
          <div style={{ fontSize: '20pt', fontWeight: '700' }}>#{billNo}</div>
          <div style={{ fontSize: '9pt', marginTop: '5px', opacity: 0.9 }}>{date.toLocaleDateString('en-GB')}</div>
        </div>
      </div>

      <div style={{ padding: '30px', backgroundColor: 'white' }}>
        {/* Customer Info Card */}
        <div style={{ 
          marginBottom: '25px', 
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ fontSize: '9pt', color: '#6c757d', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Bill To</div>
          <div style={{ fontSize: '14pt', fontWeight: '600', marginBottom: '5px' }}>{customerName}</div>
          {customerPhone && <div style={{ fontSize: '10pt', color: '#6c757d' }}>{customerPhone}</div>}
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px', marginBottom: '20px' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Item</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Size</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Price</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Disc%</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '9pt', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} style={{ backgroundColor: '#f8f9fa' }}>
                <td style={{ padding: '15px 12px', borderRadius: '8px 0 0 8px' }}>{item.particulars}</td>
                <td style={{ padding: '15px 12px', textAlign: 'center' }}>{item.size}</td>
                <td style={{ padding: '15px 12px', textAlign: 'right' }}>{item.qty}</td>
                <td style={{ padding: '15px 12px', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                <td style={{ padding: '15px 12px', textAlign: 'right', color: '#dc3545' }}>{item.discPercent}%</td>
                <td style={{ padding: '15px 12px', textAlign: 'right', fontWeight: '600', borderRadius: '0 8px 8px 0' }}>₹{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary with Gradient Box */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
          <div style={{ width: '350px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e9ecef' }}>
              <span style={{ color: '#6c757d' }}>Subtotal</span>
              <span style={{ fontWeight: '500' }}>₹{subTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e9ecef' }}>
              <span style={{ color: '#6c757d' }}>Discount</span>
              <span style={{ fontWeight: '500', color: '#dc3545' }}>- ₹{discountAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '2px solid #dee2e6' }}>
              <span style={{ color: '#6c757d' }}>GST</span>
              <span style={{ fontWeight: '500' }}>₹{totalGST.toFixed(2)}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '18px 20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '8px',
              marginTop: '15px',
              fontSize: '14pt',
              fontWeight: '700'
            }}>
              <span>Total</span>
              <span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method Badge */}
        {paymentMethod && (
          <div style={{ 
            marginTop: '25px',
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#e7f3ff',
            color: '#0066cc',
            borderRadius: '20px',
            fontSize: '9pt',
            fontWeight: '600'
          }}>
            Payment: {paymentMethod}
          </div>
        )}

        {/* Terms */}
        {termsConditions && (
          <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', borderLeft: '4px solid #667eea' }}>
            <div style={{ fontSize: '10pt', fontWeight: '600', marginBottom: '10px', color: '#667eea' }}>Terms & Conditions</div>
            <p style={{ margin: 0, fontSize: '9pt', color: '#6c757d', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{termsConditions}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '20px 30px', textAlign: 'center', fontSize: '9pt', color: '#6c757d' }}>
        <p style={{ margin: 0 }}>Thank you for your business! We appreciate your trust.</p>
      </div>
    </div>
  );
};
