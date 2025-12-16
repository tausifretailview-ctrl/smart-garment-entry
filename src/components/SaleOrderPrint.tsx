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
  showFulfillmentStatus?: boolean;
  taxType?: string;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
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

    // Calculate items per page based on format
    const getItemsPerPage = () => {
      if (isA4) return 25;
      if (isHorizontal) return 12;
      return 18;
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

    const renderPage = (pageItems: SaleOrderItem[], pageIndex: number) => {
      const isLastPage = pageIndex === pages.length - 1;
      
      return (
        <div 
          key={pageIndex}
          className="sale-order-page"
          style={{
            width: isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm',
            minHeight: isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm',
            padding: isA4 ? '8mm' : isHorizontal ? '6mm' : '4mm',
            fontFamily: 'Arial, sans-serif',
            fontSize: isA4 ? '10pt' : isHorizontal ? '9pt' : '8pt',
            backgroundColor: 'white',
            color: 'black',
            boxSizing: 'border-box',
            pageBreakAfter: isLastPage ? 'auto' : 'always',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Compact Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: isA4 ? '8px' : '6px',
            borderBottom: '2px solid #000',
            paddingBottom: isA4 ? '6px' : '4px',
          }}>
            <h1 style={{
              fontSize: isA4 ? '16pt' : isHorizontal ? '14pt' : '12pt',
              fontWeight: 'bold',
              margin: '0 0 2px 0',
              textTransform: 'uppercase',
            }}>
              {businessName}
            </h1>
            <p style={{ 
              fontSize: isA4 ? '8pt' : '7pt', 
              margin: '2px 0',
              lineHeight: 1.3 
            }}>
              {address}
            </p>
          </div>

          {/* Info Row - Customer & Order Details */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: isA4 ? '8px' : '6px',
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            borderBottom: '1px solid #ccc',
            paddingBottom: isA4 ? '6px' : '4px',
          }}>
            {/* Left - Customer */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <strong>Customer:</strong>
                <span>{customerName}</span>
              </div>
              {customerAddress && (
                <div style={{ 
                  fontSize: isA4 ? '8pt' : '6.5pt',
                  color: '#333',
                  marginTop: '2px',
                  maxWidth: '60%',
                  lineHeight: 1.2
                }}>
                  {customerAddress}
                </div>
              )}
            </div>
            
            {/* Right - Order Info */}
            <div style={{ textAlign: 'right' }}>
              <div><strong>Date:</strong> {formatDate(orderDate)}</div>
              <div><strong>Order No:</strong> {orderNumber}</div>
              {salesman && <div><strong>Salesman:</strong> {salesman}</div>}
              {totalPages > 1 && (
                <div style={{ fontSize: isA4 ? '8pt' : '6.5pt', color: '#666' }}>
                  Page {pageIndex + 1} of {totalPages}
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: isA4 ? '9pt' : isHorizontal ? '8pt' : '7pt',
            flex: 1,
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', width: '6%', fontWeight: 'bold' }}>Sr</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', width: '12%', fontWeight: 'bold' }}>Size</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', width: '8%', fontWeight: 'bold' }}>Qty</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', width: '12%', fontWeight: 'bold' }}>Rate</th>
                <th style={{ border: '1px solid #000', padding: isA4 ? '5px 3px' : '3px 2px', width: '14%', fontWeight: 'bold' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.sr}>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'center' }}>{item.sr}</td>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'left' }}>
                    {item.particulars}
                    {item.color && <span style={{ color: '#666', marginLeft: '4px' }}>({item.color})</span>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'center', fontWeight: 'bold' }}>{item.size}</td>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'center' }}>{item.orderQty}</td>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'right' }}>{formatCurrency(item.rate)}</td>
                  <td style={{ border: '1px solid #000', padding: isA4 ? '4px 3px' : '2px', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Simple Footer - Only on last page */}
          {isLastPage && (
            <div style={{
              marginTop: isA4 ? '10px' : '6px',
              paddingTop: isA4 ? '8px' : '4px',
              borderTop: '2px solid #000',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: isA4 ? '40px' : '20px',
              fontSize: isA4 ? '11pt' : isHorizontal ? '10pt' : '9pt',
              fontWeight: 'bold',
            }}>
              <div>
                <span>Total Qty: </span>
                <span style={{ minWidth: '50px', display: 'inline-block', textAlign: 'right' }}>{totalOrderQty}</span>
              </div>
              <div>
                <span>Total Amount: </span>
                <span style={{ minWidth: '80px', display: 'inline-block', textAlign: 'right' }}>{formatCurrency(netAmount)}</span>
              </div>
            </div>
          )}
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
        {pages.map((pageItems, index) => renderPage(pageItems, index))}
      </div>
    );
  }
);

SaleOrderPrint.displayName = 'SaleOrderPrint';
