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
  salesman?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  totalTax: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
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
  // Wholesale mode props
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
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
  salesman,
  items,
  subtotal,
  discount,
  taxableAmount,
  totalTax,
  grandTotal,
  totalSavings = 0,
  showMRP = false,
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
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const width = format === 'a4' ? '210mm' : format === 'a5-horizontal' ? '210mm' : '148mm';
  const minHeight = format === 'a4' ? '297mm' : format === 'a5-horizontal' ? '148mm' : '210mm';

  const colorSchemes: Record<string, { primary: string; secondary: string; accent: string }> = {
    blue: { primary: '#1e40af', secondary: '#3b82f6', accent: '#dbeafe' },
    green: { primary: '#15803d', secondary: '#22c55e', accent: '#dcfce7' },
    purple: { primary: '#7c3aed', secondary: '#a78bfa', accent: '#f3e8ff' },
    red: { primary: '#dc2626', secondary: '#f87171', accent: '#fee2e2' },
    orange: { primary: '#ea580c', secondary: '#fb923c', accent: '#ffedd5' },
    teal: { primary: '#0d9488', secondary: '#2dd4bf', accent: '#ccfbf1' },
    indigo: { primary: '#4f46e5', secondary: '#818cf8', accent: '#e0e7ff' },
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
  const logoAlign = logoPlacement === 'center' ? 'center' : logoPlacement === 'right' ? 'flex-end' : 'flex-start';

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

  return (
    <div style={{
      width,
      minHeight,
      maxHeight: minHeight,
      margin: '0 auto',
      padding: '10mm',
      backgroundColor: 'white',
      fontFamily: font,
      fontSize: '10px',
      color: '#000',
      overflow: 'hidden'
    }}>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '11px', fontWeight: 'bold', color: colors.primary }}>
          {customHeaderText}
        </div>
      )}

      {/* Header with Logo and Gradient */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '10px', 
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
        padding: '12px',
        borderRadius: '6px',
        color: 'white'
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: logoAlign }}>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '6px' }} />
          )}
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '3px', textAlign: logoPlacement }}>{businessName}</div>
          <div style={{ fontSize: '9px', lineHeight: '1.4', maxWidth: '80%', textAlign: logoPlacement, opacity: 0.9 }}>
            {address}<br/>
            Mobile: {mobile} {email && `| Email: ${email}`}<br/>
            {gstNumber && `GSTIN: ${gstNumber}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>INVOICE</div>
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.9 }}>
            <strong>No:</strong> {invoiceNumber}<br/>
            <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
            {invoiceTime && <><strong>Time:</strong> {invoiceTime}</>}
          </div>
        </div>
      </div>

      {/* Bill To Section */}
      <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: colors.accent, border: `1px solid ${colors.primary}20`, borderRadius: '4px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: colors.primary }}>BILL TO:</div>
        <div style={{ fontSize: '10px', lineHeight: '1.5' }}>
          <strong>{customerName}</strong><br/>
          {customerAddress && <>{customerAddress}<br/></>}
          {customerMobile && <>Mobile: {customerMobile}<br/></>}
          {customerGSTIN && <>GSTIN: {customerGSTIN}<br/></>}
          {salesman && <>Salesman: {salesman}</>}
        </div>
      </div>

      {/* Detailed Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '9px' }}>
        <thead>
          <tr style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, color: 'white' }}>
            <th style={{ textAlign: 'left', padding: '5px 4px', border: '1px solid #ddd' }}>Sr</th>
            <th style={{ textAlign: 'left', padding: '5px 4px', border: '1px solid #ddd' }}>Product Details</th>
            <th style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd' }}>
              {enableWholesaleGrouping ? 'Sizes' : 'Size'}
            </th>
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Qty</th>
            {showMRP && <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>MRP</th>}
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groupedItems.map((item, index) => {
            const wholesaleDetails: string[] = [];
            if (enableWholesaleGrouping) {
              if (showProductColor && item.color) wholesaleDetails.push(`Color: ${item.color}`);
              if (showProductBrand && item.brand) wholesaleDetails.push(`Brand: ${item.brand}`);
              if (showProductStyle && item.style) wholesaleDetails.push(`Style: ${item.style}`);
            }
            return (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#fff' : colors.accent }}>
                <td style={{ padding: '5px 4px', border: '1px solid #ddd' }}>{index + 1}</td>
                <td style={{ padding: '5px 4px', border: '1px solid #ddd' }}>
                  <div style={{ fontWeight: 'bold' }}>{item.particulars}</div>
                  {!enableWholesaleGrouping && (
                    <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
                      {items[index]?.brand && `Brand: ${items[index].brand}`}
                      {items[index]?.category && ` | Category: ${items[index].category}`}
                      {items[index]?.color && ` | Color: ${items[index].color}`}
                      {items[index]?.style && ` | Style: ${items[index].style}`}
                    </div>
                  )}
                  {wholesaleDetails.length > 0 && (
                    <div style={{ fontSize: '8px', color: colors.secondary, marginTop: '2px' }}>{wholesaleDetails.join(' | ')}</div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '5px 4px', border: '1px solid #ddd', fontSize: enableWholesaleGrouping ? '8px' : '9px' }}>
                  {enableWholesaleGrouping ? formatSizeQty(item.sizeQtyList) : item.sizeQtyList[0]?.size}
                </td>
                <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>{item.totalQty}</td>
                {showMRP && (
                  <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>
                    {items[index]?.mrp && items[index].mrp > item.rate ? (
                      <span style={{ textDecoration: 'line-through', color: '#999' }}>{formatCurrency(items[index].mrp)}</span>
                    ) : (
                      <span>{formatCurrency(items[index]?.mrp || item.rate)}</span>
                    )}
                  </td>
                )}
                <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd' }}>{formatCurrency(item.rate)}</td>
                <td style={{ textAlign: 'right', padding: '5px 4px', border: '1px solid #ddd', fontWeight: 'bold' }}>{formatCurrency(item.totalAmount)}</td>
              </tr>
            );
          })}
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
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '6px 8px', 
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            color: 'white', 
            fontWeight: 'bold', 
            fontSize: '11px',
            borderRadius: '4px'
          }}>
            <span>GRAND TOTAL:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
          {totalSavings > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#d4edda', color: '#155724', fontWeight: 'bold', fontSize: '10px' }}>
              <span>You Saved:</span>
              <span>{formatCurrency(totalSavings)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Info */}
      {paymentMethod && (
        <div style={{ marginBottom: '10px', padding: '6px 8px', backgroundColor: colors.accent, border: `1px solid ${colors.primary}20`, fontSize: '9px', borderRadius: '4px' }}>
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
              <div style={{ fontWeight: 'bold', marginBottom: '3px', color: colors.primary }}>Terms & Conditions:</div>
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
            <div style={{ fontSize: '7px', marginTop: '2px', color: colors.secondary }}>Scan to Pay</div>
          </div>
        )}
      </div>

      {declarationText && (
        <div style={{ fontSize: '8px', fontStyle: 'italic', marginBottom: '8px', color: '#666' }}>
          {declarationText}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `2px solid ${colors.primary}`, paddingTop: '8px', fontSize: '9px' }}>
        <div>
          <div style={{ fontWeight: 'bold', color: colors.primary }}>{customFooterText || 'Thank You for Your Business!'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold' }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};
