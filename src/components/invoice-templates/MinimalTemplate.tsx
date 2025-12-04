import React from 'react';

interface MinimalTemplateProps {
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

export const MinimalTemplate: React.FC<MinimalTemplateProps> = ({
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
        paddingBottom: '20px',
        borderBottom: '1px solid #000'
      }}>
        <div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: '40px', marginBottom: '10px' }} />
          )}
          <div style={{ fontSize: '16pt', fontWeight: 'bold', marginBottom: '5px' }}>{businessName}</div>
          <div style={{ fontSize: '9pt', color: '#555' }}>
            {address}<br />
            {mobile} {email && `| ${email}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24pt', fontWeight: 'bold' }}>INVOICE</div>
          <div style={{ fontSize: '9pt', marginTop: '10px' }}>
            <strong>No:</strong> {invoiceNumber}<br />
            <strong>Date:</strong> {invoiceDate.toLocaleDateString('en-IN')}
          </div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ marginTop: '20px', marginBottom: '30px' }}>
        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '5px' }}>TO:</div>
        <div style={{ fontSize: '10pt' }}>
          <strong>{customerName}</strong><br />
          {customerMobile && <>Phone: {customerMobile}</>}
        </div>
      </div>

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
        <thead>
          <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
            <th style={{ padding: '10px 0', textAlign: 'left', fontWeight: 'normal' }}>Description</th>
            <th style={{ padding: '10px 0', textAlign: 'center', width: '60px', fontWeight: 'normal' }}>Qty</th>
            {showMRP && <th style={{ padding: '10px 0', textAlign: 'right', width: '70px', fontWeight: 'normal' }}>MRP</th>}
            <th style={{ padding: '10px 0', textAlign: 'right', width: '80px', fontWeight: 'normal' }}>Rate</th>
            <th style={{ padding: '10px 0', textAlign: 'right', width: '100px', fontWeight: 'normal' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const productDetails = formatProductDetails(item);
            return (
              <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px 0' }}>
                  <div>{item.particulars} {item.size && `(${item.size})`}</div>
                  {productDetails && (
                    <div style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>{productDetails}</div>
                  )}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.qty}</td>
                {showMRP && (
                  <td style={{ padding: '10px 0', textAlign: 'right' }}>
                    {item.mrp && item.mrp > item.rate ? (
                      <span style={{ textDecoration: 'line-through', color: '#999' }}>₹{item.mrp.toFixed(2)}</span>
                    ) : (
                      <span>₹{(item.mrp || item.rate).toFixed(2)}</span>
                    )}
                  </td>
                )}
                <td style={{ padding: '10px 0', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                <td style={{ padding: '10px 0', textAlign: 'right' }}>₹{item.total.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
        <div style={{ width: '250px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>Discount</span>
              <span>-₹{discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span>Tax</span>
            <span>₹{totalTax.toFixed(2)}</span>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '10px 0', 
            borderTop: '2px solid #000',
            marginTop: '10px',
            fontSize: '12pt',
            fontWeight: 'bold'
          }}>
            <span>Total</span>
            <span>₹{grandTotal.toFixed(2)}</span>
          </div>
          {totalSavings > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '6px 0', 
              color: '#155724',
              fontWeight: 'bold'
            }}>
              <span>You Saved</span>
              <span>₹{totalSavings.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment */}
      {paymentMethod && (
        <div style={{ marginBottom: '30px', fontSize: '9pt' }}>
          <strong>Payment:</strong> {paymentMethod}
        </div>
      )}

      {/* Terms */}
      {termsConditions && termsConditions.length > 0 && (
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
          <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '8px' }}>Terms & Conditions:</div>
          <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '8pt', color: '#555', lineHeight: '1.5' }}>
            {termsConditions.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        position: 'absolute',
        bottom: '20mm',
        left: '20mm',
        right: '20mm',
        textAlign: 'center',
        fontSize: '8pt',
        color: '#999'
      }}>
        Thank you for your business
      </div>
    </div>
  );
};
