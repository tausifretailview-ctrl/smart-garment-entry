import React from 'react';
import { numberToWords } from '@/lib/utils';
import '@/styles/professional-invoice.css';

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
  gstPercent?: number;
}

interface GroupedItem {
  particulars: string;
  color?: string;
  brand?: string;
  style?: string;
  rate: number;
  sizeQtyList: Array<{ size: string; qty: number }>;
  totalQty: number;
  totalAmount: number;
}

interface ProfessionalTemplateProps {
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
  salesman?: string;
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
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  amountWithGrouping?: boolean;
  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  declarationText?: string;
  termsConditions?: string[];
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch?: string;
  };
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: string;
  fontFamily?: string;
  qrCodeUrl?: string;
  upiId?: string;
  // Wholesale mode props
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
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
  totalSavings = 0,
  showMRP = false,
  showHSN = true,
  showBarcode = false,
  showGSTBreakdown = true,
  showBankDetails = true,
  minItemRows = 12,
  showTotalQuantity = true,
  amountWithDecimal = true,
  showReceivedAmount = false,
  showBalanceAmount = false,
  showPartyBalance = false,
  showTaxDetails = true,
  showYouSaved = false,
  amountWithGrouping = true,
  paymentMethod,
  amountPaid,
  balanceDue = 0,
  cashAmount,
  cardAmount,
  upiAmount,
  paidAmount,
  declarationText,
  termsConditions,
  bankDetails,
  format = 'a4',
  colorScheme = 'blue',
  customHeaderText,
  customFooterText,
  logoPlacement = 'left',
  fontFamily = 'inter',
  qrCodeUrl,
  upiId,
  enableWholesaleGrouping = false,
  sizeDisplayFormat = 'size/qty',
  showProductColor = true,
  showProductBrand = false,
  showProductStyle = false,
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    if (amountWithGrouping) {
      return amountWithDecimal 
        ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `₹${Math.round(amount).toLocaleString('en-IN')}`;
    }
    return amountWithDecimal 
      ? `₹${amount.toFixed(2)}`
      : `₹${Math.round(amount)}`;
  };

  // Determine dimensions based on format
  const getPageDimensions = () => {
    switch (format) {
      case 'a5-horizontal':
        return { width: '210mm', minHeight: '148mm', padding: '4mm' };
      case 'a5-vertical':
        return { width: '148mm', minHeight: '210mm', padding: '3mm' };
      case 'a4':
      default:
        return { width: '210mm', minHeight: '297mm', padding: '5mm' };
    }
  };

  const { width, minHeight, padding } = getPageDimensions();

  // Calculate font sizes based on format
  const getFontSizes = () => {
    switch (format) {
      case 'a5-horizontal':
        return {
          headerTitle: '14pt',
          businessName: '12pt',
          normal: '8pt',
          small: '7pt',
          heading: '9pt',
          grandTotal: '10pt',
          terms: '7pt',
        };
      case 'a5-vertical':
        return {
          headerTitle: '12pt',
          businessName: '11pt',
          normal: '7pt',
          small: '6pt',
          heading: '8pt',
          grandTotal: '9pt',
          terms: '6pt',
        };
      case 'a4':
      default:
        return {
          headerTitle: '16pt',
          businessName: '14pt',
          normal: '9pt',
          small: '8pt',
          heading: '10pt',
          grandTotal: '12pt',
          terms: '8pt',
        };
    }
  };

  const fontSizes = getFontSizes();

  const colorSchemes: Record<string, { primary: string; secondary: string; accent: string }> = {
    blue: { primary: '#1e40af', secondary: '#3b82f6', accent: '#dbeafe' },
    green: { primary: '#15803d', secondary: '#22c55e', accent: '#dcfce7' },
    purple: { primary: '#7c3aed', secondary: '#a78bfa', accent: '#f3e8ff' },
    red: { primary: '#dc2626', secondary: '#f87171', accent: '#fee2e2' },
    orange: { primary: '#ea580c', secondary: '#fb923c', accent: '#ffedd5' },
    teal: { primary: '#0d9488', secondary: '#2dd4bf', accent: '#ccfbf1' },
    indigo: { primary: '#4f46e5', secondary: '#818cf8', accent: '#e0e7ff' },
    black: { primary: '#111827', secondary: '#374151', accent: '#f3f4f6' },
  };

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

  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.inter;

  // Group items for wholesale display
  const groupItems = (items: InvoiceItem[]): GroupedItem[] => {
    if (!enableWholesaleGrouping) {
      return items.map(item => ({
        particulars: item.particulars,
        color: item.color,
        brand: item.brand,
        style: item.style,
        rate: item.rate,
        sizeQtyList: [{ size: item.size, qty: item.qty }],
        totalQty: item.qty,
        totalAmount: item.total,
      }));
    }

    const grouped: Record<string, GroupedItem> = {};
    items.forEach(item => {
      const key = `${item.particulars}-${item.rate}`;
      if (!grouped[key]) {
        grouped[key] = {
          particulars: item.particulars,
          color: item.color,
          brand: item.brand,
          style: item.style,
          rate: item.rate,
          sizeQtyList: [],
          totalQty: 0,
          totalAmount: 0,
        };
      }
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

  const formatSizeQty = (sizeQtyList: Array<{ size: string; qty: number }>) => {
    const separator = sizeDisplayFormat === 'size×qty' ? '×' : '/';
    return sizeQtyList.map(sq => `${sq.size}${separator}${sq.qty}`).join(', ');
  };

  const groupedItems = groupItems(items);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div 
      className="professional-invoice"
      style={{
        width,
        minHeight,
        maxHeight: minHeight,
        margin: '0 auto',
        padding,
        backgroundColor: 'white',
        fontFamily: font,
        fontSize: fontSizes.normal,
        color: '#000',
        border: `1px solid ${colors.primary}`,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '4px', 
          fontSize: fontSizes.heading, 
          fontWeight: 'bold', 
          color: colors.primary 
        }}>
          {customHeaderText}
        </div>
      )}

      {/* TAX INVOICE Header */}
      <div style={{ 
        textAlign: 'center',
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
        padding: format === 'a4' ? '8px' : '5px',
        marginBottom: '6px',
        borderRadius: '3px',
        color: 'white'
      }}>
        <div style={{ fontSize: fontSizes.headerTitle, fontWeight: 'bold', letterSpacing: '2px' }}>
          TAX INVOICE
        </div>
      </div>

      {/* Business Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        marginBottom: '6px',
        padding: '6px',
        border: `1px solid ${colors.primary}`,
        borderRadius: '3px',
        gap: '8px'
      }}>
        {/* Logo - Left */}
        {logoPlacement === 'left' && logoUrl && (
          <div style={{ flexShrink: 0 }}>
            <img 
              src={logoUrl} 
              alt="Logo" 
              style={{ 
                maxWidth: format === 'a4' ? '60px' : '45px', 
                maxHeight: format === 'a4' ? '60px' : '45px' 
              }} 
            />
          </div>
        )}
        
        {/* Business Details - Center */}
        <div style={{ flex: 1, textAlign: logoPlacement === 'center' ? 'center' : 'left' }}>
          {logoPlacement === 'center' && logoUrl && (
            <div style={{ marginBottom: '4px' }}>
              <img 
                src={logoUrl} 
                alt="Logo" 
                style={{ 
                  maxWidth: format === 'a4' ? '50px' : '40px', 
                  maxHeight: format === 'a4' ? '50px' : '40px' 
                }} 
              />
            </div>
          )}
          <div style={{ 
            fontSize: fontSizes.businessName, 
            fontWeight: 'bold', 
            color: colors.primary,
            marginBottom: '2px'
          }}>
            {businessName}
          </div>
          <div style={{ fontSize: fontSizes.small, lineHeight: 1.3 }}>
            {address}
          </div>
          <div style={{ fontSize: fontSizes.small }}>
            Ph: {mobile} {email && `| Email: ${email}`}
          </div>
          {gstNumber && (
            <div style={{ fontSize: fontSizes.small, fontWeight: 'bold' }}>
              GSTIN: {gstNumber}
            </div>
          )}
        </div>

        {/* Logo - Right */}
        {logoPlacement === 'right' && logoUrl && (
          <div style={{ flexShrink: 0 }}>
            <img 
              src={logoUrl} 
              alt="Logo" 
              style={{ 
                maxWidth: format === 'a4' ? '60px' : '45px', 
                maxHeight: format === 'a4' ? '60px' : '45px' 
              }} 
            />
          </div>
        )}
      </div>

      {/* Invoice Details & Customer Info */}
      <div style={{ 
        display: 'flex', 
        gap: '6px', 
        marginBottom: '6px', 
        border: `1px solid ${colors.primary}`,
        borderRadius: '3px'
      }}>
        {/* Customer Details - Left */}
        <div style={{ 
          flex: 1, 
          padding: '5px', 
          borderRight: `1px solid ${colors.primary}` 
        }}>
          <div style={{ 
            fontWeight: 'bold', 
            fontSize: fontSizes.heading, 
            marginBottom: '3px', 
            color: colors.primary,
            borderBottom: `1px solid ${colors.secondary}`,
            paddingBottom: '2px'
          }}>
            Bill To:
          </div>
          <div style={{ fontSize: fontSizes.normal, lineHeight: 1.4 }}>
            <strong>{customerName || 'Walk-in Customer'}</strong>
            {customerAddress && <><br/>{customerAddress}</>}
            {customerMobile && <><br/>Ph: {customerMobile}</>}
            {customerGSTIN && <><br/><strong>GSTIN:</strong> {customerGSTIN}</>}
            {salesman && <><br/><strong>Salesman:</strong> {salesman}</>}
          </div>
        </div>

        {/* Invoice Details - Right */}
        <div style={{ 
          width: format === 'a4' ? '160px' : '130px', 
          padding: '5px' 
        }}>
          <div style={{ 
            fontWeight: 'bold', 
            fontSize: fontSizes.heading, 
            marginBottom: '3px', 
            color: colors.primary,
            borderBottom: `1px solid ${colors.secondary}`,
            paddingBottom: '2px'
          }}>
            Invoice Details:
          </div>
          <div style={{ fontSize: fontSizes.normal, lineHeight: 1.4 }}>
            <strong>Invoice No:</strong> {invoiceNumber}<br/>
            <strong>Date:</strong> {formatDate(invoiceDate)} {invoiceTime && invoiceTime}<br/>
            {paymentMethod && <><strong>Payment:</strong> {paymentMethod.toUpperCase()}</>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse', 
        marginBottom: '6px', 
        fontSize: fontSizes.small,
        border: `1px solid ${colors.primary}`
      }}>
        <thead>
          <tr style={{ 
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, 
            color: 'white' 
          }}>
            <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '25px' }}>Sr</th>
            <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, textAlign: 'left' }}>Description</th>
            {showHSN && !enableWholesaleGrouping && (
              <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '50px' }}>HSN</th>
            )}
            {enableWholesaleGrouping && (
              <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '80px' }}>Sizes</th>
            )}
            <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '35px' }}>Qty</th>
            {showMRP && (
              <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '50px', textAlign: 'right' }}>MRP</th>
            )}
            <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '55px', textAlign: 'right' }}>Rate</th>
            <th style={{ padding: '4px 2px', border: `1px solid ${colors.primary}`, width: '65px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groupedItems.map((item, index) => {
            const wholesaleDetails: string[] = [];
            if (enableWholesaleGrouping) {
              if (showProductColor && item.color) wholesaleDetails.push(item.color);
              if (showProductBrand && item.brand) wholesaleDetails.push(item.brand);
              if (showProductStyle && item.style) wholesaleDetails.push(item.style);
            }
            return (
              <tr key={index}>
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'center' }}>{index + 1}</td>
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>
                  {item.particulars}
                  {!enableWholesaleGrouping && items[index]?.size && ` (${items[index].size})`}
                  {wholesaleDetails.length > 0 && (
                    <div style={{ fontSize: '6pt', color: colors.secondary }}>{wholesaleDetails.join(' | ')}</div>
                  )}
                </td>
                {showHSN && !enableWholesaleGrouping && (
                  <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'center' }}>
                    {items[index]?.hsn || '-'}
                  </td>
                )}
                {enableWholesaleGrouping && (
                  <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'center', fontSize: '6pt' }}>
                    {formatSizeQty(item.sizeQtyList)}
                  </td>
                )}
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'center' }}>{item.totalQty}</td>
                {showMRP && (
                  <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'right' }}>
                    {formatCurrency(items[index]?.mrp || item.rate)}
                  </td>
                )}
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'right' }}>
                  {formatCurrency(item.rate)}
                </td>
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, textAlign: 'right', fontWeight: 'bold' }}>
                  {formatCurrency(item.totalAmount)}
                </td>
              </tr>
            );
          })}
          {/* Empty rows to reach minimum */}
          {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, index) => (
            <tr key={`empty-${index}`}>
              <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}`, height: '16px' }}>&nbsp;</td>
              <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              {showHSN && !enableWholesaleGrouping && (
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              )}
              {enableWholesaleGrouping && (
                <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              )}
              <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              {showMRP && <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>}
              <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ padding: '3px 2px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        {/* Total Row */}
        <tfoot>
          <tr style={{ 
            background: colors.accent, 
            fontWeight: 'bold' 
          }}>
            <td 
              colSpan={showHSN || enableWholesaleGrouping ? 2 : 1} 
              style={{ padding: '4px', border: `1px solid ${colors.primary}`, textAlign: 'right' }}
            >
              {showTotalQuantity ? `Total Qty: ${totalQty}` : 'Total:'}
            </td>
            {(showHSN || enableWholesaleGrouping) && (
              <td style={{ padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
            )}
            <td style={{ padding: '4px', border: `1px solid ${colors.primary}`, textAlign: 'center' }}>{totalQty}</td>
            {showMRP && <td style={{ padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>}
            <td style={{ padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
            <td style={{ padding: '4px', border: `1px solid ${colors.primary}`, textAlign: 'right' }}>
              {formatCurrency(subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Tax Breakdown & Totals */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        {/* Tax Calculation Box */}
        {showTaxDetails && showGSTBreakdown && (
          <div style={{ 
            flex: 1, 
            border: `1px solid ${colors.primary}`, 
            padding: '5px', 
            fontSize: fontSizes.small,
            borderRadius: '3px'
          }}>
            <div style={{ 
              fontWeight: 'bold', 
              marginBottom: '3px', 
              textAlign: 'center', 
              color: colors.primary,
              borderBottom: `1px solid ${colors.secondary}`,
              paddingBottom: '2px'
            }}>
              TAX DETAILS
            </div>
            <table style={{ width: '100%', fontSize: fontSizes.small }}>
              <tbody>
                {cgstAmount > 0 && (
                  <tr>
                    <td style={{ padding: '1px 0' }}>CGST:</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{formatCurrency(cgstAmount)}</td>
                  </tr>
                )}
                {sgstAmount > 0 && (
                  <tr>
                    <td style={{ padding: '1px 0' }}>SGST:</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{formatCurrency(sgstAmount)}</td>
                  </tr>
                )}
                {igstAmount > 0 && (
                  <tr>
                    <td style={{ padding: '1px 0' }}>IGST:</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{formatCurrency(igstAmount)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: `1px solid ${colors.primary}`, fontWeight: 'bold' }}>
                  <td style={{ padding: '2px 0' }}>Total Tax:</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{formatCurrency(totalTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Amount Summary */}
        <div style={{ 
          width: showTaxDetails && showGSTBreakdown ? '50%' : '100%', 
          border: `1px solid ${colors.primary}`, 
          padding: '5px', 
          fontSize: fontSizes.normal,
          borderRadius: '3px'
        }}>
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
          {showTaxDetails && totalTax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>Total Tax:</span>
              <span>{formatCurrency(totalTax)}</span>
            </div>
          )}
          {roundOff !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>Round Off:</span>
              <span>{formatCurrency(roundOff)}</span>
            </div>
          )}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '4px', 
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            color: 'white',
            marginTop: '3px', 
            fontWeight: 'bold', 
            fontSize: fontSizes.grandTotal,
            borderRadius: '3px'
          }}>
            <span>GRAND TOTAL:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
          {showYouSaved && totalSavings > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '2px 0', 
              color: '#155724', 
              fontWeight: 'bold', 
              fontSize: fontSizes.small,
              marginTop: '2px'
            }}>
              <span>You Saved:</span>
              <span>{formatCurrency(totalSavings)}</span>
            </div>
          )}
          {showReceivedAmount && paidAmount !== undefined && paidAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: fontSizes.small }}>
              <span>Amount Received:</span>
              <span>{formatCurrency(paidAmount)}</span>
            </div>
          )}
          {showBalanceAmount && balanceDue > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#dc2626', fontWeight: 'bold', fontSize: fontSizes.small }}>
              <span>Balance Due:</span>
              <span>{formatCurrency(balanceDue)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Amount in Words */}
      <div style={{ 
        border: `1px solid ${colors.primary}`, 
        padding: '4px 6px', 
        marginBottom: '6px',
        fontSize: fontSizes.small,
        borderRadius: '3px',
        background: colors.accent
      }}>
        <strong>Amount in Words:</strong> {numberToWords(grandTotal)} Only
      </div>

      {/* Bank Details & QR Code */}
      {(showBankDetails || qrCodeUrl) && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          {showBankDetails && bankDetails && (
            <div style={{ 
              flex: 1, 
              border: `1px solid ${colors.primary}`, 
              padding: '5px', 
              fontSize: fontSizes.small,
              borderRadius: '3px'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px', color: colors.primary }}>Bank Details:</div>
              {bankDetails.bank_name && <div>Bank: {bankDetails.bank_name}</div>}
              {bankDetails.account_number && <div>A/C No: {bankDetails.account_number}</div>}
              {bankDetails.ifsc_code && <div>IFSC: {bankDetails.ifsc_code}</div>}
              {bankDetails.branch && <div>Branch: {bankDetails.branch}</div>}
            </div>
          )}
          {qrCodeUrl && (
            <div style={{ 
              width: '110px', 
              border: `1px solid ${colors.primary}`, 
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '3px'
            }}>
              <img src={qrCodeUrl} alt="UPI QR" style={{ width: '100px', height: '100px' }} />
              <div style={{ fontSize: '6pt', textAlign: 'center', marginTop: '2px' }}>Scan to Pay</div>
            </div>
          )}
        </div>
      )}

      {/* Declaration & Signature */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <div style={{ 
          flex: 1, 
          border: `1px solid ${colors.primary}`, 
          padding: '5px', 
          fontSize: fontSizes.small,
          borderRadius: '3px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '2px', color: colors.primary }}>Declaration:</div>
          <div style={{ fontStyle: 'italic' }}>
            {declarationText || 'Certified that the particulars given above are true and correct.'}
          </div>
        </div>
        <div style={{ 
          width: '120px', 
          border: `1px solid ${colors.primary}`, 
          padding: '5px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '3px'
        }}>
          <div style={{ fontSize: fontSizes.small, fontWeight: 'bold', color: colors.primary }}>For {businessName}</div>
          <div style={{ marginTop: 'auto', fontSize: fontSizes.small }}>Authorised Signatory</div>
        </div>
      </div>

      {/* Terms & Conditions */}
      {termsConditions && termsConditions.length > 0 && (
        <div style={{ 
          border: `1px solid ${colors.primary}`, 
          padding: '5px', 
          fontSize: fontSizes.terms,
          borderRadius: '3px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px', color: colors.primary, fontSize: fontSizes.small }}>
            Terms & Conditions:
          </div>
          <ol style={{ margin: 0, paddingLeft: '15px', lineHeight: 1.4 }}>
            {termsConditions.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Custom Footer Text */}
      {customFooterText && (
        <div style={{ 
          textAlign: 'center', 
          marginTop: '6px', 
          fontSize: fontSizes.small, 
          color: colors.primary,
          fontWeight: 'bold'
        }}>
          {customFooterText}
        </div>
      )}
    </div>
  );
};
