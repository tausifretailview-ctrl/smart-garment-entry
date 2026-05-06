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
  minItemRows?: number;
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
  // Wholesale mode props
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
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
  minItemRows = 8,
  paymentMethod,
  declarationText,
  termsConditions,
  bankDetails,
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
  const logoAlign = logoPlacement === 'center' ? 'center' : logoPlacement === 'right' ? 'right' : 'left';
  const pageSizeCss =
    format === 'a4' ? 'A4 portrait' : format === 'a5-horizontal' ? 'A5 landscape' : 'A5 portrait';
  const pageMarginCss = format === 'a4' ? '10mm' : '8mm';

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
    <div
      className="tax-invoice-template-root"
      style={{
      width,
      minHeight,
      margin: '0 auto',
      padding: '10mm',
      backgroundColor: 'white',
      fontFamily: font,
      fontSize: '9px',
      color: '#000',
      border: '1px solid #000',
      boxSizing: 'border-box',
    }}>
      <style>
        {`
          @media print {
            @page {
              size: ${pageSizeCss};
              margin: ${pageMarginCss};
            }
            .tax-invoice-template-root {
              min-height: 0 !important;
              height: auto !important;
              page-break-before: avoid !important;
              break-before: avoid !important;
            }
            .tax-invoice-items-table {
              page-break-inside: auto;
            }
            .tax-invoice-items-table thead {
              display: table-header-group;
            }
            .tax-invoice-items-table tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            .tax-invoice-totals-section {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            /* Remove gradients for clean print */
            [style*="linear-gradient"] {
              background: #f5f5f5 !important;
            }
            /* Ensure black borders and text */
            table, th, td {
              border: 1px solid #000 !important;
              color: black !important;
            }
          }
        `}
      </style>
      {/* Custom Header Text */}
      {customHeaderText && (
        <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '10px', fontWeight: 'bold', color: colors.primary }}>
          {customHeaderText}
        </div>
      )}

      {/* Header with Gradient */}
      <div style={{ 
        textAlign: logoAlign, 
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
        padding: '10px',
        marginBottom: '8px',
        borderRadius: '4px',
        color: 'white'
      }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{grandTotal < 0 ? 'CREDIT NOTE' : 'TAX INVOICE'}</div>
        {logoUrl && (
          <img src={logoUrl} alt="Logo" style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '4px' }} />
        )}
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '3px' }}>{businessName}</div>
        <div style={{ fontSize: '9px', lineHeight: '1.4', opacity: 0.9 }}>
          {address}<br/>
          Phone: {mobile} {email && `| Email: ${email}`}<br/>
          <strong>GSTIN: {gstNumber || 'N/A'}</strong>
        </div>
      </div>

      {/* Invoice Details & Customer Info */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', border: `1px solid ${colors.primary}` }}>
        <div style={{ flex: 1, padding: '6px', borderRight: `1px solid ${colors.primary}` }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px', textDecoration: 'underline', color: colors.primary }}>Invoice Details:</div>
          <div style={{ lineHeight: '1.5' }}>
            <strong>Invoice No:</strong> {invoiceNumber}<br/>
            <strong>Date:</strong> {formatDate(invoiceDate)}<br/>
            {invoiceTime && <><strong>Time:</strong> {invoiceTime}<br/></>}
            {paymentMethod && <><strong>Payment:</strong> {paymentMethod.toUpperCase()}</>}
          </div>
        </div>
        <div style={{ flex: 1, padding: '6px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px', textDecoration: 'underline', color: colors.primary }}>Bill To:</div>
          <div style={{ lineHeight: '1.5' }}>
            <strong>{customerName}</strong><br/>
            {customerAddress && <>{customerAddress}<br/></>}
            {customerMobile && <>Phone: {customerMobile}<br/></>}
            {customerGSTIN && <><strong>GSTIN:</strong> {customerGSTIN}<br/></>}
            {salesman && <><strong>Salesman:</strong> {salesman}</>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="tax-invoice-items-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '8px', border: `1px solid ${colors.primary}` }}>
        <thead>
          <tr style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`, color: 'white' }}>
            <th style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}`, width: '25px' }}>Sr</th>
            <th style={{ textAlign: 'left', padding: '4px', border: `1px solid ${colors.primary}` }}>Description</th>
            <th style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}`, width: enableWholesaleGrouping ? '80px' : '40px' }}>
              {enableWholesaleGrouping ? 'Sizes' : 'HSN'}
            </th>
            <th style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}`, width: '30px' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}`, width: '45px' }}>MRP</th>
            <th style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}`, width: '50px' }}>Rate</th>
            <th style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}`, width: '60px' }}>Amount</th>
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
                <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}` }}>{index + 1}</td>
                <td style={{ padding: '4px', border: `1px solid ${colors.primary}` }}>
                  {item.particulars}
                  {!enableWholesaleGrouping && items[index]?.size && ` (${items[index].size})`}
                  {wholesaleDetails.length > 0 && (
                    <div style={{ fontSize: '7px', color: colors.secondary }}>{wholesaleDetails.join(' | ')}</div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}`, fontSize: enableWholesaleGrouping ? '7px' : '8px' }}>
                  {enableWholesaleGrouping ? formatSizeQty(item.sizeQtyList) : items[index]?.hsn}
                </td>
                <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}` }}>{item.totalQty}</td>
                <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}` }}>
                  {formatCurrency(items[index]?.mrp || item.rate)}
                </td>
                <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}` }}>{formatCurrency(item.rate)}</td>
                <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}`, fontWeight: 'bold' }}>{formatCurrency(item.totalAmount)}</td>
              </tr>
            );
          })}
          {/* Empty rows to reach minimum */}
          {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, index) => (
            <tr key={`empty-${index}`}>
              <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}`, height: '18px' }}>&nbsp;</td>
              <td style={{ padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ textAlign: 'center', padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
              <td style={{ textAlign: 'right', padding: '4px', border: `1px solid ${colors.primary}` }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tax Breakdown & Totals */}
      <div className="tax-invoice-totals-section" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        {/* Tax Calculation Box */}
        <div style={{ flex: 1, border: `1px solid ${colors.primary}`, padding: '6px', fontSize: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', textAlign: 'center', textDecoration: 'underline', color: colors.primary }}>TAX CALCULATION</div>
          <table style={{ width: '100%', fontSize: '8px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.primary}` }}>
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
              <tr style={{ borderTop: `1px solid ${colors.primary}`, fontWeight: 'bold' }}>
                <td colSpan={2} style={{ padding: '2px' }}>Total Tax</td>
                <td style={{ textAlign: 'right', padding: '2px' }}>{formatCurrency(totalTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount Summary */}
        <div style={{ width: '45%', border: `1px solid ${colors.primary}`, padding: '6px', fontSize: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Sub Total:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Total Discount:</span>
            <span>- {formatCurrency(discount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
            <span>Taxable Amt:</span>
            <span>{formatCurrency(taxableAmount)}</span>
          </div>
          {cgstAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>CGST:</span>
              <span>{formatCurrency(cgstAmount)}</span>
            </div>
          )}
          {sgstAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>SGST:</span>
              <span>{formatCurrency(sgstAmount)}</span>
            </div>
          )}
          {igstAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
              <span>IGST:</span>
              <span>{formatCurrency(igstAmount)}</span>
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
            padding: '4px 0', 
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            color: 'white',
            marginTop: '4px', 
            fontWeight: 'bold', 
            fontSize: '11px',
            borderRadius: '4px',
            paddingLeft: '4px',
            paddingRight: '4px'
          }}>
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
        <div style={{ border: `1px solid ${colors.primary}`, padding: '6px', marginBottom: '8px', fontSize: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px', color: colors.primary }}>Bank Details:</div>
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
            <strong style={{ color: colors.primary }}>Terms & Conditions:</strong>
            <ul style={{ margin: '2px 0', paddingLeft: '15px', lineHeight: '1.4' }}>
              {termsConditions.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${colors.primary}`, paddingTop: '6px', fontSize: '9px' }}>
        <div>
          <div style={{ fontWeight: 'bold', color: colors.primary }}>For {businessName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginTop: '15px', borderTop: `1px solid ${colors.primary}`, paddingTop: '2px' }}>Authorized Signatory</div>
        </div>
      </div>

      {/* Footer Note */}
      <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '7px', fontStyle: 'italic', color: colors.secondary }}>
        {customFooterText || 'This is a computer-generated invoice and does not require a physical signature'}
      </div>
    </div>
  );
};
