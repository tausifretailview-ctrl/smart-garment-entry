import React from 'react';
import '../styles/professional-invoice.css';

interface QuotationItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  qty: number;
  rate: number;
  mrp: number;
  discountPercent: number;
  total: number;
}

interface QuotationPrintProps {
  // Business Details
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  
  // Quotation Details
  quotationNumber: string;
  quotationDate: Date;
  validUntil?: Date;
  
  // Customer Details
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerEmail?: string;
  customerGSTIN?: string;
  
  // Items
  items: QuotationItem[];
  
  // Amounts
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  roundOff: number;
  netAmount: number;
  
  // Optional
  termsConditions?: string;
  notes?: string;
  showHSN?: boolean;
  showBarcode?: boolean;
  taxType?: string;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
}

export const QuotationPrint = React.forwardRef<HTMLDivElement, QuotationPrintProps>(
  (props, ref) => {
    const {
      businessName,
      address,
      mobile,
      email,
      gstNumber,
      logoUrl,
      quotationNumber,
      quotationDate,
      validUntil,
      customerName,
      customerAddress,
      customerMobile,
      customerEmail,
      customerGSTIN,
      items,
      grossAmount,
      discountAmount,
      taxableAmount,
      gstAmount,
      roundOff,
      netAmount,
      termsConditions,
      notes,
      showHSN = true,
      showBarcode = true,
      taxType = 'exclusive',
      format = 'a5-vertical',
      colorScheme = 'blue'
    } = props;

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount: number) => {
      return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const totalQuantity = items.reduce((sum, item) => sum + item.qty, 0);

    const colorSchemes: Record<string, { primary: string; secondary: string; accent: string }> = {
      blue: { primary: '#1e40af', secondary: '#3b82f6', accent: '#dbeafe' },
      green: { primary: '#15803d', secondary: '#22c55e', accent: '#dcfce7' },
      purple: { primary: '#7e22ce', secondary: '#a855f7', accent: '#f3e8ff' },
      red: { primary: '#b91c1c', secondary: '#ef4444', accent: '#fee2e2' },
      orange: { primary: '#c2410c', secondary: '#f97316', accent: '#ffedd5' },
    };

    const colors = colorSchemes[colorScheme] || colorSchemes.blue;
    
    const isA4 = format === 'a4';
    const isHorizontal = format === 'a5-horizontal';

    return (
      <div 
        ref={ref}
        className={`professional-invoice-template format-${format}`}
        style={{
          width: isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm',
          minHeight: isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm',
          padding: isA4 ? '15mm' : isHorizontal ? '8mm' : '5mm',
          fontFamily: 'Arial, sans-serif',
          fontSize: isA4 ? '11pt' : isHorizontal ? '9pt' : '8pt',
          backgroundColor: 'white',
          color: 'black',
          boxSizing: 'border-box'
        }}
      >
        {/* Header Section */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isA4 ? '15px' : '10px',
          marginBottom: isA4 ? '15px' : '10px',
          paddingBottom: isA4 ? '12px' : '8px',
          borderBottom: `3px solid ${colors.primary}`
        }}>
          {logoUrl && (
            <div style={{ flexShrink: 0 }}>
              <img src={logoUrl} alt="Logo" style={{
                width: isA4 ? '70px' : isHorizontal ? '60px' : '50px',
                height: isA4 ? '70px' : isHorizontal ? '60px' : '50px',
                objectFit: 'contain'
              }} />
            </div>
          )}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <h1 style={{
              fontSize: isA4 ? '20pt' : isHorizontal ? '16pt' : '14pt',
              fontWeight: 'bold',
              margin: '0 0 4px 0',
              color: colors.primary,
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              {businessName}
            </h1>
            <p style={{ fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt', margin: '2px 0', lineHeight: 1.4 }}>
              {address}
            </p>
            <p style={{ fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt', margin: '2px 0' }}>
              <strong>Phone:</strong> {mobile} {email && `| Email: ${email}`}
            </p>
            {gstNumber && (
              <p style={{ fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt', margin: '2px 0', fontWeight: 'bold' }}>
                <strong>GSTIN:</strong> {gstNumber}
              </p>
            )}
          </div>
        </div>

        {/* Quotation Title */}
        <div style={{
          textAlign: 'center',
          backgroundColor: colors.accent,
          padding: isA4 ? '8px' : '6px',
          marginBottom: isA4 ? '12px' : '8px',
          border: `1px solid ${colors.primary}`
        }}>
          <h2 style={{
            fontSize: isA4 ? '14pt' : isHorizontal ? '12pt' : '11pt',
            margin: 0,
            color: colors.primary,
            fontWeight: 'bold',
            letterSpacing: '0.5px'
          }}>
            QUOTATION
          </h2>
        </div>

        {/* Info Section */}
        <div style={{
          display: 'flex',
          border: `1px solid ${colors.primary}`,
          marginBottom: isA4 ? '12px' : '8px',
          fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7.5pt'
        }}>
          {/* Customer Details */}
          <div style={{
            flex: 1,
            borderRight: `1px solid ${colors.primary}`,
            padding: isA4 ? '10px' : isHorizontal ? '8px' : '6px'
          }}>
            <h3 style={{
              fontSize: isA4 ? '11pt' : isHorizontal ? '10pt' : '9pt',
              margin: '0 0 6px 0',
              color: colors.primary,
              fontWeight: 'bold'
            }}>
              To:
            </h3>
            <p style={{ margin: '3px 0', fontWeight: 'bold' }}>{customerName}</p>
            {customerAddress && <p style={{ margin: '2px 0', lineHeight: 1.3 }}>{customerAddress}</p>}
            {customerMobile && <p style={{ margin: '2px 0' }}><strong>Phone:</strong> {customerMobile}</p>}
            {customerEmail && <p style={{ margin: '2px 0' }}><strong>Email:</strong> {customerEmail}</p>}
            {customerGSTIN && <p style={{ margin: '2px 0' }}><strong>GSTIN:</strong> {customerGSTIN}</p>}
          </div>
          
          {/* Quotation Details */}
          <div style={{
            width: isHorizontal ? '35%' : '40%',
            padding: isA4 ? '10px' : isHorizontal ? '8px' : '6px'
          }}>
            <p style={{ margin: '3px 0' }}>
              <strong>Quotation No:</strong><br />
              <span style={{ color: colors.primary, fontWeight: 'bold' }}>{quotationNumber}</span>
            </p>
            <p style={{ margin: '3px 0' }}>
              <strong>Date:</strong> {formatDate(quotationDate)}
            </p>
            {validUntil && (
              <p style={{ margin: '3px 0' }}>
                <strong>Valid Until:</strong> {formatDate(validUntil)}
              </p>
            )}
            <p style={{ margin: '3px 0' }}>
              <strong>Tax Type:</strong> {taxType === 'inclusive' ? 'Inclusive' : 'Exclusive'}
            </p>
          </div>
        </div>

        {/* Items Table */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: isA4 ? '12px' : '8px',
          fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7.5pt',
          border: `1px solid ${colors.primary}`
        }}>
          <thead>
            <tr style={{ backgroundColor: colors.primary, color: 'white' }}>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>Sr.</th>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
              {showHSN && <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>HSN</th>}
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>Size</th>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>Qty</th>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>MRP</th>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>Rate</th>
              <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '6px 4px' : '4px 3px', fontWeight: 'bold' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr}>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'center' }}>{item.sr}</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'left' }}>
                  {item.particulars}
                  {showBarcode && item.barcode && (
                    <div style={{ fontSize: isA4 ? '8pt' : '7pt', color: colors.primary, marginTop: '2px' }}>
                      [{item.barcode}]
                    </div>
                  )}
                </td>
                {showHSN && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'center' }}>{item.hsn}</td>}
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'center' }}>{item.size}</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'center' }}>{item.qty}</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'right' }}>{formatCurrency(item.mrp)}</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'right' }}>{formatCurrency(item.rate)}</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
              </tr>
            ))}
            {/* Empty rows */}
            {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', height: isA4 ? '20px' : '16px' }}>&nbsp;</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
                {showHSN && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>}
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
                <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
              </tr>
            ))}
            {/* Total quantity row */}
            <tr style={{ backgroundColor: colors.accent, fontWeight: 'bold' }}>
              <td colSpan={showHSN ? 4 : 3} style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'right' }}>Total Quantity:</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px', textAlign: 'center' }}>{totalQuantity}</td>
              <td colSpan={3} style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px' : '3px 2px' }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>

        {/* Summary Section */}
        <div style={{
          display: 'flex',
          border: `1px solid ${colors.primary}`,
          marginBottom: isA4 ? '12px' : '8px',
          fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7.5pt'
        }}>
          {/* Left side - Notes */}
          <div style={{
            flex: 1,
            borderRight: `1px solid ${colors.primary}`,
            padding: isA4 ? '10px' : isHorizontal ? '8px' : '6px'
          }}>
            {notes && (
              <div>
                <h4 style={{ margin: '0 0 6px 0', color: colors.primary, fontSize: isA4 ? '10pt' : '8pt' }}>Notes:</h4>
                <p style={{ margin: '2px 0', whiteSpace: 'pre-line' }}>{notes}</p>
              </div>
            )}
            <div style={{ marginTop: notes ? '10px' : '0' }}>
              <p style={{ margin: '2px 0', fontStyle: 'italic', color: '#666' }}>
                This quotation is valid until {validUntil ? formatDate(validUntil) : 'the date mentioned above'}.
              </p>
            </div>
          </div>
          
          {/* Right side - Totals */}
          <div style={{
            width: isHorizontal ? '35%' : '40%',
            padding: isA4 ? '10px' : isHorizontal ? '8px' : '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
              <span>Gross Amount:</span>
              <span>{formatCurrency(grossAmount)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Discount:</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
              <span>Taxable Amount:</span>
              <span>{formatCurrency(taxableAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
              <span>GST:</span>
              <span>{formatCurrency(gstAmount)}</span>
            </div>
            {roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Round Off:</span>
                <span>{roundOff >= 0 ? '+' : ''}{formatCurrency(roundOff)}</span>
              </div>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              margin: '8px 0 0 0',
              paddingTop: '6px',
              borderTop: `2px solid ${colors.primary}`,
              fontWeight: 'bold',
              fontSize: isA4 ? '11pt' : isHorizontal ? '10pt' : '9pt',
              color: colors.primary
            }}>
              <span>Net Amount:</span>
              <span>{formatCurrency(netAmount)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {termsConditions && (
          <div style={{
            border: `1px solid ${colors.primary}`,
            padding: isA4 ? '10px' : '6px',
            marginBottom: isA4 ? '12px' : '8px',
            fontSize: isA4 ? '8pt' : '7pt'
          }}>
            <h4 style={{ margin: '0 0 6px 0', color: colors.primary }}>Terms & Conditions:</h4>
            <p style={{ margin: 0, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{termsConditions}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: 'auto',
          paddingTop: isA4 ? '15px' : '10px'
        }}>
          <div style={{ fontSize: isA4 ? '9pt' : '7pt' }}>
            <p style={{ margin: '2px 0' }}>Thank you for your inquiry!</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: `1px solid ${colors.primary}`, paddingTop: '4px', minWidth: '120px' }}>
              <p style={{ margin: 0, fontSize: isA4 ? '9pt' : '7pt', fontWeight: 'bold' }}>Authorised Signatory</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

QuotationPrint.displayName = 'QuotationPrint';
