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
  salesman,
  notes,
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
    blue: { primary: '#1a365d', secondary: '#3182ce', accent: '#ebf8ff' },
    green: { primary: '#1c4532', secondary: '#38a169', accent: '#f0fff4' },
    purple: { primary: '#44337a', secondary: '#805ad5', accent: '#faf5ff' },
    red: { primary: '#742a2a', secondary: '#e53e3e', accent: '#fff5f5' },
    orange: { primary: '#7b341e', secondary: '#dd6b20', accent: '#fffaf0' },
    teal: { primary: '#234e52', secondary: '#319795', accent: '#e6fffa' },
    indigo: { primary: '#3c366b', secondary: '#667eea', accent: '#ebf4ff' },
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

  const isA4 = format === 'a4';
  const isHorizontal = format === 'a5-horizontal';
  const width = isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm';
  const minHeight = isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm';

  return (
    <div style={{
      width,
      minHeight,
      margin: '0 auto',
      padding: isA4 ? '20mm' : '12mm',
      fontFamily: font,
      fontSize: isA4 ? '10pt' : '9pt',
      backgroundColor: 'white',
      color: '#000'
    }}>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '11pt', fontWeight: 'bold', color: colors.primary }}>
          {customHeaderText}
        </div>
      )}

      {/* Minimal Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        paddingBottom: '20px',
        borderBottom: `2px solid ${colors.primary}`
      }}>
        <div>
          {logoUrl && logoPlacement === 'left' && (
            <img src={logoUrl} alt="Logo" style={{ height: '40px', marginBottom: '10px' }} />
          )}
          <div style={{ fontSize: isA4 ? '16pt' : '14pt', fontWeight: 'bold', marginBottom: '5px', color: colors.primary }}>{businessName}</div>
          <div style={{ fontSize: '9pt', color: '#555' }}>
            {address}<br />
            {mobile} {email && `| ${email}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {logoUrl && logoPlacement === 'right' && (
            <img src={logoUrl} alt="Logo" style={{ height: '40px', marginBottom: '10px' }} />
          )}
          <div style={{ fontSize: isA4 ? '24pt' : '18pt', fontWeight: 'bold', color: colors.primary }}>INVOICE</div>
          <div style={{ fontSize: '9pt', marginTop: '10px' }}>
            <strong>No:</strong> {invoiceNumber}<br />
            <strong>Date:</strong> {invoiceDate.toLocaleDateString('en-IN')}
          </div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ marginTop: '20px', marginBottom: '30px' }}>
        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '5px', color: colors.secondary }}>TO:</div>
        <div style={{ fontSize: '10pt' }}>
          <strong>{customerName}</strong><br />
          {customerMobile && <>Phone: {customerMobile}<br /></>}
          {salesman && <>Salesman: {salesman}</>}
        </div>
      </div>

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
        <thead>
          <tr style={{ borderTop: `2px solid ${colors.primary}`, borderBottom: `2px solid ${colors.primary}` }}>
            <th style={{ padding: '10px 0', textAlign: 'left', fontWeight: 'normal', color: colors.primary }}>Description</th>
            <th style={{ padding: '10px 0', textAlign: 'center', width: enableWholesaleGrouping ? '120px' : '60px', fontWeight: 'normal', color: colors.primary }}>
              {enableWholesaleGrouping ? 'Sizes' : 'Size'}
            </th>
            <th style={{ padding: '10px 0', textAlign: 'center', width: '60px', fontWeight: 'normal', color: colors.primary }}>Qty</th>
            {showMRP && <th style={{ padding: '10px 0', textAlign: 'right', width: '70px', fontWeight: 'normal', color: colors.primary }}>MRP</th>}
            <th style={{ padding: '10px 0', textAlign: 'right', width: '80px', fontWeight: 'normal', color: colors.primary }}>Rate</th>
            <th style={{ padding: '10px 0', textAlign: 'right', width: '100px', fontWeight: 'normal', color: colors.primary }}>Amount</th>
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
              <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px 0' }}>
                  <div>{item.particulars}</div>
                  {productDetails && (
                    <div style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>{productDetails}</div>
                  )}
                  {wholesaleDetails.length > 0 && (
                    <div style={{ fontSize: '8pt', color: colors.secondary, marginTop: '2px' }}>{wholesaleDetails.join(' | ')}</div>
                  )}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'center', fontSize: enableWholesaleGrouping ? '8pt' : '10pt' }}>
                  {enableWholesaleGrouping ? formatSizeQty(item.sizeQtyList) : item.sizeQtyList[0]?.size}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.totalQty}</td>
                {showMRP && (
                  <td style={{ padding: '10px 0', textAlign: 'right' }}>
                    {items[index]?.mrp && items[index].mrp > item.rate ? (
                      <span style={{ textDecoration: 'line-through', color: '#999' }}>₹{items[index].mrp.toFixed(2)}</span>
                    ) : (
                      <span>₹{(items[index]?.mrp || item.rate).toFixed(2)}</span>
                    )}
                  </td>
                )}
                <td style={{ padding: '10px 0', textAlign: 'right' }}>₹{item.rate.toFixed(2)}</td>
                <td style={{ padding: '10px 0', textAlign: 'right' }}>₹{item.totalAmount.toFixed(2)}</td>
              </tr>
            );
          })}
          {/* Empty rows to reach minimum */}
          {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, index) => (
            <tr key={`empty-${index}`} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '10px 0', height: '20px' }}>&nbsp;</td>
              <td style={{ padding: '10px 0' }}>&nbsp;</td>
              <td style={{ padding: '10px 0' }}>&nbsp;</td>
              {showMRP && <td style={{ padding: '10px 0' }}>&nbsp;</td>}
              <td style={{ padding: '10px 0' }}>&nbsp;</td>
              <td style={{ padding: '10px 0' }}>&nbsp;</td>
            </tr>
          ))}
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
            borderTop: `2px solid ${colors.primary}`,
            marginTop: '10px',
            fontSize: '12pt',
            fontWeight: 'bold',
            color: colors.primary
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
        <div style={{ marginBottom: '30px', fontSize: '9pt', color: colors.secondary }}>
          <strong>Payment:</strong> {paymentMethod}
        </div>
      )}

      {/* Notes Section */}
      {notes && (
        <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff9e6', borderLeft: `3px solid ${colors.primary}`, borderRadius: '4px' }}>
          <strong style={{ color: colors.primary }}>Note:</strong> <span style={{ fontStyle: 'italic', fontSize: '9pt' }}>{notes}</span>
        </div>
      )}

      {/* Terms */}
      {termsConditions && termsConditions.length > 0 && (
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: `1px solid ${colors.accent}` }}>
          <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '8px', color: colors.primary }}>Terms & Conditions:</div>
          <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '8pt', color: '#555', lineHeight: '1.5' }}>
            {termsConditions.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        marginTop: '30px',
        textAlign: 'center',
        fontSize: '8pt',
        color: colors.secondary
      }}>
        {customFooterText || 'Thank you for your business'}
      </div>
    </div>
  );
};
