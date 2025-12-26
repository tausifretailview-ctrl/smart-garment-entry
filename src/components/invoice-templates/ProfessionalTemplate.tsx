import React from 'react';
import '../../styles/professional-invoice.css';

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

interface ProfessionalTemplateProps {
  // Business Details
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  
  // Invoice Details
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceTime?: string;
  
  // Customer Details
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  salesman?: string;
  
  // Items
  items: InvoiceItem[];
  
  // Amounts
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  
  // Payment
  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  
  // Optional
  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolder?: string;
  };
  declarationText?: string;
  termsConditions?: string[];
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  totalSavings?: number; // MRP - Sale Price savings
  amountWithGrouping?: boolean;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
}

export const ProfessionalTemplate: React.FC<ProfessionalTemplateProps> = ({
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
  salesman,
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
  paymentMethod,
  amountPaid,
  balanceDue,
  cashAmount,
  cardAmount,
  upiAmount,
  qrCodeUrl,
  upiId,
  bankDetails,
  declarationText,
  termsConditions,
  showHSN = true,
  showBarcode = true,
  showGSTBreakdown = true,
  showBankDetails = false,
  showMRP = false,
  minItemRows = 12,
  showTotalQuantity = true,
  amountWithDecimal = true,
  showReceivedAmount = false,
  showBalanceAmount = false,
  showPartyBalance = false,
  showTaxDetails = true,
  showYouSaved = false,
  totalSavings = 0,
  amountWithGrouping = true,
  format = 'a5-vertical',
  colorScheme = 'blue'
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    if (!amountWithDecimal) {
      if (amountWithGrouping) {
        return `₹${Math.round(amount).toLocaleString('en-IN')}`;
      }
      return `₹${Math.round(amount)}`;
    }
    if (amountWithGrouping) {
      return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₹${amount.toFixed(2)}`;
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
      className={`professional-invoice-template format-${format}`}
      style={{
        width: isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm',
        maxHeight: isA4 ? '277mm' : isHorizontal ? '138mm' : '200mm',
        height: 'auto',
        padding: isA4 ? '5mm' : isHorizontal ? '4mm' : '3mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: isA4 ? '10pt' : isHorizontal ? '8pt' : '7pt',
        backgroundColor: 'white',
        color: 'black',
        boxSizing: 'border-box',
        overflow: 'hidden',
        pageBreakInside: 'avoid'
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
              width: isA4 ? '85px' : isHorizontal ? '70px' : '60px',
              height: isA4 ? '85px' : isHorizontal ? '70px' : '60px',
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
          <p style={{
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            margin: '2px 0',
            lineHeight: 1.4
          }}>
            {address}
          </p>
          <p style={{
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            margin: '2px 0'
          }}>
            <strong>Phone:</strong> {mobile} {email && `| Email: ${email}`}
          </p>
          {gstNumber && (
            <p style={{
              fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
              margin: '2px 0',
              fontWeight: 'bold'
            }}>
              <strong>GSTIN:</strong> {gstNumber}
            </p>
          )}
        </div>
      </div>

      {/* Invoice Title */}
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
          {gstNumber ? 'TAX INVOICE' : 'INVOICE'}
        </h2>
      </div>

      {/* Bill Information Section */}
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
            Bill To:
          </h3>
          <p style={{ margin: '3px 0', fontWeight: 'bold' }}>{customerName}</p>
          {customerAddress && <p style={{ margin: '2px 0', lineHeight: 1.3 }}>{customerAddress}</p>}
          {customerMobile && <p style={{ margin: '2px 0' }}><strong>Phone:</strong> {customerMobile}</p>}
          {customerGSTIN && <p style={{ margin: '2px 0' }}><strong>GSTIN:</strong> {customerGSTIN}</p>}
          {salesman && <p style={{ margin: '2px 0' }}><strong>Salesman:</strong> {salesman}</p>}
        </div>
        
        {/* Invoice Details */}
        <div style={{
          width: isHorizontal ? '35%' : '40%',
          padding: isA4 ? '10px' : isHorizontal ? '8px' : '6px'
        }}>
          <p style={{ margin: '3px 0' }}>
            <strong>Invoice No:</strong><br />
            <span style={{ color: colors.primary, fontWeight: 'bold' }}>{invoiceNumber}</span>
          </p>
          <p style={{ margin: '3px 0' }}>
            <strong>Date:</strong> {formatDate(invoiceDate)}{invoiceTime && `, ${invoiceTime}`}
          </p>
        </div>
      </div>

      {/* Items Table */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: isA4 ? '8px' : '4px',
        fontSize: isA4 ? '9pt' : isHorizontal ? '7.5pt' : '7pt',
        border: `1px solid ${colors.primary}`
      }}>
        <thead>
          <tr style={{ backgroundColor: colors.primary, color: 'white' }}>
            <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold', width: '25px' }}>Sr.</th>
            <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
            {showBarcode && <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold' }}>Barcode</th>}
            {showHSN && <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold' }}>HSN</th>}
            <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold', width: '30px' }}>Qty</th>
            {showMRP && <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold' }}>MRP</th>}
            <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold' }}>Rate</th>
            <th style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '4px 2px' : '2px 1px', fontWeight: 'bold' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sr}>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.sr}</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'left' }}>
                {item.particulars}
              </td>
              {showBarcode && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center', fontSize: isA4 ? '8pt' : '6.5pt' }}>{item.barcode}</td>}
              {showHSN && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.hsn}</td>}
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.qty}</td>
              {showMRP && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'right' }}>{formatCurrency(item.sp)}</td>}
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'right' }}>{formatCurrency(item.rate)}</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
            </tr>
          ))}
          {/* Add empty rows to fill up to 5 minimum rows */}
          {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, index) => (
            <tr key={`empty-${index}`}>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center', height: isA4 ? '18px' : '14px' }}>&nbsp;</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>
              {showBarcode && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>}
              {showHSN && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>}
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>
              {showMRP && <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>}
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>
            </tr>
          ))}
          {/* Total quantity row */}
          {showTotalQuantity && (
            <tr style={{ backgroundColor: colors.accent, fontWeight: 'bold' }}>
              <td colSpan={showBarcode ? (showHSN ? 4 : 3) : (showHSN ? 3 : 2)} style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'right' }}>Total Quantity:</td>
              <td style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{totalQuantity}</td>
              <td colSpan={showMRP ? 3 : 2} style={{ border: `1px solid ${colors.primary}`, padding: isA4 ? '2px' : '1px' }}>&nbsp;</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Summary Section */}
      <div style={{
        display: 'flex',
        border: `1px solid ${colors.primary}`,
        marginBottom: isA4 ? '8px' : '4px',
        fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '7pt'
      }}>
        {/* Left side - GST Breakdown or Declaration */}
        <div style={{
          flex: 1,
          borderRight: `1px solid ${colors.primary}`,
          padding: isA4 ? '6px' : isHorizontal ? '4px' : '3px'
        }}>
          {showGSTBreakdown && (cgstAmount > 0 || sgstAmount > 0 || igstAmount > 0) && (
            <div>
              <h4 style={{ margin: '0 0 6px 0', color: colors.primary, fontSize: isA4 ? '10pt' : '8pt' }}>Tax Breakdown:</h4>
              {cgstAmount > 0 && (
                <>
                  <p style={{ margin: '2px 0' }}>CGST: {formatCurrency(cgstAmount)}</p>
                  <p style={{ margin: '2px 0' }}>SGST: {formatCurrency(sgstAmount)}</p>
                </>
              )}
              {igstAmount > 0 && (
                <p style={{ margin: '2px 0' }}>IGST: {formatCurrency(igstAmount)}</p>
              )}
            </div>
          )}
          {paymentMethod && (
            <div style={{ margin: '6px 0 0 0' }}>
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>Payment Mode:</strong> {paymentMethod}
              </p>
              
              {/* Payment Breakdown for Mix Payment */}
              {paymentMethod === 'Mix Payment' && (
                <div style={{ marginTop: '6px', fontSize: isA4 ? '8pt' : '7pt', lineHeight: 1.4 }}>
                  {cashAmount && cashAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                      <span>Cash Amount:</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(cashAmount)}</span>
                    </div>
                  )}
                  {cardAmount && cardAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                      <span>Card Amount:</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(cardAmount)}</span>
                    </div>
                  )}
                  {upiAmount && upiAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                      <span>UPI Amount:</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(upiAmount)}</span>
                    </div>
                  )}
                  {amountPaid && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0 2px', paddingTop: '4px', borderTop: '1px solid #e2e8f0', fontWeight: 700, color: colors.primary }}>
                      <span>Total Paid:</span>
                      <span>{formatCurrency(amountPaid)}</span>
                    </div>
                  )}
                  {balanceDue && balanceDue > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0', fontWeight: 600, color: '#f59e0b' }}>
                      <span>Balance:</span>
                      <span>{formatCurrency(balanceDue)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Right side - Totals */}
        <div style={{
          width: isHorizontal ? '35%' : '40%',
          padding: isA4 ? '6px' : isHorizontal ? '4px' : '3px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
              <span>Discount:</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
          )}
          {showTaxDetails && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Taxable Amount:</span>
                <span>{formatCurrency(taxableAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                <span>Total Tax:</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
            </>
          )}
          {roundOff !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
              <span>Round Off:</span>
              <span>{formatCurrency(roundOff)}</span>
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: `2px solid ${colors.primary}`,
            fontWeight: 'bold',
            fontSize: isA4 ? '11pt' : isHorizontal ? '10pt' : '9pt',
            color: colors.primary
          }}>
            <span>Grand Total:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
          {showReceivedAmount && amountPaid !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', fontSize: isA4 ? '9pt' : '8pt' }}>
              <span>Received Amount:</span>
              <span>{formatCurrency(amountPaid)}</span>
            </div>
          )}
          {showBalanceAmount && balanceDue !== undefined && balanceDue > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', fontSize: isA4 ? '9pt' : '8pt', color: '#b91c1c', fontWeight: 'bold' }}>
              <span>Balance Amount:</span>
              <span>{formatCurrency(balanceDue)}</span>
            </div>
          )}
          {showYouSaved && (discount > 0 || totalSavings > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', fontSize: isA4 ? '9pt' : '8pt', color: '#15803d', fontWeight: 'bold' }}>
              <span>You Saved:</span>
              <span>{formatCurrency(discount + totalSavings)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Section */}
      <div style={{
        display: 'flex',
        border: `1px solid ${colors.primary}`,
        fontSize: isA4 ? '7pt' : '6pt',
        pageBreakInside: 'avoid'
      }}>
        {/* Left side - Declaration & Terms */}
        <div style={{
          flex: 1,
          borderRight: `1px solid ${colors.primary}`,
          padding: isA4 ? '6px' : isHorizontal ? '5px' : '4px'
        }}>
          {declarationText && (
            <div style={{ marginBottom: '3px' }}>
              <p style={{ margin: '0', fontStyle: 'italic', lineHeight: 1.2, fontSize: isA4 ? '6pt' : '5pt' }}>{declarationText}</p>
            </div>
          )}
          {termsConditions && termsConditions.length > 0 && (
            <div>
              <strong style={{ fontSize: isA4 ? '8pt' : '7pt' }}>Terms & Conditions:</strong>
              <ol style={{ margin: '2px 0', paddingLeft: '12px', lineHeight: 1.3 }}>
                {termsConditions.map((term, index) => (
                  <li key={index} style={{ marginBottom: '1px', fontSize: isA4 ? '7pt' : '6.5pt' }}>{term}</li>
                ))}
              </ol>
            </div>
          )}
          {showBankDetails && bankDetails && (
            <div style={{ marginTop: '4px' }}>
              <strong style={{ fontSize: isA4 ? '6pt' : '5pt' }}>Bank Details:</strong>
              <p style={{ margin: '1px 0', fontSize: isA4 ? '6pt' : '5pt' }}>{bankDetails.bankName}</p>
              <p style={{ margin: '1px 0', fontSize: isA4 ? '6pt' : '5pt' }}>A/c: {bankDetails.accountNumber}</p>
              <p style={{ margin: '1px 0', fontSize: isA4 ? '6pt' : '5pt' }}>IFSC: {bankDetails.ifscCode}</p>
            </div>
          )}
        </div>
        
        {/* Right side - QR Code & Signature */}
        <div style={{
          width: isA4 ? '140px' : isHorizontal ? '120px' : '105px',
          padding: isA4 ? '5px' : '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {qrCodeUrl && (
            <div style={{ textAlign: 'center' }}>
              <img src={qrCodeUrl} alt="QR Code" style={{
                width: isA4 ? '80px' : isHorizontal ? '68px' : '60px',
                height: isA4 ? '80px' : isHorizontal ? '68px' : '60px'
              }} />
              {upiId && <p style={{ margin: '1px 0', fontSize: isA4 ? '6pt' : '5pt' }}>UPI: {upiId}</p>}
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: '2px' }}>
            <p style={{ margin: '0', fontWeight: 'bold', fontSize: isA4 ? '7pt' : '6pt', color: colors.primary }}>
              Authorized Signatory
            </p>
          </div>
        </div>
      </div>

      {/* Thank You Message */}
      <div style={{
        textAlign: 'center',
        marginTop: isA4 ? '6px' : '4px',
        padding: isA4 ? '4px' : '3px',
        backgroundColor: colors.accent,
        border: `1px solid ${colors.primary}`,
        fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '7pt',
        fontWeight: 'bold',
        color: colors.primary
      }}>
        Thank you for your business!
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .professional-invoice-template {
            margin: 0;
            padding: ${isA4 ? '5mm' : isHorizontal ? '4mm' : '3mm'};
            box-shadow: none;
          }
          @page {
            size: ${isA4 ? 'A4' : isHorizontal ? 'A5 landscape' : 'A5 portrait'};
            margin: 0;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};
