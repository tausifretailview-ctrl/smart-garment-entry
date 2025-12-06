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

interface CompactTemplateProps {
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
  customerMobile?: string;
  salesman?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  qrCodeUrl?: string;
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

export const CompactTemplate: React.FC<CompactTemplateProps> = ({
  businessName,
  address,
  mobile,
  gstNumber,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerMobile,
  salesman,
  items,
  subtotal,
  discount,
  grandTotal,
  totalSavings = 0,
  showMRP = false,
  paymentMethod,
  cashAmount,
  cardAmount,
  upiAmount,
  paidAmount,
  qrCodeUrl,
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
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  };

  const width = format === 'a4' ? '210mm' : format === 'a5-horizontal' ? '210mm' : '148mm';
  const minHeight = format === 'a4' ? '297mm' : format === 'a5-horizontal' ? '148mm' : '210mm';

  const colorSchemes: Record<string, { primary: string; secondary: string; accent: string }> = {
    blue: { primary: '#1e40af', secondary: '#3b82f6', accent: '#dbeafe' },
    green: { primary: '#15803d', secondary: '#22c55e', accent: '#dcfce7' },
    purple: { primary: '#7e22ce', secondary: '#a855f7', accent: '#f3e8ff' },
    red: { primary: '#b91c1c', secondary: '#ef4444', accent: '#fee2e2' },
    orange: { primary: '#c2410c', secondary: '#f97316', accent: '#ffedd5' },
    teal: { primary: '#0d9488', secondary: '#14b8a6', accent: '#ccfbf1' },
    indigo: { primary: '#4338ca', secondary: '#6366f1', accent: '#e0e7ff' },
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
  const logoAlign = logoPlacement === 'center' ? 'center' : logoPlacement === 'right' ? 'right' : 'left';

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
      padding: '8mm',
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

      {/* Header with Gradient */}
      <div style={{ 
        textAlign: logoAlign, 
        marginBottom: '8px', 
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
        padding: '8px',
        borderRadius: '4px',
        color: 'white'
      }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>{businessName}</div>
        <div style={{ fontSize: '9px', lineHeight: '1.3', opacity: 0.9 }}>{address}</div>
        <div style={{ fontSize: '9px', opacity: 0.9 }}>Ph: {mobile} {gstNumber && `| GSTIN: ${gstNumber}`}</div>
      </div>

      {/* Invoice Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '9px' }}>
        <div>
          <strong>Bill No:</strong> {invoiceNumber}<br/>
          <strong>Customer:</strong> {customerName}
          {customerMobile && <><br/><strong>Mobile:</strong> {customerMobile}</>}
          {salesman && <><br/><strong>Salesman:</strong> {salesman}</>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
          {invoiceTime && <><strong>Time:</strong> {invoiceTime}</>}
        </div>
      </div>

      {/* Items Table - Compact */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '9px' }}>
        <thead>
          <tr style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, color: 'white' }}>
            <th style={{ textAlign: 'left', padding: '4px 2px' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '4px 2px', width: enableWholesaleGrouping ? '80px' : '35px' }}>
              {enableWholesaleGrouping ? 'Sizes' : 'Size'}
            </th>
            <th style={{ textAlign: 'center', padding: '4px 2px', width: '35px' }}>Qty</th>
            {showMRP && <th style={{ textAlign: 'right', padding: '4px 2px', width: '45px' }}>MRP</th>}
            <th style={{ textAlign: 'right', padding: '4px 2px', width: '50px' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '4px 2px', width: '55px' }}>Amount</th>
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
              <tr key={index} style={{ borderBottom: index === groupedItems.length - 1 ? `1px solid ${colors.primary}` : '1px dotted #ccc' }}>
                <td style={{ padding: '3px 2px' }}>
                  {item.particulars}
                  {wholesaleDetails.length > 0 && (
                    <div style={{ fontSize: '7px', color: colors.secondary }}>{wholesaleDetails.join(' | ')}</div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '3px 2px', fontSize: enableWholesaleGrouping ? '7px' : '9px' }}>
                  {enableWholesaleGrouping ? formatSizeQty(item.sizeQtyList) : item.sizeQtyList[0]?.size}
                </td>
                <td style={{ textAlign: 'center', padding: '3px 2px' }}>{item.totalQty}</td>
                {showMRP && (
                  <td style={{ textAlign: 'right', padding: '3px 2px' }}>
                    {items[index]?.mrp && items[index].mrp > item.rate ? (
                      <span style={{ textDecoration: 'line-through', color: '#999', fontSize: '8px' }}>{formatCurrency(items[index].mrp)}</span>
                    ) : (
                      <span>{formatCurrency(items[index]?.mrp || item.rate)}</span>
                    )}
                  </td>
                )}
                <td style={{ textAlign: 'right', padding: '3px 2px' }}>{formatCurrency(item.rate)}</td>
                <td style={{ textAlign: 'right', padding: '3px 2px', fontWeight: 'bold' }}>{formatCurrency(item.totalAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginBottom: '8px', fontSize: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span>Subtotal:</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
            <span>Discount:</span>
            <span>- {formatCurrency(discount)}</span>
          </div>
        )}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
          color: 'white',
          padding: '6px',
          borderRadius: '4px',
          marginTop: '4px',
          fontWeight: 'bold',
          fontSize: '12px'
        }}>
          <span>TOTAL:</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
        {totalSavings > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', color: '#155724', fontWeight: 'bold', fontSize: '10px' }}>
            <span>You Saved:</span>
            <span>{formatCurrency(totalSavings)}</span>
          </div>
        )}
      </div>

      {/* Payment Method */}
      {paymentMethod && (
        <div style={{ marginBottom: '8px', fontSize: '9px', textAlign: 'center' }}>
          <strong>Payment Mode:</strong> {paymentMethod.toUpperCase()}
          
          {/* Payment Breakdown for Mix Payment */}
          {paymentMethod === 'Mix Payment' && (
            <div style={{ marginTop: '6px', fontSize: '8px', textAlign: 'left', maxWidth: '200px', margin: '6px auto 0' }}>
              {cashAmount && cashAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Cash:</span>
                  <span style={{ fontWeight: 'bold' }}>₹{Math.round(cashAmount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {cardAmount && cardAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Card:</span>
                  <span style={{ fontWeight: 'bold' }}>₹{Math.round(cardAmount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {upiAmount && upiAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>UPI:</span>
                  <span style={{ fontWeight: 'bold' }}>₹{Math.round(upiAmount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {paidAmount && paidAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #ccc', fontWeight: 'bold' }}>
                  <span>Total Paid:</span>
                  <span>{formatCurrency(paidAmount)}</span>
                </div>
              )}
              {paidAmount !== undefined && paidAmount < grandTotal && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', color: '#f59e0b', fontWeight: 'bold' }}>
                  <span>Balance:</span>
                  <span>₹{Math.round(grandTotal - paidAmount).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QR Code */}
      {qrCodeUrl && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px' }} />
          <div style={{ fontSize: '8px', marginTop: '4px', color: colors.secondary }}>Scan to Pay</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        marginTop: '12px', 
        textAlign: 'center', 
        fontSize: '9px', 
        borderTop: `2px solid ${colors.primary}`, 
        paddingTop: '6px',
        color: colors.primary
      }}>
        <div style={{ fontWeight: 'bold' }}>{customFooterText || 'Thank You! Visit Again'}</div>
      </div>
    </div>
  );
};
