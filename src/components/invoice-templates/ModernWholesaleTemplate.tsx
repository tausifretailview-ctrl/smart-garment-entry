import React from 'react';
import { numberToWords } from '@/lib/utils';

interface WholesaleItem {
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
  barcode?: string;
}

interface GroupedItem {
  particulars: string;
  brand?: string;
  color?: string;
  style?: string;
  hsn?: string;
  rate: number;
  mrp?: number;
  gstPercent?: number;
  sizeQtyList: Array<{ size: string; qty: number }>;
  totalQty: number;
  totalAmount: number;
}

interface ModernWholesaleTemplateProps {
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
  shippingAddress?: string;
  items: WholesaleItem[];
  subtotal: number;
  discount: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  totalTax: number;
  grandTotal: number;
  roundOff?: number;
  showHSN?: boolean;
  showMRP?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  termsConditions?: string[];
  declarationText?: string;
  customHeaderText?: string;
  customFooterText?: string;
  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch?: string;
  };
  // Wholesale specific settings
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
  colorScheme?: string;
  fontFamily?: string;
  minItemRows?: number;
}

// Font family mapping
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

// Color scheme gradients
const colorSchemes: Record<string, { primary: string; gradient: string; light: string }> = {
  blue: { primary: '#2563eb', gradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', light: '#dbeafe' },
  green: { primary: '#16a34a', gradient: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)', light: '#dcfce7' },
  purple: { primary: '#9333ea', gradient: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)', light: '#f3e8ff' },
  red: { primary: '#dc2626', gradient: 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)', light: '#fee2e2' },
  orange: { primary: '#ea580c', gradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)', light: '#ffedd5' },
  gray: { primary: '#4b5563', gradient: 'linear-gradient(135deg, #374151 0%, #6b7280 100%)', light: '#f3f4f6' },
};

export const ModernWholesaleTemplate: React.FC<ModernWholesaleTemplateProps> = ({
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
  shippingAddress,
  items,
  subtotal,
  discount,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  totalTax,
  grandTotal,
  roundOff = 0,
  showHSN = true,
  showMRP = false,
  showGSTBreakdown = true,
  showBankDetails = true,
  termsConditions,
  customHeaderText,
  customFooterText,
  qrCodeUrl,
  bankDetails,
  enableWholesaleGrouping = true,
  sizeDisplayFormat = 'size/qty',
  showProductColor = true,
  showProductBrand = false,
  showProductStyle = false,
  colorScheme = 'blue',
  fontFamily = 'inter',
  minItemRows = 8,
}) => {
  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.inter;

  // Group items by product name for wholesale display (size/qty format like 10/3, 6/6)
  const groupItems = (items: WholesaleItem[]): GroupedItem[] => {
    if (!enableWholesaleGrouping) {
      return items.map(item => ({
        particulars: item.particulars,
        brand: item.brand,
        color: item.color,
        style: item.style,
        hsn: item.hsn,
        rate: item.rate,
        mrp: item.mrp,
        gstPercent: item.gstPercent,
        sizeQtyList: [{ size: item.size, qty: item.qty }],
        totalQty: item.qty,
        totalAmount: item.total,
      }));
    }

    const grouped: Record<string, GroupedItem> = {};
    
    items.forEach(item => {
      // Group by product name and rate only - consolidates all sizes of same product
      const key = `${item.particulars}-${item.rate}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          particulars: item.particulars,
          brand: item.brand,
          color: item.color,
          style: item.style,
          hsn: item.hsn,
          rate: item.rate,
          mrp: item.mrp,
          gstPercent: item.gstPercent,
          sizeQtyList: [],
          totalQty: 0,
          totalAmount: 0,
        };
      }
      
      // Check if this size already exists in the list
      const existingSize = grouped[key].sizeQtyList.find(sq => sq.size === item.size);
      if (existingSize) {
        existingSize.qty += item.qty;
      } else {
        grouped[key].sizeQtyList.push({ size: item.size, qty: item.qty });
      }
      grouped[key].totalQty += item.qty;
      grouped[key].totalAmount += item.total;
    });
    
    return Object.values(grouped);
  };

  const formatSizeQty = (sizeQtyList: Array<{ size: string; qty: number }>): string => {
    const separator = sizeDisplayFormat === 'size×qty' ? '×' : '/';
    return sizeQtyList
      .map(sq => `${sq.size}${separator}${sq.qty}`)
      .join(', ');
  };

  const groupedItems = groupItems(items);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const calculatedTaxableAmount = taxableAmount || (subtotal - discount);
  const calculatedTotalTax = totalTax || (cgstAmount + sgstAmount);

  // GST summary by rate
  const gstSummary: Record<number, { taxable: number; cgst: number; sgst: number }> = {};
  items.forEach(item => {
    const gstRate = item.gstPercent || 5;
    const taxableAmt = item.total;
    const cgst = (taxableAmt * (gstRate / 2)) / 100;
    const sgst = (taxableAmt * (gstRate / 2)) / 100;
    if (!gstSummary[gstRate]) {
      gstSummary[gstRate] = { taxable: 0, cgst: 0, sgst: 0 };
    }
    gstSummary[gstRate].taxable += taxableAmt;
    gstSummary[gstRate].cgst += cgst;
    gstSummary[gstRate].sgst += sgst;
  });

  const cellStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    padding: '4px 6px',
    fontSize: '8pt',
    verticalAlign: 'top',
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: colors.gradient,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    padding: '5px',
    fontSize: '8pt',
  };

  return (
    <div 
      className="invoice-print invoice-format-a4-full"
      style={{
        width: '210mm',
        maxHeight: '297mm',
        margin: '0 auto',
        padding: '10mm',
        fontFamily: font,
        fontSize: '9pt',
        backgroundColor: '#fff',
        color: '#1f2937',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Gradient Header Bar */}
      <div style={{
        background: colors.gradient,
        height: '4px',
        borderRadius: '2px 2px 0 0',
        marginBottom: '0',
      }} />

      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ 
          textAlign: 'center', 
          fontSize: '10pt', 
          fontWeight: '600',
          padding: '5px',
          color: colors.primary,
          borderBottom: `1px solid ${colors.light}`,
        }}>
          {customHeaderText}
        </div>
      )}

      {/* Main Border Container */}
      <div style={{ border: '1px solid #374151', borderTop: 'none' }}>
        {/* Header Section - Business Details */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid #374151',
          background: colors.light,
        }}>
          {/* Logo Section */}
          <div style={{ 
            width: '70px', 
            borderRight: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: '55px', maxHeight: '45px' }} />
            ) : (
              <div style={{ 
                fontSize: '7pt', 
                color: '#9ca3af', 
                textAlign: 'center',
                border: '1px dashed #9ca3af',
                padding: '5px',
                borderRadius: '3px',
              }}>LOGO</div>
            )}
          </div>

          {/* Business Details */}
          <div style={{ 
            flex: 1, 
            padding: '8px',
            textAlign: 'center',
          }}>
            <div style={{ 
              fontSize: '16pt', 
              fontWeight: '700', 
              color: colors.primary,
              marginBottom: '2px',
              letterSpacing: '0.5px',
            }}>
              {businessName}
            </div>
            <div style={{ fontSize: '8pt', color: '#4b5563', marginBottom: '1px' }}>{address}</div>
            <div style={{ fontSize: '8pt', color: '#4b5563' }}>
              Mobile: {mobile} {email && `| Email: ${email}`}
            </div>
            {gstNumber && (
              <div style={{ 
                fontSize: '9pt', 
                fontWeight: '600', 
                marginTop: '2px',
                color: '#1f2937',
              }}>
                GSTIN: {gstNumber}
              </div>
            )}
          </div>

          {/* Tax Invoice Badge */}
          <div style={{ 
            width: '90px', 
            borderLeft: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
          }}>
            <div style={{ 
              background: colors.gradient,
              color: '#fff',
              padding: '5px 8px',
              borderRadius: '4px',
              fontWeight: '700',
              fontSize: '9pt',
              textAlign: 'center',
              letterSpacing: '0.5px',
            }}>
              TAX<br/>INVOICE
            </div>
          </div>
        </div>

        {/* Customer & Invoice Details Row */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid #374151',
        }}>
          {/* Bill To - Left */}
          <div style={{ 
            flex: 1, 
            padding: '6px 8px',
            borderRight: '1px solid #374151',
          }}>
            <div style={{ 
              fontSize: '7pt', 
              fontWeight: '600', 
              color: colors.primary,
              marginBottom: '2px',
              textTransform: 'uppercase',
            }}>Bill To:</div>
            <div style={{ fontWeight: '600', fontSize: '10pt', marginBottom: '1px' }}>
              {customerName || 'Walk-in Customer'}
            </div>
            {customerAddress && (
              <div style={{ fontSize: '8pt', color: '#4b5563', marginBottom: '1px' }}>{customerAddress}</div>
            )}
            {customerMobile && (
              <div style={{ fontSize: '8pt' }}>Mobile: {customerMobile}</div>
            )}
            {customerGSTIN && (
              <div style={{ fontSize: '8pt', fontWeight: '500' }}>GSTIN: {customerGSTIN}</div>
            )}
            {salesman && (
              <div style={{ fontSize: '8pt', fontWeight: '500', marginTop: '2px' }}>Salesman: {salesman}</div>
            )}
          </div>

          {/* Ship To - Center (if different) */}
          {shippingAddress && shippingAddress !== customerAddress && (
            <div style={{ 
              flex: 1, 
              padding: '6px 8px',
              borderRight: '1px solid #374151',
            }}>
              <div style={{ 
                fontSize: '7pt', 
                fontWeight: '600', 
                color: colors.primary,
                marginBottom: '2px',
                textTransform: 'uppercase',
              }}>Ship To:</div>
              <div style={{ fontSize: '8pt', color: '#4b5563' }}>{shippingAddress}</div>
            </div>
          )}

          {/* Invoice Details - Right */}
          <div style={{ 
            width: '150px', 
            padding: '6px 8px',
            background: colors.light,
          }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '7pt', color: '#6b7280' }}>Invoice No:</span>
              <div style={{ fontWeight: '600', fontSize: '9pt' }}>{invoiceNumber}</div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', color: '#6b7280' }}>Date:</span>
              <div style={{ fontWeight: '600', fontSize: '9pt' }}>
                {invoiceDate.toLocaleDateString('en-IN', { 
                  day: '2-digit', 
                  month: 'short', 
                  year: 'numeric' 
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
        }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, width: '30px' }}>SR</th>
              <th style={{ ...headerCellStyle, width: enableWholesaleGrouping ? '160px' : '140px' }}>
                PARTICULARS
              </th>
              {showHSN && <th style={{ ...headerCellStyle, width: '55px' }}>HSN</th>}
              <th style={{ ...headerCellStyle, width: enableWholesaleGrouping ? '130px' : '50px' }}>
                {enableWholesaleGrouping ? 'SIZE/QTY' : 'SIZE'}
              </th>
              <th style={{ ...headerCellStyle, width: '40px' }}>QTY</th>
              {showMRP && <th style={{ ...headerCellStyle, width: '55px' }}>MRP</th>}
              <th style={{ ...headerCellStyle, width: '55px' }}>RATE</th>
              {showGSTBreakdown && (
                <>
                  <th style={{ ...headerCellStyle, width: '55px' }}>TAXABLE</th>
                  <th style={{ ...headerCellStyle, width: '40px' }}>GST%</th>
                </>
              )}
              <th style={{ ...headerCellStyle, width: '65px' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.map((item, index) => {
              const gstRate = item.gstPercent || 5;
              return (
                <tr key={index}>
                  <td style={{ ...cellStyle, textAlign: 'center', fontWeight: '500' }}>{index + 1}</td>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: '600', marginBottom: '1px', fontSize: '8pt' }}>{item.particulars}</div>
                    {(showProductColor || showProductBrand || showProductStyle) && (
                      <div style={{ fontSize: '7pt', color: '#6b7280' }}>
                        {showProductColor && item.color && <span>Color: {item.color}</span>}
                        {showProductBrand && item.brand && <span> | Brand: {item.brand}</span>}
                        {showProductStyle && item.style && <span> | Style: {item.style}</span>}
                      </div>
                    )}
                  </td>
                  {showHSN && <td style={{ ...cellStyle, textAlign: 'center', fontSize: '7pt' }}>{item.hsn || '-'}</td>}
                  <td style={{ ...cellStyle, fontSize: '7pt' }}>
                    {enableWholesaleGrouping 
                      ? formatSizeQty(item.sizeQtyList)
                      : item.sizeQtyList[0]?.size
                    }
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center', fontWeight: '600', fontSize: '8pt' }}>{item.totalQty}</td>
                  {showMRP && (
                    <td style={{ ...cellStyle, textAlign: 'right', textDecoration: 'line-through', color: '#9ca3af' }}>
                      {item.mrp ? `₹${item.mrp.toFixed(2)}` : '-'}
                    </td>
                  )}
                  <td style={{ ...cellStyle, textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                  {showGSTBreakdown && (
                    <>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>₹{item.totalAmount.toFixed(2)}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{gstRate}%</td>
                    </>
                  )}
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                    ₹{(item.totalAmount + (item.totalAmount * (gstRate || 0) / 100)).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            
            {/* Empty rows to reach minimum */}
            {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td style={{ ...cellStyle, height: '18px' }}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                {showHSN && <td style={cellStyle}>&nbsp;</td>}
                <td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td>
                {showMRP && <td style={cellStyle}>&nbsp;</td>}
                <td style={cellStyle}>&nbsp;</td>
                {showGSTBreakdown && (
                  <>
                    <td style={cellStyle}>&nbsp;</td>
                    <td style={cellStyle}>&nbsp;</td>
                  </>
                )}
                <td style={cellStyle}>&nbsp;</td>
              </tr>
            ))}
            
            {/* Total Row */}
            <tr style={{ background: colors.light }}>
              <td style={{ ...cellStyle, textAlign: 'center', fontWeight: '700', fontSize: '8pt' }} 
                  colSpan={showHSN ? 4 : 3}>
                TOTAL QUANTITY
              </td>
              <td style={{ ...cellStyle, textAlign: 'center', fontWeight: '700', fontSize: '9pt' }}>
                {totalQty}
              </td>
              {showMRP && <td style={cellStyle}></td>}
              <td style={cellStyle}></td>
              {showGSTBreakdown && (
                <>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', fontSize: '8pt' }}>
                    ₹{calculatedTaxableAmount.toFixed(2)}
                  </td>
                  <td style={cellStyle}></td>
                </>
              )}
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', fontSize: '9pt' }}>
                ₹{grandTotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* GST Summary & Totals Section */}
        <div style={{ 
          display: 'flex', 
          borderTop: '1px solid #374151',
        }}>
          {/* GST Breakdown & Amount in Words - Left */}
          <div style={{ 
            flex: 1, 
            padding: '6px 8px',
            borderRight: '1px solid #374151',
          }}>
            {showGSTBreakdown && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '7pt', fontWeight: '600', color: colors.primary, marginBottom: '2px' }}>
                  TAX BREAKDOWN:
                </div>
                {Object.entries(gstSummary).map(([rate, values]) => (
                  <div key={rate} style={{ fontSize: '7pt', marginBottom: '1px' }}>
                    <span>GST @{rate}%: ₹{values.taxable.toFixed(2)} → CGST: ₹{values.cgst.toFixed(2)} + SGST: ₹{values.sgst.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ 
              borderTop: '1px solid #e5e7eb', 
              paddingTop: '4px',
              marginTop: '4px',
            }}>
              <div style={{ fontSize: '7pt', fontWeight: '600', color: colors.primary }}>
                AMOUNT IN WORDS:
              </div>
              <div style={{ fontSize: '8pt', fontStyle: 'italic', marginTop: '1px' }}>
                {numberToWords(grandTotal)}
              </div>
            </div>
          </div>

          {/* Totals - Right */}
          <div style={{ 
            width: '180px', 
            padding: '6px 8px',
            background: colors.light,
          }}>
            <table style={{ width: '100%', fontSize: '8pt' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '2px 0' }}>Sub Total</td>
                  <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: '500' }}>₹{subtotal.toFixed(2)}</td>
                </tr>
                {discount > 0 && (
                  <tr>
                    <td style={{ padding: '2px 0', color: '#16a34a' }}>Discount</td>
                    <td style={{ padding: '2px 0', textAlign: 'right', color: '#16a34a' }}>-₹{discount.toFixed(2)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '2px 0' }}>Taxable Amount</td>
                  <td style={{ padding: '2px 0', textAlign: 'right' }}>₹{calculatedTaxableAmount.toFixed(2)}</td>
                </tr>
                {showGSTBreakdown && (
                  <>
                    <tr>
                      <td style={{ padding: '2px 0' }}>CGST</td>
                      <td style={{ padding: '2px 0', textAlign: 'right' }}>₹{cgstAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0' }}>SGST</td>
                      <td style={{ padding: '2px 0', textAlign: 'right' }}>₹{sgstAmount.toFixed(2)}</td>
                    </tr>
                  </>
                )}
                {roundOff !== 0 && (
                  <tr>
                    <td style={{ padding: '2px 0' }}>Round Off</td>
                    <td style={{ padding: '2px 0', textAlign: 'right' }}>{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: '1px solid #374151' }}>
                  <td style={{ 
                    padding: '4px 0', 
                    fontWeight: '700', 
                    fontSize: '10pt',
                    color: colors.primary,
                  }}>GRAND TOTAL</td>
                  <td style={{ 
                    padding: '4px 0', 
                    textAlign: 'right', 
                    fontWeight: '700', 
                    fontSize: '10pt',
                    color: colors.primary,
                  }}>₹{grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bank Details, QR Code & Signature Section */}
        <div style={{ 
          display: 'flex', 
          borderTop: '1px solid #374151',
          minHeight: '60px',
        }}>
          {/* Bank Details - Left */}
          {showBankDetails && bankDetails && (
            <div style={{ 
              flex: 1, 
              padding: '6px 8px',
              borderRight: '1px solid #374151',
            }}>
              <div style={{ 
                fontSize: '7pt', 
                fontWeight: '600', 
                color: colors.primary,
                marginBottom: '2px',
              }}>BANK DETAILS:</div>
              <div style={{ fontSize: '7pt' }}>
                {bankDetails.bank_name && <div>Bank: {bankDetails.bank_name}</div>}
                {bankDetails.account_number && <div>A/C No: {bankDetails.account_number}</div>}
                {bankDetails.ifsc_code && <div>IFSC: {bankDetails.ifsc_code}</div>}
                {bankDetails.branch && <div>Branch: {bankDetails.branch}</div>}
              </div>
            </div>
          )}

          {/* QR Code - Center */}
          <div style={{ 
            width: '80px', 
            padding: '5px',
            borderRight: '1px solid #374151',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {qrCodeUrl ? (
              <>
                <img src={qrCodeUrl} alt="UPI QR Code" style={{ width: '55px', height: '55px' }} />
                <div style={{ fontSize: '5pt', color: '#6b7280', marginTop: '1px' }}>Scan to Pay</div>
              </>
            ) : (
              <div style={{ 
                width: '50px', 
                height: '50px', 
                border: '1px dashed #9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '6pt',
                color: '#9ca3af',
                borderRadius: '3px',
              }}>
                QR CODE
              </div>
            )}
          </div>

          {/* Signature Section - Right */}
          <div style={{ 
            flex: 1,
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}>
            <div style={{ 
              width: '140px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '7pt', color: '#6b7280' }}>
                For {businessName}
              </div>
              <div style={{ 
                borderTop: '1px solid #374151', 
                marginTop: '25px',
                paddingTop: '2px',
                fontSize: '7pt',
                fontWeight: '500',
              }}>
                Authorised Signatory
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {termsConditions && termsConditions.length > 0 && (
          <div style={{ 
            borderTop: '1px solid #374151',
            padding: '4px 8px',
            background: colors.light,
          }}>
            <div style={{ 
              fontSize: '7pt', 
              fontWeight: '600', 
              color: colors.primary,
              marginBottom: '2px',
            }}>TERMS & CONDITIONS:</div>
            <div style={{ fontSize: '6pt', color: '#4b5563' }}>
              {termsConditions.map((term, index) => (
                <span key={index}>{index + 1}. {term} &nbsp;&nbsp;</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom Footer Text */}
      {customFooterText && (
        <div style={{ 
          textAlign: 'center', 
          fontSize: '8pt', 
          padding: '4px',
          color: '#6b7280',
          fontStyle: 'italic',
        }}>
          {customFooterText}
        </div>
      )}

      {/* Bottom Gradient Bar */}
      <div style={{
        background: colors.gradient,
        height: '3px',
        borderRadius: '0 0 2px 2px',
        marginTop: '0',
      }} />
    </div>
  );
};

export default ModernWholesaleTemplate;
