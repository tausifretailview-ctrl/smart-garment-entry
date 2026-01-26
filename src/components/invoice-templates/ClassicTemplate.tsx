import React from 'react';

interface ClassicTemplateProps {
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
  customerGSTIN?: string;
  salesman?: string;
  notes?: string;
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
  saleReturnAdjust?: number;
  totalTax: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  termsConditions?: string[];
  productDetailsSettings?: {
    show_brand?: boolean;
    show_category?: boolean;
    show_color?: boolean;
    show_style?: boolean;
    show_hsn_code?: boolean;
  };
  // New customization props
  fontFamily?: string;
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: 'left' | 'center' | 'right';
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  // Wholesale mode props
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
  minItemRows?: number;
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

export const ClassicTemplate: React.FC<ClassicTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerMobile,
  customerGSTIN,
  salesman,
  notes,
  items,
  subtotal,
  discount,
  saleReturnAdjust = 0,
  totalTax,
  grandTotal,
  totalSavings = 0,
  showMRP = false,
  paymentMethod,
  cashAmount = 0,
  cardAmount = 0,
  upiAmount = 0,
  paidAmount = 0,
  termsConditions,
  productDetailsSettings,
  fontFamily = 'inter',
  colorScheme = 'blue',
  customHeaderText,
  customFooterText,
  logoPlacement = 'left',
  format = 'a4',
  enableWholesaleGrouping = false,
  sizeDisplayFormat = 'size/qty',
  showProductColor = true,
  showProductBrand = false,
  showProductStyle = false,
  minItemRows = 8,
}) => {
  const colorSchemes: Record<string, { primary: string; secondary: string; accent: string }> = {
    blue: { primary: '#2c3e50', secondary: '#3498db', accent: '#ecf0f1' },
    green: { primary: '#1e8449', secondary: '#27ae60', accent: '#d5f5e3' },
    purple: { primary: '#6c3483', secondary: '#8e44ad', accent: '#f5eef8' },
    red: { primary: '#922b21', secondary: '#c0392b', accent: '#fadbd8' },
    orange: { primary: '#d35400', secondary: '#e67e22', accent: '#fdebd0' },
    teal: { primary: '#148f77', secondary: '#1abc9c', accent: '#d1f2eb' },
    indigo: { primary: '#4a235a', secondary: '#7d3c98', accent: '#ebdef0' },
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
    georgia: "'Georgia', serif",
  };

  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.georgia;

  const formatProductDetails = (item: any) => {
    const details: string[] = [];
    if (productDetailsSettings?.show_brand && item.brand) details.push(item.brand);
    if (productDetailsSettings?.show_category && item.category) details.push(item.category);
    if (productDetailsSettings?.show_color && item.color) details.push(item.color);
    if (productDetailsSettings?.show_style && item.style) details.push(item.style);
    return details.length > 0 ? details.join(' | ') : '';
  };

  // Group items for wholesale display
  const groupItems = (items: any[]): GroupedItem[] => {
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
      const key = `${item.particulars}-${item.color || ''}-${item.rate}`;
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

  const isA4 = format === 'a4';
  const isHorizontal = format === 'a5-horizontal';
  const width = isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm';
  const minHeight = isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm';

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${format === 'a4' ? 'A4' : format === 'a5-horizontal' ? 'A5 landscape' : 'A5'} portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .classic-invoice-container {
            width: ${width} !important;
            min-height: ${minHeight} !important;
            margin: 0 !important;
            padding: 10mm !important;
            page-break-after: avoid;
            transform: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      <div className="classic-invoice-container" style={{
        width,
        minHeight,
        margin: '0 auto',
        padding: isA4 ? '15mm' : '10mm',
        fontFamily: font,
        fontSize: isA4 ? '11pt' : '9pt',
        backgroundColor: 'white',
        color: '#333'
      }}>
        {/* Custom Header Text */}
        {customHeaderText && (
          <div style={{ textAlign: 'center', marginBottom: '10px', fontSize: '12pt', fontWeight: 'bold', color: colors.primary }}>
            {customHeaderText}
          </div>
        )}

        {/* Header with Gradient */}
        <div style={{ 
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
          padding: '15px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '4px'
        }}>
          <div style={{ flex: 1, color: 'white' }}>
            {logoUrl && logoPlacement === 'left' && (
              <img src={logoUrl} alt="Logo" style={{ height: '50px', marginBottom: '10px' }} />
            )}
            <h1 style={{ margin: 0, fontSize: isA4 ? '22pt' : '18pt', color: 'white' }}>{businessName}</h1>
            <p style={{ margin: '5px 0', fontSize: isA4 ? '9pt' : '8pt', color: 'rgba(255,255,255,0.9)' }}>
              {address}<br />
              {mobile} {email && `| ${email}`}
            </p>
          </div>
          <div style={{ textAlign: 'right', color: 'white' }}>
            {logoUrl && logoPlacement === 'right' && (
              <img src={logoUrl} alt="Logo" style={{ height: '50px', marginBottom: '10px' }} />
            )}
            <h2 style={{ margin: 0, fontSize: isA4 ? '16pt' : '14pt', color: 'white' }}>INVOICE</h2>
            <p style={{ margin: '5px 0', fontSize: isA4 ? '10pt' : '8pt' }}>
              <strong>Invoice #:</strong> {invoiceNumber}<br />
              <strong>Date:</strong> {invoiceDate.toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>

        {/* Customer Info */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: colors.accent, border: `1px solid ${colors.primary}20`, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: isA4 ? '12pt' : '10pt', color: colors.primary }}>Bill To:</h3>
            <p style={{ margin: 0 }}>
              <strong>{customerName}</strong><br />
              {customerMobile && <>Phone: {customerMobile}<br /></>}
              {customerGSTIN && <><strong>GSTIN:</strong> {customerGSTIN}</>}
            </p>
          </div>
          {salesman && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: isA4 ? '10pt' : '8pt' }}>
                <strong>Salesman:</strong> {salesman}
              </p>
            </div>
          )}
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, color: 'white' }}>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: `2px solid ${colors.primary}` }}>Sr.</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: `2px solid ${colors.primary}` }}>Description</th>
              <th style={{ padding: '10px', textAlign: 'center', borderBottom: `2px solid ${colors.primary}` }}>
                {enableWholesaleGrouping ? 'Sizes' : 'Size'}
              </th>
              <th style={{ padding: '10px', textAlign: 'right', borderBottom: `2px solid ${colors.primary}` }}>Qty</th>
              {showMRP && <th style={{ padding: '10px', textAlign: 'right', borderBottom: `2px solid ${colors.primary}` }}>MRP</th>}
              <th style={{ padding: '10px', textAlign: 'right', borderBottom: `2px solid ${colors.primary}` }}>Rate</th>
              <th style={{ padding: '10px', textAlign: 'right', borderBottom: `2px solid ${colors.primary}` }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.map((item, index) => {
              const productDetails = !enableWholesaleGrouping ? formatProductDetails(items[index]) : '';
              const wholesaleDetails: string[] = [];
              if (enableWholesaleGrouping) {
                if (showProductColor && item.color) wholesaleDetails.push(item.color);
                if (showProductBrand && item.brand) wholesaleDetails.push(item.brand);
                if (showProductStyle && item.style) wholesaleDetails.push(item.style);
              }
              return (
                <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '10px' }}>{index + 1}</td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 500 }}>{item.particulars}</div>
                    {productDetails && (
                      <div style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>{productDetails}</div>
                    )}
                    {wholesaleDetails.length > 0 && (
                      <div style={{ fontSize: '8pt', color: colors.secondary, marginTop: '2px' }}>{wholesaleDetails.join(' | ')}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontSize: enableWholesaleGrouping ? '8pt' : '10pt' }}>
                    {enableWholesaleGrouping ? formatSizeQty(item.sizeQtyList) : item.sizeQtyList[0]?.size}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{item.totalQty}</td>
                  {showMRP && (
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      ₹{(items[index]?.mrp || item.rate).toFixed(2)}
                    </td>
                  )}
                  <td style={{ padding: '10px', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>₹{item.totalAmount.toFixed(2)}</td>
                </tr>
              );
            })}
            {/* Empty rows to reach minimum */}
            {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, index) => (
              <tr key={`empty-${index}`} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '10px', height: '20px' }}>&nbsp;</td>
                <td style={{ padding: '10px' }}>&nbsp;</td>
                <td style={{ padding: '10px' }}>&nbsp;</td>
                <td style={{ padding: '10px' }}>&nbsp;</td>
                {showMRP && <td style={{ padding: '10px' }}>&nbsp;</td>}
                <td style={{ padding: '10px' }}>&nbsp;</td>
                <td style={{ padding: '10px' }}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <div style={{ width: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                <span>Discount:</span>
                <span>- ₹{discount.toFixed(2)}</span>
              </div>
            )}
            {saleReturnAdjust > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6', color: '#d97706' }}>
                <span>S/R Adjust:</span>
                <span>- ₹{saleReturnAdjust.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #dee2e6' }}>
              <span>GST:</span>
              <span>₹{totalTax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, color: 'white', fontWeight: 'bold' }}>
              <span>Total Amount:</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
            {totalSavings > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', backgroundColor: '#d4edda', color: '#155724', fontWeight: 'bold' }}>
                <span>You Saved:</span>
                <span>₹{totalSavings.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        {paymentMethod && (
          <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: colors.accent, borderLeft: `4px solid ${colors.primary}` }}>
            <strong>Payment Mode:</strong> {paymentMethod}
            {paymentMethod === 'multiple' && (
              <div style={{ marginTop: '8px', fontSize: '9pt' }}>
                {cashAmount > 0 && <div>Cash: ₹{Math.round(cashAmount).toLocaleString('en-IN')}</div>}
                {cardAmount > 0 && <div>Card: ₹{Math.round(cardAmount).toLocaleString('en-IN')}</div>}
                {upiAmount > 0 && <div>UPI: ₹{Math.round(upiAmount).toLocaleString('en-IN')}</div>}
                <div style={{ marginTop: '5px', fontWeight: 'bold' }}>
                  Total Paid: ₹{Math.round(paidAmount).toLocaleString('en-IN')}
                </div>
                {grandTotal > paidAmount && (
                  <div style={{ color: '#c0392b', fontWeight: 'bold' }}>
                    Balance: ₹{Math.round(grandTotal - paidAmount).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes Section */}
        {notes && (
          <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff9e6', borderLeft: `4px solid ${colors.primary}`, borderRadius: '4px' }}>
            <strong style={{ color: colors.primary }}>Note:</strong> <span style={{ fontStyle: 'italic' }}>{notes}</span>
          </div>
        )}

        {/* Terms */}
        {termsConditions && termsConditions.length > 0 && (
          <div style={{ marginTop: '30px', borderTop: '1px solid #dee2e6', paddingTop: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '11pt', color: colors.primary }}>Terms & Conditions:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '9pt', color: '#666' }}>
              {termsConditions.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '9pt', color: colors.secondary }}>
          <p style={{ margin: 0 }}>{customFooterText || 'Thank you for your business!'}</p>
        </div>
      </div>
    </>
  );
};
