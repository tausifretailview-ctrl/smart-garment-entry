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

interface DetailedTemplateProps {
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
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  totalTax: number;
  grandTotal: number;
  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  qrCodeUrl?: string;
  declarationText?: string;
  termsConditions?: string[];
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export const DetailedTemplate: React.FC<DetailedTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  items,
  subtotal,
  discount,
  taxableAmount,
  totalTax,
  grandTotal,
  paymentMethod,
  amountPaid,
  balanceDue,
  qrCodeUrl,
  declarationText,
  termsConditions,
  format = 'a5-vertical',
  colorScheme = 'blue',
  customHeaderText,
  customFooterText,
  logoPlacement = 'left',
  fontFamily = 'inter',
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const width = format === 'a4' ? '210mm' : format === 'a5-horizontal' ? '210mm' : '148mm';
  const minHeight = format === 'a4' ? '297mm' : format === 'a5-horizontal' ? '148mm' : '210mm';

  const colorMap: Record<string, string> = {
    blue: '#1e40af',
    green: '#15803d',
    purple: '#7c3aed',
    red: '#dc2626',
    orange: '#ea580c'
  };

  const primaryColor = colorMap[colorScheme] || colorMap.blue;

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

  const logoAlign = logoPlacement === 'center' ? 'center' : logoPlacement === 'right' ? 'flex-end' : 'flex-start';

  return (
    <div style={{
      width,
      minHeight,
      maxHeight: minHeight,
      margin: '0 auto',
      padding: '10mm',
      backgroundColor: 'white',
      fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.inter,
      fontSize: '10px',
      color: '#000',
      overflow: 'hidden'
    }}>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '11px', fontWeight: 'bold', color: primaryColor }}>
          {customHeaderText}
        </div>
      )}

      {/* Header with Logo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: `3px solid ${primaryColor}`, paddingBottom: '8px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: logoAlign }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '6px' }} />
          )}
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: primaryColor, marginBottom: '3px', textAlign: logoPlacement }}>{businessName}</div>
          <div style={{ fontSize: '9px', lineHeight: '1.4', maxWidth: '80%', textAlign: logoPlacement }}>
            {address}<br/>
            Mobile: {mobile} {email && `| Email: ${email}`}<br/>
            {gstNumber && `GSTIN: ${gstNumber}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: primaryColor }}>INVOICE</div>
          <div style={{ fontSize: '10px', marginTop: '4px' }}>
            <strong>No:</strong> {invoiceNumber}<br/>
            <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
            {invoiceTime && <><strong>Time:</strong> {invoiceTime}</>}
          </div>
        </div>
      </div>

      {/* Bill To Section */}
      <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: primaryColor }}>BILL TO:</div>
        <div style={{ fontSize: '10px', lineHeight: '1.5' }}>
          <strong>{customerName}</strong><br/>
          {customerAddress && <>{customerAddress}<br/></>}
          {customerMobile && <>Mobile: {customerMobile}<br/></>}
          {customerGSTIN && <>GSTIN: {customerGSTIN}</>}
        </div>
      </div>

      {/* Detailed Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '9px' }}>
        <thead>
          <tr style={{ backgroundColor: primaryColor, color: 'white' }}>
            <th style={{ textAlign: 'left', padding: '5px 4px', border: '1px solid #ddd' }}>Sr</th>
            <th style={{ textAlign: 'left', padding: '5px 4px', border: '1px solid #ddd' }}>Product Details</th>
            <th style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>Size</th>
            <th style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>Barcode</th>
            <th style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>HSN</th>
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa' }}>
              <td style={{ padding: '5px 4px', border: '1px solid #ddd' }}>{item.sr}</td>
              <td style={{ padding: '5px 4px', border: '1px solid #ddd' }}>
                <div style={{ fontWeight: 'bold' }}>{item.particulars}</div>
                <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
                  {item.brand && `Brand: ${item.brand}`}
                  {item.category && ` | Category: ${item.category}`}
                  {item.color && ` | Color: ${item.color}`}
                  {item.style && ` | Style: ${item.style}`}
                </div>
              </td>
              <td style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>{item.size}</td>
              <td style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd', fontSize: '8px' }}>{item.barcode}</td>
              <td style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>{item.hsn}</td>
              <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>{item.qty}</td>
              <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>{formatCurrency(item.rate)}</td>
              <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Section */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <div style={{ width: '45%', fontSize: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #dee2e6' }}>
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #dee2e6', color: '#dc2626' }}>
              <span>Discount:</span>
              <span>- {formatCurrency(discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #dee2e6' }}>
            <span>Taxable Amount:</span>
            <span>{formatCurrency(taxableAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #dee2e6' }}>
            <span>Tax (GST):</span>
            <span>{formatCurrency(totalTax)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: primaryColor, color: 'white', fontWeight: 'bold', fontSize: '11px' }}>
            <span>GRAND TOTAL:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      {paymentMethod && (
        <div style={{ marginBottom: '10px', padding: '6px 8px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', fontSize: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><strong>Payment Mode:</strong> {paymentMethod.toUpperCase()}</span>
            {amountPaid !== undefined && <span><strong>Amount Paid:</strong> {formatCurrency(amountPaid)}</span>}
            {balanceDue !== undefined && balanceDue > 0 && <span style={{ color: '#dc2626' }}><strong>Balance Due:</strong> {formatCurrency(balanceDue)}</span>}
          </div>
        </div>
      )}

      {/* Terms & Declaration */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', fontSize: '8px' }}>
        <div style={{ flex: 1 }}>
          {termsConditions && termsConditions.length > 0 && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Terms & Conditions:</div>
              <ul style={{ margin: 0, paddingLeft: '15px', lineHeight: '1.4' }}>
                {termsConditions.map((term, index) => (
                  <li key={index}>{term}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        {qrCodeUrl && (
          <div style={{ textAlign: 'center' }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '70px', height: '70px' }} />
            <div style={{ fontSize: '7px', marginTop: '2px' }}>Scan to Pay</div>
          </div>
        )}
      </div>

      {declarationText && (
        <div style={{ fontSize: '8px', fontStyle: 'italic', marginBottom: '8px', color: '#666' }}>
          {declarationText}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `2px solid ${primaryColor}`, paddingTop: '8px', fontSize: '9px' }}>
        <div>
          {customFooterText ? (
            <div style={{ fontWeight: 'bold' }}>{customFooterText}</div>
          ) : (
            <div style={{ fontWeight: 'bold' }}>Thank You for Your Business!</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold' }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};
