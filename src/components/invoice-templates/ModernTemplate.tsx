import React from 'react';
import { numberToWords } from '@/lib/utils';

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
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  salesman?: string;
  items: Array<{
    sr: number;
    particulars: string;
    brand?: string;
    category?: string;
    color?: string;
    style?: string;
    size: string;
    hsn?: string;
    qty: number;
    rate: number;
    mrp?: number;
    discPercent?: number;
    total: number;
    gstPercent?: number;
  }>;
  subtotal: number;
  discount: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  totalTax: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  showHSN?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  paymentMethod?: string;
  termsConditions?: string[];
  declarationText?: string;
  customHeaderText?: string;
  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch?: string;
  };
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
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
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
  totalTax,
  grandTotal,
  showHSN = true,
  showGSTBreakdown = true,
  showBankDetails = true,
  termsConditions,
  customHeaderText,
  qrCodeUrl,
  bankDetails,
}) => {
  // Calculate GST details per item
  const calculateItemGST = (item: any) => {
    const gstRate = item.gstPercent || 5; // Default 5% GST
    const taxableAmt = item.total;
    const cgst = (taxableAmt * (gstRate / 2)) / 100;
    const sgst = (taxableAmt * (gstRate / 2)) / 100;
    return { gstRate, cgst, sgst, taxableAmt };
  };

  // Calculate totals
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const calculatedTaxableAmount = taxableAmount || (subtotal - discount);
  const calculatedTotalTax = totalTax || (cgstAmount + sgstAmount);

  // Group items by size for display
  const formatSizeVariants = (item: any) => {
    return item.size;
  };

  // Get unique GST rates for summary
  const gstSummary: Record<number, { taxable: number; cgst: number; sgst: number }> = {};
  items.forEach(item => {
    const { gstRate, taxableAmt, cgst, sgst } = calculateItemGST(item);
    if (!gstSummary[gstRate]) {
      gstSummary[gstRate] = { taxable: 0, cgst: 0, sgst: 0 };
    }
    gstSummary[gstRate].taxable += taxableAmt;
    gstSummary[gstRate].cgst += cgst;
    gstSummary[gstRate].sgst += sgst;
  });

  const cellStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '2px 4px',
    fontSize: '8pt',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    textAlign: 'center',
  };

  return (
    <div style={{
      width: '210mm',
      height: '277mm',
      margin: '0 auto',
      padding: '10mm',
      fontFamily: "'Arial', sans-serif",
      fontSize: '10pt',
      backgroundColor: '#fff',
      color: '#000',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Custom Header Text (e.g., ||SHREE||) */}
      {customHeaderText && (
        <div style={{ 
          textAlign: 'center', 
          fontSize: '14pt', 
          fontWeight: 'bold',
          marginBottom: '5px',
          color: '#000'
        }}>
          {customHeaderText}
        </div>
      )}

      {/* TAX INVOICE Title */}
      <div style={{ 
        textAlign: 'center', 
        fontSize: '16pt', 
        fontWeight: 'bold',
        border: '2px solid #000',
        padding: '5px',
        marginBottom: '10px',
        letterSpacing: '2px'
      }}>
        TAX INVOICE
      </div>

      {/* Main Container with Border */}
      <div style={{ border: '2px solid #000' }}>
        {/* Header Section - Business Details */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '2px solid #000',
          minHeight: '80px'
        }}>
          {/* Logo Section */}
          <div style={{ 
            width: '100px', 
            borderRight: '1px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px'
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: '80px', maxHeight: '60px' }} />
            ) : (
              <div style={{ fontSize: '8pt', color: '#999', textAlign: 'center' }}>LOGO</div>
            )}
          </div>

          {/* Business Details */}
          <div style={{ 
            flex: 1, 
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', marginBottom: '5px' }}>
              {businessName}
            </div>
            <div style={{ fontSize: '9pt', marginBottom: '3px' }}>{address}</div>
            <div style={{ fontSize: '9pt' }}>
              Mobile: {mobile} {email && `| Email: ${email}`}
            </div>
            {gstNumber && (
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: '5px' }}>
                GSTIN: {gstNumber}
              </div>
            )}
          </div>

          {/* Brand Logos Space */}
          <div style={{ 
            width: '100px', 
            borderLeft: '1px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px'
          }}>
            <div style={{ fontSize: '8pt', color: '#999', textAlign: 'center' }}>BRAND</div>
          </div>
        </div>

        {/* Customer & Invoice Details Row */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '2px solid #000'
        }}>
          {/* Customer Details - Left */}
          <div style={{ 
            flex: 1, 
            padding: '10px',
            borderRight: '1px solid #000',
            fontSize: '10pt'
          }}>
            <div style={{ marginBottom: '3px' }}>
              <strong>NAME:</strong> {customerName || 'Walk-in Customer'}
            </div>
            {customerAddress && (
              <div style={{ marginBottom: '3px' }}>
                <strong>ADD:</strong> {customerAddress}
              </div>
            )}
            {customerMobile && (
              <div style={{ marginBottom: '3px' }}>
                <strong>MOBILE NO:</strong> {customerMobile}
              </div>
            )}
            {customerGSTIN && (
              <div>
                <strong>GSTIN:</strong> {customerGSTIN}
              </div>
            )}
            {salesman && (
              <div>
                <strong>SALESMAN:</strong> {salesman}
              </div>
            )}
          </div>

          {/* Invoice Details - Right */}
          <div style={{ 
            width: '200px', 
            padding: '10px',
            fontSize: '10pt'
          }}>
            <div style={{ marginBottom: '3px' }}>
              <strong>INVOICE NO:</strong> {invoiceNumber}
            </div>
            <div>
              <strong>DATE:</strong> {invoiceDate.toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '9pt'
        }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '30px' }}>SR</th>
              <th style={{ ...headerCellStyle, width: '150px' }}>ITEM/PRODUCT<br/>DETAILS</th>
              {showHSN && <th style={{ ...headerCellStyle, width: '60px' }}>HSN<br/>CODE</th>}
              <th style={{ ...headerCellStyle, width: '40px' }}>QTY</th>
              <th style={{ ...headerCellStyle, width: '60px' }}>MRP/<br/>RATE</th>
              {showGSTBreakdown && (
                <>
                  <th style={{ ...headerCellStyle, width: '70px' }}>TAXABLE<br/>AMOUNT</th>
                  <th style={{ ...headerCellStyle, width: '35px' }}>CGST<br/>%</th>
                  <th style={{ ...headerCellStyle, width: '50px' }}>CGST<br/>AMOUNT</th>
                  <th style={{ ...headerCellStyle, width: '35px' }}>SGST<br/>%</th>
                  <th style={{ ...headerCellStyle, width: '50px' }}>SGST<br/>AMOUNT</th>
                </>
              )}
              <th style={{ ...headerCellStyle, width: '70px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const { gstRate, cgst, sgst, taxableAmt } = calculateItemGST(item);
              return (
                <tr key={index}>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>{item.sr}</td>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: '500' }}>{item.particulars}</div>
                    <div style={{ fontSize: '8pt', color: '#666' }}>
                      {formatSizeVariants(item)}
                    </div>
                  </td>
                  {showHSN && <td style={{ ...cellStyle, textAlign: 'center' }}>{item.hsn || '-'}</td>}
                  <td style={{ ...cellStyle, textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{item.rate.toFixed(2)}</td>
                  {showGSTBreakdown && (
                    <>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>{taxableAmt.toFixed(2)}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{(gstRate / 2).toFixed(1)}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>{cgst.toFixed(2)}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{(gstRate / 2).toFixed(1)}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>{sgst.toFixed(2)}</td>
                    </>
                  )}
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>
                    {(taxableAmt + cgst + sgst).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            
            {/* Empty rows for minimum item display */}
            {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td style={{ ...cellStyle, height: '16px' }}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                {showHSN && <td style={cellStyle}>&nbsp;</td>}
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                {showGSTBreakdown && (
                  <>
                    <td style={cellStyle}>&nbsp;</td>
                    <td style={cellStyle}>&nbsp;</td>
                    <td style={cellStyle}>&nbsp;</td>
                    <td style={cellStyle}>&nbsp;</td>
                    <td style={cellStyle}>&nbsp;</td>
                  </>
                )}
                <td style={cellStyle}>&nbsp;</td>
              </tr>
            ))}

            {/* Total Row */}
            <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
              <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={showHSN ? 3 : 2}>
                TOTAL QTY: {totalQty.toFixed(2)}
              </td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{totalQty}</td>
              <td style={cellStyle}></td>
              {showGSTBreakdown && (
                <>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{calculatedTaxableAmount.toFixed(2)}</td>
                  <td style={cellStyle}></td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{cgstAmount.toFixed(2)}</td>
                  <td style={cellStyle}></td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{sgstAmount.toFixed(2)}</td>
                </>
              )}
              <td style={{ ...cellStyle, textAlign: 'right' }}>{grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* GST Summary & Totals Section */}
        <div style={{ 
          display: 'flex', 
          borderTop: '2px solid #000'
        }}>
          {/* GST Breakdown - Left */}
          <div style={{ 
            flex: 1, 
            padding: '10px',
            borderRight: '1px solid #000',
            fontSize: '9pt'
          }}>
            {showGSTBreakdown && Object.entries(gstSummary).map(([rate, values]) => (
              <div key={rate} style={{ marginBottom: '3px' }}>
                <div>SGST: {(Number(rate) / 2).toFixed(2)}% = {values.taxable.toFixed(2)} : {values.sgst.toFixed(2)}</div>
                <div>CGST: {(Number(rate) / 2).toFixed(2)}% = {values.taxable.toFixed(2)} : {values.cgst.toFixed(2)}</div>
              </div>
            ))}
            <div style={{ marginTop: '10px', borderTop: '1px solid #000', paddingTop: '5px' }}>
              <div><strong>Balance:</strong> {grandTotal.toFixed(2)}</div>
              <div style={{ marginTop: '5px', fontSize: '8pt' }}>
                {numberToWords(grandTotal)}
              </div>
            </div>
          </div>

          {/* Totals - Right */}
          <div style={{ 
            width: '250px', 
            padding: '10px',
            fontSize: '10pt'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0' }}>SUB TOTAL</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>:</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>{subtotal.toFixed(2)}</td>
                </tr>
                {discount > 0 && (
                  <tr>
                    <td style={{ padding: '3px 0' }}>TOTAL DISC</td>
                    <td style={{ padding: '3px 0', textAlign: 'right' }}>:</td>
                    <td style={{ padding: '3px 0', textAlign: 'right' }}>{discount.toFixed(2)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '3px 0' }}>TAXABLE AMT</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>:</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>{calculatedTaxableAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0' }}>GST (Rs)</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>:</td>
                  <td style={{ padding: '3px 0', textAlign: 'right' }}>{calculatedTotalTax.toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: 'bold', fontSize: '12pt', borderTop: '2px solid #000' }}>
                  <td style={{ padding: '8px 0' }}>GRAND TOTAL</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>:</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bank Details, QR Code & Signature Section */}
        <div style={{ 
          display: 'flex', 
          borderTop: '2px solid #000',
          minHeight: '70px'
        }}>
          {/* Bank Details - Left */}
          {showBankDetails && bankDetails && (
            <div style={{ 
              flex: 1, 
              padding: '6px 8px',
              borderRight: '1px solid #000',
              fontSize: '8pt'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Bank Account Details:</div>
              {bankDetails.bank_name && <div>BANK NAME: {bankDetails.bank_name}</div>}
              {bankDetails.account_number && <div>A/c: {bankDetails.account_number}</div>}
              {bankDetails.ifsc_code && <div>IFSC: {bankDetails.ifsc_code}</div>}
              {bankDetails.branch && <div>Branch: {bankDetails.branch}</div>}
            </div>
          )}

          {/* QR Code - Center */}
          <div style={{ 
            width: '90px', 
            padding: '6px',
            borderRight: '1px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="UPI QR Code" style={{ width: '100px', height: '100px' }} />
            ) : (
              <div style={{ 
                width: '60px', 
                height: '60px', 
                border: '1px dashed #999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '7pt',
                color: '#999'
              }}>
                QR CODE
              </div>
            )}
          </div>

          {/* Signature Section - Right */}
          <div style={{ 
            width: '160px', 
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '8pt',
            textAlign: 'right'
          }}>
            <div style={{ fontWeight: 'bold' }}>
              FOR {businessName.toUpperCase()}
            </div>
            <div style={{ flex: 1, minHeight: '30px' }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>
              AUTHORISED SIGNATORY
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {termsConditions && termsConditions.length > 0 && (
          <div style={{ 
            borderTop: '1px solid #000',
            padding: '6px 8px',
            fontSize: '7pt'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Terms & Conditions:</div>
            <ol style={{ margin: 0, paddingLeft: '15px' }}>
              {termsConditions.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Footer - Thank You */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: '5px',
        fontSize: '9pt',
        fontWeight: 'bold'
      }}>
        Thank you for your business!
      </div>
    </div>
  );
};
