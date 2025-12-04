import React from 'react';

interface ModernTemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerMobile?: string;
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
    mrp?: number;
    discPercent?: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  totalTax: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  paymentMethod?: string;
  termsConditions?: string[];
  productDetailsSettings?: {
    show_brand?: boolean;
    show_category?: boolean;
    show_color?: boolean;
    show_style?: boolean;
    show_hsn_code?: boolean;
  };
}

export const ModernTemplate: React.FC<ModernTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerMobile,
  items,
  subtotal,
  discount,
  totalTax,
  grandTotal,
  totalSavings = 0,
  showMRP = false,
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
          <h1 style={{ margin: 0, fontSize: '28pt', fontWeight: 'bold' }}>{businessName}</h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '10pt', opacity: 0.9 }}>
            {address}<br />
            {mobile} {email && `| ${email}`}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '8px' }}>INVOICE</div>
          <div style={{ fontSize: '10pt', opacity: 0.9 }}>
            #{invoiceNumber}<br />
            {invoiceDate.toLocaleDateString('en-IN')}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ padding: '30px', backgroundColor: 'white', minHeight: '200mm' }}>
        {/* Customer Info Card */}
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f8f9fa', 
          border: '2px solid #e9ecef',
          borderRadius: '8px',
          marginBottom: '30px'
        }}>
          <div style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '10px', color: '#667eea' }}>BILL TO:</div>
          <div style={{ fontSize: '11pt' }}>
            <strong>{customerName}</strong><br />
            {customerMobile && <>Mobile: {customerMobile}</>}
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, marginBottom: '30px' }}>
          <thead>
            <tr style={{ backgroundColor: '#667eea', color: 'white' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderRadius: '8px 0 0 0' }}>SR</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>DESCRIPTION</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>SIZE</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>QTY</th>
              {showMRP && <th style={{ padding: '12px', textAlign: 'right' }}>MRP</th>}
              <th style={{ padding: '12px', textAlign: 'right' }}>RATE</th>
              <th style={{ padding: '12px', textAlign: 'right', borderRadius: '0 8px 0 0' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const productDetails = formatProductDetails(item);
              return (
                <tr key={index} style={{ 
                  backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                  borderBottom: '1px solid #dee2e6'
                }}>
                  <td style={{ padding: '12px' }}>{item.sr}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '500' }}>{item.particulars}</div>
                    {productDetails && (
                      <div style={{ fontSize: '8pt', color: '#6c757d', marginTop: '3px' }}>{productDetails}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{item.size}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{item.qty}</td>
                  {showMRP && (
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {item.mrp && item.mrp > item.rate ? (
                        <span style={{ textDecoration: 'line-through', color: '#999' }}>₹{item.mrp.toFixed(2)}</span>
                      ) : (
                        <span>₹{(item.mrp || item.rate).toFixed(2)}</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '12px', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500' }}>₹{item.total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Summary Section */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '30px' }}>
          <div style={{ width: '350px', border: '2px solid #e9ecef', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '12px', backgroundColor: '#f8f9fa', display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e9ecef' }}>
                <span>Discount:</span>
                <span style={{ color: '#dc3545' }}>- ₹{discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e9ecef' }}>
              <span>GST:</span>
              <span>₹{totalTax.toFixed(2)}</span>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#667eea', 
              color: 'white', 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '13pt',
              fontWeight: 'bold'
            }}>
              <span>TOTAL:</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
            {totalSavings > 0 && (
              <div style={{ 
                padding: '12px', 
                backgroundColor: '#d4edda', 
                color: '#155724', 
                display: 'flex', 
                justifyContent: 'space-between',
                fontWeight: 'bold',
                borderRadius: '0 0 8px 8px'
              }}>
                <span>You Saved:</span>
                <span>₹{totalSavings.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        {paymentMethod && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#e7f1ff', 
            border: '2px solid #667eea',
            borderRadius: '8px',
            marginBottom: '30px'
          }}>
            <strong>Payment Method:</strong> {paymentMethod.toUpperCase()}
          </div>
        )}

        {/* Terms */}
        {termsConditions && termsConditions.length > 0 && (
          <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '11pt', color: '#667eea' }}>Terms & Conditions:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '9pt', color: '#6c757d', lineHeight: '1.6' }}>
              {termsConditions.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        padding: '20px 30px', 
        textAlign: 'center', 
        backgroundColor: '#667eea', 
        color: 'white',
        fontSize: '10pt'
      }}>
        Thank you for your business!
      </div>
    </div>
  );
};
