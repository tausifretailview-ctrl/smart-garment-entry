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
  mrp?: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface TaxInvoiceTemplateProps {
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
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  paymentMethod?: string;
  declarationText?: string;
  termsConditions?: string[];
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
  };
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export const TaxInvoiceTemplate: React.FC<TaxInvoiceTemplateProps> = ({
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
  cgstAmount = 0,
  sgstAmount = 0,
  igstAmount = 0,
  totalTax,
  roundOff,
  grandTotal,
  totalSavings = 0,
  showMRP = false,
  paymentMethod,
  declarationText,
  termsConditions,
  bankDetails,
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
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      padding: '10mm',
      backgroundColor: 'white',
      fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.inter,
      fontSize: '9px',
      color: '#000',
      border: '2px solid #000',
      overflow: 'hidden'
    }}>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '10px', fontWeight: 'bold', color: '#333' }}>
          {customHeaderText}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: logoAlign, borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>TAX INVOICE</div>
        {logoUrl && (
          <img src={logoUrl} alt="Logo" style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '4px' }} />
        )}
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '3px' }}>{businessName}</div>
        <div style={{ fontSize: '9px', lineHeight: '1.4' }}>
          {address}<br/>
          Phone: {mobile} {email && `| Email: ${email}`}<br/>
          <strong>GSTIN: {gstNumber || 'N/A'}</strong>
        </div>
      </div>

      {/* Invoice Details & Customer Info */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', border: '1px solid #000' }}>
        <div style={{ flex: 1, padding: '6px', borderRight: '1px solid #000' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px', textDecoration: 'underline' }}>Invoice Details:</div>
          <div style={{ lineHeight: '1.5' }}>
            <strong>Invoice No:</strong> {invoiceNumber}<br/>
            <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
            {invoiceTime && <><strong>Time:</strong> {invoiceTime}<br/></>}
            {paymentMethod && <><strong>Payment:</strong> {paymentMethod.toUpperCase()}</>}
          </div>
        </div>
        <div style={{ flex: 1, padding: '6px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px', textDecoration: 'underline' }}>Bill To:</div>
          <div style={{ lineHeight: '1.5' }}>
            <strong>{customerName}</strong><br/>
            {customerAddress && <>{customerAddress}<br/></>}
            {customerMobile && <>Phone: {customerMobile}<br/></>}
            {customerGSTIN && <><strong>GSTIN:</strong> {customerGSTIN}</>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '8px', border: '1px solid #000' }}>
        <thead>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ textAlign: 'center', padding: '4px', border: '1px solid #000', width: '25px' }}>Sr</th>
            <th style={{ textAlign: 'left', padding: '4px', border: '1px solid #000' }}>Description</th>
            <th style={{ textAlign: 'center', padding: '4px', border: '1px solid #000', width: '40px' }}>HSN</th>
            <th style={{ textAlign: 'center', padding: '4px', border: '1px solid #000', width: '30px' }}>Qty</th>
            {showMRP && <th style={{ textAlign: 'right', padding: '4px', border: '1px solid #000', width: '45px' }}>MRP</th>}
            <th style={{ textAlign: 'right', padding: '4px', border: '1px solid #000', width: '50px' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '4px', border: '1px solid #000', width: '60px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td style={{ textAlign: 'center', padding: '4px', border: '1px solid #000' }}>{item.sr}</td>
              <td style={{ padding: '4px', border: '1px solid #000' }}>
                {item.particulars} {item.size && `(${item.size})`}
              </td>
              <td style={{ textAlign: 'center', padding: '4px', border: '1px solid #000' }}>{item.hsn}</td>
              <td style={{ textAlign: 'center', padding: '4px', border: '1px solid #000' }}>{item.qty}</td>
              {showMRP && (
                <td style={{ textAlign: 'right', padding: '4px', border: '1px solid #000' }}>
                  {item.mrp && item.mrp > item.rate ? (
                    <span style={{ textDecoration: 'line-through', color: '#999' }}>{formatCurrency(item.mrp)}</span>
                  ) : (
                    <span>{formatCurrency(item.mrp || item.rate)}</span>
                  )}
                </td>
              )}
              <td style={{ textAlign: 'right', padding: '4px', border: '1px solid #000' }}>{formatCurrency(item.rate)}</td>
              <td style={{ textAlign: 'right', padding: '4px', border: '1px solid #000', fontWeight: 'bold' }}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tax Breakdown & Totals */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        {/* Tax Calculation Box */}
        <div style={{ flex: 1, border: '1px solid #000', padding: '6px', fontSize: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', textAlign: 'center', textDecoration: 'underline' }}>TAX CALCULATION</div>
          <table style={{ width: '100%', fontSize: '8px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', padding: '2px' }}>Tax Type</th>
                <th style={{ textAlign: 'right', padding: '2px' }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '2px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {cgstAmount > 0 && (
                <tr>
                  <td style={{ padding: '2px' }}>CGST</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>9%</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>{formatCurrency(cgstAmount)}</td>
                </tr>
              )}
              {sgstAmount > 0 && (
                <tr>
                  <td style={{ padding: '2px' }}>SGST</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>9%</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>{formatCurrency(sgstAmount)}</td>
                </tr>
              )}
              {igstAmount > 0 && (
                <tr>
                  <td style={{ padding: '2px' }}>IGST</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>18%</td>
                  <td style={{ textAlign: 'right', padding: '2px' }}>{formatCurrency(igstAmount)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '1px solid #000', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ padding: '2px' }}>Total Tax</td>
                <td style={{ textAlign: 'right', padding: '2px' }}>{formatCurrency(totalTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount Summary */}
        <div style={{ width: '45%', border: '1px solid #000', padding: '6px', fontSize: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>Discount:</span>
              <span>- {formatCurrency(discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Taxable Amount:</span>
            <span>{formatCurrency(taxableAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Total Tax:</span>
            <span>{formatCurrency(totalTax)}</span>
          </div>
          {roundOff !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>Round Off:</span>
              <span>{formatCurrency(roundOff)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '2px solid #000', marginTop: '4px', fontWeight: 'bold', fontSize: '11px' }}>
            <span>GRAND TOTAL:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
          {totalSavings > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#155724', fontWeight: 'bold', fontSize: '9px' }}>
              <span>You Saved:</span>
              <span>{formatCurrency(totalSavings)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bank Details */}
      {bankDetails && (
        <div style={{ border: '1px solid #000', padding: '6px', marginBottom: '8px', fontSize: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Bank Details:</div>
          <div style={{ lineHeight: '1.4' }}>
            {bankDetails.bankName && <>Bank: {bankDetails.bankName}<br/></>}
            {bankDetails.accountNumber && <>A/c No: {bankDetails.accountNumber}<br/></>}
            {bankDetails.ifscCode && <>IFSC: {bankDetails.ifscCode}<br/></>}
            {bankDetails.accountHolder && <>A/c Holder: {bankDetails.accountHolder}</>}
          </div>
        </div>
      )}

      {/* Declaration & Terms */}
      <div style={{ fontSize: '8px', marginBottom: '8px' }}>
        {declarationText && (
          <div style={{ marginBottom: '6px', fontStyle: 'italic' }}>
            <strong>Declaration:</strong> {declarationText}
          </div>
        )}
        {termsConditions && termsConditions.length > 0 && (
          <div>
            <strong>Terms & Conditions:</strong>
            <ul style={{ margin: '2px 0', paddingLeft: '15px', lineHeight: '1.4' }}>
              {termsConditions.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '6px', fontSize: '9px' }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>For {businessName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginTop: '15px', borderTop: '1px solid #000', paddingTop: '2px' }}>Authorized Signatory</div>
        </div>
      </div>

      {/* Footer Note */}
      <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '7px', fontStyle: 'italic', color: '#666' }}>
        {customFooterText || 'This is a computer-generated invoice and does not require a physical signature'}
      </div>
    </div>
  );
};
