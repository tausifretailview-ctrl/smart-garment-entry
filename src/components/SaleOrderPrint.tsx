import React from 'react';

interface SaleOrderItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  orderQty: number;
  fulfilledQty: number;
  pendingQty: number;
  rate: number;
  mrp: number;
  discountPercent: number;
  total: number;
  color?: string;
  brand?: string;
  style?: string;
}

interface SaleOrderPrintProps {
  // Business Details
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  
  // Order Details
  orderNumber: string;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  quotationNumber?: string;
  salesman?: string;
  
  // Customer Details
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerEmail?: string;
  customerGSTIN?: string;
  
  // Items
  items: SaleOrderItem[];
  
  // Amounts
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  roundOff: number;
  netAmount: number;
  
  // Status
  status: string;
  
  // Optional
  termsConditions?: string;
  notes?: string;
  shippingAddress?: string;
  showHSN?: boolean;
  showBarcode?: boolean;
  showMRP?: boolean;
  showColor?: boolean;
  showFulfillmentStatus?: boolean;
  taxType?: string;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  invoiceFormat?: 'standard' | 'wholesale-size-grouping';
}

export const SaleOrderPrint = React.forwardRef<HTMLDivElement, SaleOrderPrintProps>(
  (props, ref) => {
    const {
      businessName,
      address,
      orderNumber,
      orderDate,
      salesman,
      customerName,
      customerAddress,
      items,
      netAmount,
      format = 'a5-vertical',
      showMRP = true,
      showColor = true,
      invoiceFormat = 'standard',
    } = props;

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount: number) => {
      return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const totalOrderQty = items.reduce((sum, item) => sum + item.orderQty, 0);
    
    const isA4 = format === 'a4';
    const isHorizontal = format === 'a5-horizontal';

    // Calculate items per page based on format - maximized for more rows
    const getItemsPerPage = () => {
      if (isA4) return 35;
      if (isHorizontal) return 18;
      return 28; // A5 vertical - increased from 18
    };

    const itemsPerPage = getItemsPerPage();
    const totalPages = Math.ceil(items.length / itemsPerPage);

    // Split items into pages
    const pages: SaleOrderItem[][] = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
      pages.push(items.slice(i, i + itemsPerPage));
    }

    // If no items, still show one page
    if (pages.length === 0) {
      pages.push([]);
    }

    // Group items by product for wholesale size grouping format
    const groupedItems = React.useMemo(() => {
      if (invoiceFormat !== 'wholesale-size-grouping') return null;
      
      const groups: Map<string, {
        productName: string;
        brand?: string;
        style?: string;
        color?: string;
        rate: number;
        mrp: number;
        sizes: Map<string, { qty: number; total: number }>;
        totalQty: number;
        totalAmount: number;
      }> = new Map();
      
      items.forEach(item => {
        const key = `${item.particulars}-${item.color || ''}-${item.rate}`;
        if (!groups.has(key)) {
          groups.set(key, {
            productName: item.particulars,
            brand: item.brand,
            style: item.style,
            color: item.color,
            rate: item.rate,
            mrp: item.mrp,
            sizes: new Map(),
            totalQty: 0,
            totalAmount: 0,
          });
        }
        const group = groups.get(key)!;
        const currentSize = group.sizes.get(item.size) || { qty: 0, total: 0 };
        group.sizes.set(item.size, {
          qty: currentSize.qty + item.orderQty,
          total: currentSize.total + item.total,
        });
        group.totalQty += item.orderQty;
        group.totalAmount += item.total;
      });
      
      return Array.from(groups.values());
    }, [items, invoiceFormat]);

    // Get unique sizes for wholesale format
    const uniqueSizes = React.useMemo(() => {
      if (invoiceFormat !== 'wholesale-size-grouping') return [];
      const sizes = new Set<string>();
      items.forEach(item => sizes.add(item.size));
      return Array.from(sizes).sort();
    }, [items, invoiceFormat]);

    const renderPage = (pageItems: SaleOrderItem[], pageIndex: number) => {
      const isLastPage = pageIndex === pages.length - 1;
      
      return (
        <div 
          key={pageIndex}
          className="sale-order-page"
          style={{
            width: isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm',
            minHeight: isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm',
            padding: isA4 ? '6mm' : isHorizontal ? '5mm' : '3mm',
            fontFamily: 'Arial, sans-serif',
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            backgroundColor: 'white',
            color: 'black',
            boxSizing: 'border-box',
            pageBreakAfter: isLastPage ? 'auto' : 'always',
          }}
        >
          {/* Compact Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: isA4 ? '5px' : '4px',
            borderBottom: '1.5px solid #000',
            paddingBottom: isA4 ? '4px' : '3px',
          }}>
            <h1 style={{
              fontSize: isA4 ? '14pt' : isHorizontal ? '12pt' : '11pt',
              fontWeight: 'bold',
              margin: '0',
              textTransform: 'uppercase',
            }}>
              {businessName}
            </h1>
            <p style={{ 
              fontSize: isA4 ? '7pt' : '6pt', 
              margin: '1px 0 0 0',
              lineHeight: 1.2 
            }}>
              {address}
            </p>
          </div>

          {/* Info Row - Customer & Order Details */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: isA4 ? '5px' : '4px',
            fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '6.5pt',
            borderBottom: '1px solid #999',
            paddingBottom: isA4 ? '4px' : '3px',
          }}>
            {/* Left - Customer */}
            <div style={{ flex: 1 }}>
              <div>
                <strong>Customer:</strong> {customerName}
              </div>
              {customerAddress && (
                <div style={{ 
                  fontSize: isA4 ? '7pt' : '6pt',
                  color: '#333',
                  marginTop: '1px',
                  maxWidth: '65%',
                  lineHeight: 1.1
                }}>
                  {customerAddress}
                </div>
              )}
            </div>
            
            {/* Right - Order Info */}
            <div style={{ textAlign: 'right', fontSize: isA4 ? '8pt' : '6.5pt' }}>
              <div><strong>Date:</strong> {formatDate(orderDate)}</div>
              <div><strong>Order No:</strong> {orderNumber}</div>
              {salesman && <div><strong>Salesman:</strong> {salesman}</div>}
              {totalPages > 1 && (
                <div style={{ fontSize: isA4 ? '7pt' : '6pt', color: '#666' }}>
                  Page {pageIndex + 1}/{totalPages}
                </div>
              )}
            </div>
          </div>

          {/* Items Table - Compact */}
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '6.5pt',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#e8e8e8' }}>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '5%', fontWeight: 'bold' }}>Sr</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
                {showColor && (
                  <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '10%', fontWeight: 'bold' }}>Color</th>
                )}
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '10%', fontWeight: 'bold' }}>Size</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '7%', fontWeight: 'bold' }}>Qty</th>
                {showMRP && (
                  <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '10%', fontWeight: 'bold', textAlign: 'right' }}>MRP</th>
                )}
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '12%', fontWeight: 'bold', textAlign: 'right' }}>Rate</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '13%', fontWeight: 'bold', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => {
                const details = [item.brand, item.style].filter(Boolean).join(' | ');
                return (
                  <tr key={item.sr}>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.sr}</td>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'left' }}>
                      {item.particulars}
                      {details && <span style={{ color: '#555', marginLeft: '3px', fontSize: '90%' }}>({details})</span>}
                    </td>
                    {showColor && (
                      <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.color || '-'}</td>
                    )}
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center', fontWeight: 'bold' }}>{item.size}</td>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{item.orderQty}</td>
                    {showMRP && (
                      <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(item.mrp)}</td>
                    )}
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(item.rate)}</td>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Simple Footer - Only on last page */}
          {isLastPage && (
            <div style={{
              marginTop: isA4 ? '6px' : '4px',
              paddingTop: isA4 ? '5px' : '3px',
              borderTop: '1.5px solid #000',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: isA4 ? '30px' : '15px',
              fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7.5pt',
              fontWeight: 'bold',
            }}>
              <div>
                Total Qty: <span style={{ minWidth: '40px', display: 'inline-block', textAlign: 'right' }}>{totalOrderQty}</span>
              </div>
              <div>
                Total Amount: <span style={{ minWidth: '70px', display: 'inline-block', textAlign: 'right' }}>{formatCurrency(netAmount)}</span>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Render wholesale size grouping format
    const renderWholesalePage = () => {
      if (!groupedItems) return null;
      
      return (
        <div 
          className="sale-order-page"
          style={{
            width: isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm',
            minHeight: isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm',
            padding: isA4 ? '6mm' : isHorizontal ? '5mm' : '3mm',
            fontFamily: 'Arial, sans-serif',
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            backgroundColor: 'white',
            color: 'black',
            boxSizing: 'border-box',
          }}
        >
          {/* Compact Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: isA4 ? '5px' : '4px',
            borderBottom: '1.5px solid #000',
            paddingBottom: isA4 ? '4px' : '3px',
          }}>
            <h1 style={{
              fontSize: isA4 ? '14pt' : isHorizontal ? '12pt' : '11pt',
              fontWeight: 'bold',
              margin: '0',
              textTransform: 'uppercase',
            }}>
              {businessName}
            </h1>
            <p style={{ 
              fontSize: isA4 ? '7pt' : '6pt', 
              margin: '1px 0 0 0',
              lineHeight: 1.2 
            }}>
              {address}
            </p>
          </div>

          {/* Info Row - Customer & Order Details */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: isA4 ? '5px' : '4px',
            fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '6.5pt',
            borderBottom: '1px solid #999',
            paddingBottom: isA4 ? '4px' : '3px',
          }}>
            {/* Left - Customer */}
            <div style={{ flex: 1 }}>
              <div>
                <strong>Customer:</strong> {customerName}
              </div>
              {customerAddress && (
                <div style={{ 
                  fontSize: isA4 ? '7pt' : '6pt',
                  color: '#333',
                  marginTop: '1px',
                  maxWidth: '65%',
                  lineHeight: 1.1
                }}>
                  {customerAddress}
                </div>
              )}
            </div>
            
            {/* Right - Order Info */}
            <div style={{ textAlign: 'right', fontSize: isA4 ? '8pt' : '6.5pt' }}>
              <div><strong>Date:</strong> {formatDate(orderDate)}</div>
              <div><strong>Order No:</strong> {orderNumber}</div>
              {salesman && <div><strong>Salesman:</strong> {salesman}</div>}
            </div>
          </div>

          {/* Wholesale Size Grouping Table */}
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isA4 ? '8pt' : isHorizontal ? '7pt' : '6.5pt',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#e8e8e8' }}>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '4%', fontWeight: 'bold' }}>Sr</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', textAlign: 'left', fontWeight: 'bold' }}>Product</th>
                {showColor && (
                  <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '8%', fontWeight: 'bold' }}>Color</th>
                )}
                {uniqueSizes.map(size => (
                  <th key={size} style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: `${Math.max(5, 50 / uniqueSizes.length)}%`, fontWeight: 'bold', textAlign: 'center' }}>
                    {size}
                  </th>
                ))}
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '6%', fontWeight: 'bold', textAlign: 'center' }}>Total</th>
                {showMRP && (
                  <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '8%', fontWeight: 'bold', textAlign: 'right' }}>MRP</th>
                )}
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '8%', fontWeight: 'bold', textAlign: 'right' }}>Rate</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '3px 2px' : '2px 1px', width: '10%', fontWeight: 'bold', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((group, index) => {
                const details = [group.brand, group.style].filter(Boolean).join(' | ');
                return (
                  <tr key={index}>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'left' }}>
                      {group.productName}
                      {details && <span style={{ color: '#555', marginLeft: '3px', fontSize: '90%' }}>({details})</span>}
                    </td>
                    {showColor && (
                      <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>{group.color || '-'}</td>
                    )}
                    {uniqueSizes.map(size => {
                      const sizeData = group.sizes.get(size);
                      return (
                        <td key={size} style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center' }}>
                          {sizeData ? sizeData.qty : '-'}
                        </td>
                      );
                    })}
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px' : '1px', textAlign: 'center', fontWeight: 'bold' }}>{group.totalQty}</td>
                    {showMRP && (
                      <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(group.mrp)}</td>
                    )}
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(group.rate)}</td>
                    <td style={{ border: '1px solid #000', padding: isA4 ? '2px 3px' : '1px 2px', textAlign: 'right' }}>{formatCurrency(group.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Simple Footer */}
          <div style={{
            marginTop: isA4 ? '6px' : '4px',
            paddingTop: isA4 ? '5px' : '3px',
            borderTop: '1.5px solid #000',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: isA4 ? '30px' : '15px',
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7.5pt',
            fontWeight: 'bold',
          }}>
            <div>
              Total Qty: <span style={{ minWidth: '40px', display: 'inline-block', textAlign: 'right' }}>{totalOrderQty}</span>
            </div>
            <div>
              Total Amount: <span style={{ minWidth: '70px', display: 'inline-block', textAlign: 'right' }}>{formatCurrency(netAmount)}</span>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div ref={ref} className="sale-order-print-container">
        <style>
          {`
            @media print {
              .sale-order-print-container {
                margin: 0;
                padding: 0;
              }
              .sale-order-page {
                page-break-after: always;
                margin: 0;
              }
              .sale-order-page:last-child {
                page-break-after: auto;
              }
            }
          `}
        </style>
        {invoiceFormat === 'wholesale-size-grouping' 
          ? renderWholesalePage()
          : pages.map((pageItems, index) => renderPage(pageItems, index))
        }
      </div>
    );
  }
);

SaleOrderPrint.displayName = 'SaleOrderPrint';
