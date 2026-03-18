import React from 'react';
import { sortSizes } from "@/utils/sizeSort";

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
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  orderNumber: string;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  quotationNumber?: string;
  salesman?: string;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerEmail?: string;
  customerGSTIN?: string;
  items: SaleOrderItem[];
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  roundOff: number;
  netAmount: number;
  status: string;
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
      businessName, address, mobile, email, gstNumber, logoUrl,
      orderNumber, orderDate, expectedDeliveryDate, quotationNumber, salesman,
      customerName, customerAddress, customerMobile, customerEmail, customerGSTIN,
      items, grossAmount, discountAmount, gstAmount, roundOff, netAmount,
      termsConditions, notes,
      showMRP = true, showColor = true,
      format = 'a4',
      invoiceFormat = 'standard',
    } = props;

    const PRIMARY = '#1a3a5c';
    const LIGHT = '#e8eef5';
    const BORDER = '#b8c8d8';

    const isA4 = format === 'a4';
    const isHorizontal = format === 'a5-horizontal';

    const fmt = (n: number) =>
      `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const totalQty = items.reduce((s, i) => s + i.orderQty, 0);

    const itemsPerPage = isA4 ? 20 : isHorizontal ? 12 : 16;
    const pages: SaleOrderItem[][] = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
      pages.push(items.slice(i, i + itemsPerPage));
    }
    if (pages.length === 0) pages.push([]);
    const totalPages = pages.length;

    const groupedItems = React.useMemo(() => {
      if (invoiceFormat !== 'wholesale-size-grouping') return null;
      const groups: Map<string, {
        productName: string; brand?: string; style?: string; color?: string;
        rate: number; mrp: number;
        sizes: Map<string, { qty: number }>; totalQty: number; totalAmount: number;
      }> = new Map();
      items.forEach(item => {
        const key = `${item.particulars}-${item.color || ''}-${item.rate}`;
        if (!groups.has(key)) {
          groups.set(key, {
            productName: item.particulars, brand: item.brand, style: item.style,
            color: item.color, rate: item.rate, mrp: item.mrp,
            sizes: new Map(), totalQty: 0, totalAmount: 0,
          });
        }
        const g = groups.get(key)!;
        const cur = g.sizes.get(item.size) || { qty: 0 };
        g.sizes.set(item.size, { qty: cur.qty + item.orderQty });
        g.totalQty += item.orderQty;
        g.totalAmount += item.total;
      });
      return Array.from(groups.values());
    }, [items, invoiceFormat]);

    const uniqueSizes = React.useMemo(() => {
      if (invoiceFormat !== 'wholesale-size-grouping') return [];
      const sizes = new Set<string>();
      items.forEach(i => sizes.add(i.size));
      return sortSizes(Array.from(sizes));
    }, [items, invoiceFormat]);

    const baseFontSize = isA4 ? '9pt' : '7.5pt';
    const smallFont = isA4 ? '7.5pt' : '6.5pt';
    const tinyFont = isA4 ? '7pt' : '6pt';

    const thStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
      border: `1px solid ${BORDER}`,
      padding: isA4 ? '5px 4px' : '3px 2px',
      background: PRIMARY,
      color: '#fff',
      fontWeight: 700,
      fontSize: isA4 ? '8pt' : '7pt',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      ...extra,
    });

    const tdStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
      border: `1px solid ${BORDER}`,
      padding: isA4 ? '4px 4px' : '3px 2px',
      fontSize: baseFontSize,
      verticalAlign: 'middle',
      ...extra,
    });

    const pageWidth = isA4 ? '210mm' : isHorizontal ? '210mm' : '148mm';
    const pageMinHeight = isA4 ? '297mm' : isHorizontal ? '148mm' : '210mm';
    const pagePadding = isA4 ? '8mm' : isHorizontal ? '6mm' : '4mm';

    // ── Header ──────────────────────────────────────────────────────────────
    const renderHeader = () => (
      <div style={{ marginBottom: isA4 ? '8px' : '5px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          paddingBottom: isA4 ? '8px' : '5px',
          borderBottom: `2px solid ${PRIMARY}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            {logoUrl && (
              <img src={logoUrl} alt="Logo" style={{
                width: isA4 ? '50px' : '36px', height: isA4 ? '50px' : '36px',
                objectFit: 'contain', borderRadius: '4px',
              }} />
            )}
            <div>
              <div style={{
                fontSize: isA4 ? '16pt' : '12pt', fontWeight: 800,
                color: PRIMARY, textTransform: 'uppercase', letterSpacing: '0.02em',
              }}>
                {businessName}
              </div>
              <div style={{ fontSize: tinyFont, color: '#555', marginTop: '1px', lineHeight: 1.3 }}>
                {address}
              </div>
              <div style={{ fontSize: tinyFont, color: '#666', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                {mobile && <span>📞 {mobile}</span>}
                {email && <span>✉ {email}</span>}
                {gstNumber && <span style={{ fontWeight: 600 }}>GSTIN: {gstNumber}</span>}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{
              background: PRIMARY, color: '#fff', padding: isA4 ? '6px 16px' : '4px 10px',
              borderRadius: '4px', fontWeight: 800, fontSize: isA4 ? '11pt' : '9pt',
              letterSpacing: '0.1em', display: 'inline-block', marginBottom: '4px',
            }}>
              SALE ORDER
            </div>
            <div style={{ fontSize: smallFont, color: '#333', lineHeight: 1.5 }}>
              <div><strong>Order No:</strong> {orderNumber}</div>
              <div><strong>Date:</strong> {fmtDate(orderDate)}</div>
              {expectedDeliveryDate && <div><strong>Delivery By:</strong> {fmtDate(expectedDeliveryDate)}</div>}
              {quotationNumber && <div><strong>Ref. Quotation:</strong> {quotationNumber}</div>}
            </div>
          </div>
        </div>
      </div>
    );

    // ── Customer Info Strip ─────────────────────────────────────────────────
    const renderCustomerStrip = (pageIndex: number) => (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: LIGHT, border: `1px solid ${BORDER}`, borderRadius: '4px',
        padding: isA4 ? '8px 10px' : '5px 6px',
        marginBottom: isA4 ? '8px' : '5px',
        fontSize: smallFont,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: tinyFont, fontWeight: 700, color: PRIMARY,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px',
          }}>
            Bill To
          </div>
          <div style={{ fontWeight: 700, fontSize: baseFontSize, color: '#111' }}>{customerName}</div>
          {customerAddress && <div style={{ color: '#444', marginTop: '1px', lineHeight: 1.2 }}>{customerAddress}</div>}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px', color: '#555' }}>
            {customerMobile && <span>📞 {customerMobile}</span>}
            {customerEmail && <span>✉ {customerEmail}</span>}
            {customerGSTIN && <span style={{ fontWeight: 600 }}>GSTIN: {customerGSTIN}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: tinyFont, color: '#555' }}>
          {salesman && <div style={{ marginBottom: '2px' }}><strong>Salesman:</strong> {salesman}</div>}
          {totalPages > 1 && <div>Page {pageIndex + 1} / {totalPages}</div>}
        </div>
      </div>
    );

    // ── Items Table (standard) ──────────────────────────────────────────────
    const renderItemsTable = (pageItems: SaleOrderItem[]) => (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle({ width: '5%', textAlign: 'center' })}>Sr</th>
            <th style={thStyle({ textAlign: 'left' })}>Product</th>
            {showColor && <th style={thStyle({ width: '10%', textAlign: 'center' })}>Color</th>}
            <th style={thStyle({ width: '8%', textAlign: 'center' })}>Size</th>
            <th style={thStyle({ width: '7%', textAlign: 'center' })}>Qty</th>
            {showMRP && <th style={thStyle({ width: '10%', textAlign: 'right' })}>MRP</th>}
            <th style={thStyle({ width: '10%', textAlign: 'right' })}>Rate</th>
            <th style={thStyle({ width: '12%', textAlign: 'right' })}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((item, idx) => {
            const details = [item.brand, item.style].filter(Boolean).join(' · ');
            const rowBg = idx % 2 === 0 ? '#fff' : '#f7f9fc';
            return (
              <tr key={item.sr} style={{ background: rowBg }}>
                <td style={tdStyle({ textAlign: 'center', color: '#888' })}>{item.sr}</td>
                <td style={tdStyle({ textAlign: 'left' })}>
                  {item.particulars}
                  {details && (
                    <span style={{ color: '#888', marginLeft: '4px', fontSize: '85%' }}>({details})</span>
                  )}
                </td>
                {showColor && (
                  <td style={tdStyle({ textAlign: 'center', fontWeight: 600 })}>{item.color || '—'}</td>
                )}
                <td style={tdStyle({ textAlign: 'center', fontWeight: 700, fontSize: isA4 ? '10pt' : '8pt' })}>
                  {item.size}
                </td>
                <td style={tdStyle({ textAlign: 'center', fontWeight: 600 })}>{item.orderQty}</td>
                {showMRP && <td style={tdStyle({ textAlign: 'right' })}>{fmt(item.mrp)}</td>}
                <td style={tdStyle({ textAlign: 'right' })}>{fmt(item.rate)}</td>
                <td style={tdStyle({ textAlign: 'right', fontWeight: 700 })}>{fmt(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

    // ── Footer (last page only) ─────────────────────────────────────────────
    const renderFooter = () => (
      <div style={{ marginTop: isA4 ? '10px' : '6px' }}>
        {/* Notes + Summary row */}
        <div style={{
          display: 'flex', gap: isA4 ? '16px' : '8px',
          alignItems: 'flex-start', marginBottom: isA4 ? '10px' : '6px',
        }}>
          {/* Left: Notes + Terms */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {notes && (
              <div style={{
                border: `1px solid ${BORDER}`, borderRadius: '4px',
                padding: isA4 ? '8px' : '5px', marginBottom: '6px',
              }}>
                <div style={{
                  fontSize: tinyFont, fontWeight: 700, color: PRIMARY,
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px',
                }}>
                  📝 Notes
                </div>
                <div style={{ fontSize: smallFont, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {notes}
                </div>
              </div>
            )}
            {termsConditions && (
              <div style={{
                border: `1px solid ${BORDER}`, borderRadius: '4px',
                padding: isA4 ? '8px' : '5px',
              }}>
                <div style={{
                  fontSize: tinyFont, fontWeight: 700, color: PRIMARY,
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px',
                }}>
                  Terms & Conditions
                </div>
                <div style={{ fontSize: tinyFont, color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
                  {termsConditions}
                </div>
              </div>
            )}
            {!notes && !termsConditions && (
              <div style={{
                border: `1px dashed ${BORDER}`, borderRadius: '4px',
                padding: isA4 ? '8px' : '5px', minHeight: isA4 ? '40px' : '25px',
              }}>
                <div style={{
                  fontSize: tinyFont, fontWeight: 700, color: '#aaa',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Notes
                </div>
              </div>
            )}
          </div>

          {/* Right: Summary box */}
          <div style={{
            width: isA4 ? '200px' : '150px', flexShrink: 0,
            border: `1.5px solid ${PRIMARY}`, borderRadius: '4px', overflow: 'hidden',
          }}>
            <div style={{
              background: PRIMARY, color: '#fff', padding: '4px 8px',
              fontSize: tinyFont, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', textAlign: 'center',
            }}>
              Order Summary
            </div>
            <div style={{ padding: isA4 ? '6px 8px' : '4px 6px' }}>
              {[
                ['Total Items', items.length.toString()],
                ['Total Qty', totalQty.toString()],
                ...(grossAmount !== netAmount ? [['Gross Amount', fmt(grossAmount)]] : []),
                ...(discountAmount > 0 ? [['Discount', `− ${fmt(discountAmount)}`]] : []),
                ...(gstAmount > 0 ? [['GST', fmt(gstAmount)]] : []),
                ...(roundOff !== 0 ? [['Round Off', (roundOff > 0 ? '+' : '') + fmt(roundOff)]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: smallFont, padding: '2px 0', color: '#333',
                }}>
                  <span>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: isA4 ? '10pt' : '8.5pt', fontWeight: 800,
                borderTop: `1.5px solid ${PRIMARY}`, marginTop: '4px', paddingTop: '4px',
                color: PRIMARY,
              }}>
                <span>NET AMOUNT</span>
                <span>{fmt(netAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Signature row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          borderTop: `1.5px solid ${PRIMARY}`, paddingTop: isA4 ? '30px' : '20px',
          fontSize: smallFont, color: '#555',
        }}>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '4px' }}>Customer's Signature</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '4px' }}>Prepared By</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ fontWeight: 600, color: PRIMARY, marginBottom: '2px' }}>For {businessName}</div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '4px' }}>Authorised Signatory</div>
          </div>
        </div>
      </div>
    );

    // ── Render standard page ────────────────────────────────────────────────
    const renderPage = (pageItems: SaleOrderItem[], pageIndex: number) => {
      const isLastPage = pageIndex === totalPages - 1;
      return (
        <div
          key={pageIndex}
          className="sale-order-page"
          style={{
            width: pageWidth, minHeight: pageMinHeight,
            padding: pagePadding, fontFamily: 'Arial, sans-serif',
            fontSize: baseFontSize, backgroundColor: 'white', color: 'black',
            boxSizing: 'border-box',
            pageBreakAfter: isLastPage ? 'auto' : 'always',
          }}
        >
          {renderHeader()}
          {renderCustomerStrip(pageIndex)}
          {renderItemsTable(pageItems)}
          {isLastPage && renderFooter()}
          {!isLastPage && (
            <div style={{
              textAlign: 'center', fontSize: tinyFont, color: '#999',
              marginTop: '6px', fontStyle: 'italic',
            }}>
              Continued on next page...
            </div>
          )}
        </div>
      );
    };

    // ── Render wholesale page ───────────────────────────────────────────────
    const renderWholesalePage = () => {
      if (!groupedItems) return null;
      return (
        <div
          className="sale-order-page"
          style={{
            width: pageWidth, minHeight: pageMinHeight,
            padding: pagePadding, fontFamily: 'Arial, sans-serif',
            fontSize: baseFontSize, backgroundColor: 'white', color: 'black',
            boxSizing: 'border-box',
          }}
        >
          {renderHeader()}
          {renderCustomerStrip(0)}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle({ width: '4%', textAlign: 'center' })}>Sr</th>
                <th style={thStyle({ textAlign: 'left' })}>Product</th>
                {showColor && <th style={thStyle({ width: '8%', textAlign: 'center' })}>Color</th>}
                {uniqueSizes.map(sz => (
                  <th key={sz} style={thStyle({
                    width: `${Math.max(5, 50 / uniqueSizes.length)}%`,
                    textAlign: 'center',
                    fontSize: isA4 ? '9pt' : '7.5pt',
                  })}>
                    {sz}
                  </th>
                ))}
                <th style={thStyle({ width: '6%', textAlign: 'center' })}>Total</th>
                {showMRP && <th style={thStyle({ width: '8%', textAlign: 'right' })}>MRP</th>}
                <th style={thStyle({ width: '8%', textAlign: 'right' })}>Rate</th>
                <th style={thStyle({ width: '10%', textAlign: 'right' })}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((g, idx) => {
                const details = [g.brand, g.style].filter(Boolean).join(' · ');
                const rowBg = idx % 2 === 0 ? '#fff' : '#f7f9fc';
                return (
                  <tr key={idx} style={{ background: rowBg }}>
                    <td style={tdStyle({ textAlign: 'center', color: '#888' })}>{idx + 1}</td>
                    <td style={tdStyle({ textAlign: 'left' })}>
                      {g.productName}
                      {details && <span style={{ color: '#888', marginLeft: '4px', fontSize: '85%' }}>({details})</span>}
                    </td>
                    {showColor && <td style={tdStyle({ textAlign: 'center', fontWeight: 600 })}>{g.color || '—'}</td>}
                    {uniqueSizes.map(sz => (
                      <td key={sz} style={tdStyle({
                        textAlign: 'center', fontWeight: 700,
                        fontSize: isA4 ? '10pt' : '8pt',
                      })}>
                        {g.sizes.get(sz)?.qty ?? '—'}
                      </td>
                    ))}
                    <td style={tdStyle({ textAlign: 'center', fontWeight: 700 })}>{g.totalQty}</td>
                    {showMRP && <td style={tdStyle({ textAlign: 'right' })}>{fmt(g.mrp)}</td>}
                    <td style={tdStyle({ textAlign: 'right' })}>{fmt(g.rate)}</td>
                    <td style={tdStyle({ textAlign: 'right', fontWeight: 700 })}>{fmt(g.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {renderFooter()}
        </div>
      );
    };

    return (
      <div ref={ref} className="sale-order-print-container">
        <style>{`
          @media print {
            @page { size: ${isA4 ? 'A4' : isHorizontal ? 'A5 landscape' : 'A5 portrait'}; margin: 0; }
            .sale-order-print-container { margin: 0; padding: 0; }
            .sale-order-page { page-break-after: always; margin: 0; }
            .sale-order-page:last-child { page-break-after: auto; }
          }
        `}</style>
        {invoiceFormat === 'wholesale-size-grouping'
          ? renderWholesalePage()
          : pages.map((pageItems, index) => renderPage(pageItems, index))
        }
      </div>
    );
  }
);

SaleOrderPrint.displayName = 'SaleOrderPrint';
