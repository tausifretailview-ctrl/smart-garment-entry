import React from "react";
import { numberToWords } from "@/lib/utils";

interface WholesaleItem {
  particulars: string;
  brand?: string;
  color?: string;
  style?: string;
  hsn?: string;
  size: string;
  qty: number;
  rate: number;
  mrp?: number;
  gstPercent?: number;
  gst_percent?: number; // Alternative field name from database
  total: number;
}

interface GroupedItem {
  particulars: string;
  brand?: string;
  color?: string;
  style?: string;
  hsn?: string;
  rate: number;
  mrp?: number;
  gstPercent: number;
  gstAmount: number;
  sizeQtyList: Array<{ size: string; qty: number }>;
  totalQty: number;
  totalAmount: number;
}

interface ModernWholesaleTemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  gstNumber?: string;
  logoUrl?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  items: WholesaleItem[];
  subtotal: number;
  discount: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  grandTotal: number;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
  };
  showGSTBreakdown?: boolean;
  minItemRows?: number;
  amountWithDecimal?: boolean;
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  colorScheme?: string;
  fontFamily?: string;
  qrCodeUrl?: string;
  upiId?: string;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
}

const colorSchemes: Record<string, { primary: string; light: string; gradient: string }> = {
  blue: { primary: '#1e40af', light: '#dbeafe', gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)' },
  green: { primary: '#15803d', light: '#dcfce7', gradient: 'linear-gradient(135deg, #15803d, #22c55e)' },
  purple: { primary: '#7c3aed', light: '#f3e8ff', gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)' },
  red: { primary: '#dc2626', light: '#fee2e2', gradient: 'linear-gradient(135deg, #dc2626, #f87171)' },
  orange: { primary: '#ea580c', light: '#ffedd5', gradient: 'linear-gradient(135deg, #ea580c, #fb923c)' },
  teal: { primary: '#0d9488', light: '#ccfbf1', gradient: 'linear-gradient(135deg, #0d9488, #2dd4bf)' },
  black: { primary: '#111827', light: '#f3f4f6', gradient: 'linear-gradient(135deg, #111827, #374151)' },
};

const fontFamilyMap: Record<string, string> = {
  inter: "'Inter', sans-serif",
  roboto: "'Roboto', sans-serif",
  poppins: "'Poppins', sans-serif",
};

export const ModernWholesaleTemplate: React.FC<ModernWholesaleTemplateProps> = ({
  businessName,
  address,
  mobile,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  items,
  subtotal,
  discount,
  taxableAmount,
  cgstAmount = 0,
  sgstAmount = 0,
  grandTotal,
  bankDetails,
  showGSTBreakdown = true,
  minItemRows = 12,
  amountWithDecimal = true,
  enableWholesaleGrouping = true,
  sizeDisplayFormat = 'size/qty',
  colorScheme = 'blue',
  fontFamily = 'inter',
  qrCodeUrl,
  upiId,
  format = 'a4',
}) => {
  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.inter;

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: amountWithDecimal ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const getItemGstPercent = (item: WholesaleItem): number => {
    return item.gstPercent ?? (item as any).gst_percent ?? 0;
  };

  const groupItems = (itemsList: WholesaleItem[]): GroupedItem[] => {
    if (!enableWholesaleGrouping) {
      return itemsList.map((item) => {
        const gstPct = getItemGstPercent(item);
        const gstAmt = (item.total * gstPct) / (100 + gstPct);
        return {
          particulars: item.particulars,
          brand: item.brand,
          color: item.color,
          style: item.style,
          hsn: item.hsn,
          rate: item.rate,
          mrp: item.mrp,
          gstPercent: gstPct,
          gstAmount: gstAmt,
          sizeQtyList: [{ size: item.size, qty: item.qty }],
          totalQty: item.qty,
          totalAmount: item.total,
        };
      });
    }

    const grouped: Record<string, GroupedItem> = {};
    itemsList.forEach((item) => {
      const gstPct = getItemGstPercent(item);
      const key = `${item.particulars}-${item.color || ''}-${item.rate}-${gstPct}`;
      if (!grouped[key]) {
        grouped[key] = {
          particulars: item.particulars,
          brand: item.brand,
          color: item.color,
          style: item.style,
          hsn: item.hsn,
          rate: item.rate,
          mrp: item.mrp,
          gstPercent: gstPct,
          gstAmount: 0,
          sizeQtyList: [],
          totalQty: 0,
          totalAmount: 0,
        };
      }
      const existingSize = grouped[key].sizeQtyList.find((sq) => sq.size === item.size);
      if (existingSize) {
        existingSize.qty += item.qty;
      } else {
        grouped[key].sizeQtyList.push({ size: item.size, qty: item.qty });
      }
      grouped[key].totalQty += item.qty;
      grouped[key].totalAmount += item.total;
      const itemGstAmt = (item.total * gstPct) / (100 + gstPct);
      grouped[key].gstAmount += itemGstAmt;
    });
    return Object.values(grouped);
  };

  const formatSizeQty = (sizeQtyList: Array<{ size: string; qty: number }>): string => {
    const separator = sizeDisplayFormat === "size×qty" ? "×" : "/";
    return sizeQtyList.map((sq) => `${sq.size}${separator}${sq.qty}`).join(", ");
  };

  const groupedItems = groupItems(items);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const calculatedTaxableAmount = taxableAmount || subtotal - discount;

  // Calculate items per page based on format
  const getItemsPerPage = () => {
    if (format === 'a4') return 20;
    if (format === 'a5-horizontal') return 10;
    return 14; // a5-vertical
  };

  const itemsPerPage = getItemsPerPage();

  // Split items into pages
  const pages: GroupedItem[][] = [];
  for (let i = 0; i < groupedItems.length; i += itemsPerPage) {
    pages.push(groupedItems.slice(i, i + itemsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  const totalPages = pages.length;

  const cellStyle: React.CSSProperties = {
    border: "1px solid #374151",
    padding: "6px 4px",
    fontSize: "8.5pt",
    verticalAlign: "middle",
    lineHeight: "1.2",
    wordBreak: "break-word",
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: colors.gradient,
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
    fontSize: "8pt",
  };

  // Render header section (repeated on each page)
  const renderHeader = () => (
    <>
      {/* Top Line / Header Border */}
      <div style={{ 
        borderBottom: "1.5px solid #374151", 
        background: colors.light,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex" }}>
          <div
            style={{
              width: "80px",
              padding: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid #374151",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: "100%" }} />
            ) : (
              <div style={{ fontSize: "8pt" }}>LOGO</div>
            )}
          </div>
          <div style={{ flex: 1, padding: "10px", textAlign: "center" }}>
            <h1 style={{ fontSize: "18pt", fontWeight: "800", color: colors.primary, margin: 0 }}>{businessName}</h1>
            <p style={{ fontSize: "9pt", margin: "2px 0" }}>{address}</p>
            <p style={{ fontSize: "9pt", fontWeight: "600" }}>
              {gstNumber && `GSTIN: ${gstNumber} | `}Mob: {mobile}
            </p>
          </div>
          <div
            style={{
              width: "100px",
              borderLeft: "1px solid #374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: "800", fontSize: "10pt", color: colors.primary }}>
              TAX
              <br />
              INVOICE
            </div>
          </div>
        </div>
      </div>

      {/* Customer Row */}
      <div style={{ display: "flex", borderBottom: "1px solid #374151", fontSize: "9pt", flexShrink: 0 }}>
        <div style={{ flex: 1, padding: "8px", borderRight: "1px solid #374151" }}>
          <div style={{ fontWeight: "700", color: colors.primary, fontSize: "7pt" }}>BILL TO:</div>
          <div style={{ fontWeight: "700", fontSize: "11pt" }}>{customerName}</div>
          {customerAddress && <div style={{ fontSize: "9pt" }}>{customerAddress}</div>}
          {customerMobile && <div style={{ fontSize: "9pt" }}>Mob: {customerMobile}</div>}
          {customerGSTIN && (
            <div style={{ marginTop: "2px", fontWeight: "600" }}>
              GSTIN: {customerGSTIN}
            </div>
          )}
        </div>
        <div style={{ width: "180px", padding: "8px", background: colors.light, boxSizing: "border-box" }}>
          <table style={{ width: "100%", fontSize: "9pt" }}>
            <tbody>
              <tr>
                <td>Inv No:</td>
                <td style={{ fontWeight: "700" }}>{invoiceNumber}</td>
              </tr>
              <tr>
                <td>Date:</td>
                <td style={{ fontWeight: "700" }}>{invoiceDate.toLocaleDateString("en-IN")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  // Render items table for a specific page
  const renderItemsTable = (pageItems: GroupedItem[], startIndex: number, isLastPage: boolean) => (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: "25px" }}>SR</th>
          <th style={{ ...headerCellStyle, width: "130px" }}>PARTICULARS</th>
          <th style={{ ...headerCellStyle, width: "100px" }}>SIZE / QTY</th>
          <th style={{ ...headerCellStyle, width: "35px" }}>QTY</th>
          <th style={{ ...headerCellStyle, width: "50px" }}>MRP</th>
          <th style={{ ...headerCellStyle, width: "50px" }}>RATE</th>
          {showGSTBreakdown && <th style={{ ...headerCellStyle, width: "35px" }}>GST%</th>}
          {showGSTBreakdown && <th style={{ ...headerCellStyle, width: "50px" }}>GST AMT</th>}
          <th style={{ ...headerCellStyle, width: "65px" }}>AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        {pageItems.map((item, index) => (
          <tr key={index}>
            <td style={{ ...cellStyle, textAlign: "center" }}>{startIndex + index + 1}</td>
            <td style={cellStyle}>
              <div style={{ fontWeight: "700" }}>{item.particulars}</div>
              <div style={{ fontSize: "7pt", color: "#4b5563" }}>
                {item.color} {item.brand}
              </div>
            </td>
            <td style={{ ...cellStyle, fontSize: "8pt", fontWeight: "500" }}>
              {formatSizeQty(item.sizeQtyList)}
            </td>
            <td style={{ ...cellStyle, textAlign: "center", fontWeight: "700" }}>{item.totalQty}</td>
            <td style={{ ...cellStyle, textAlign: "right" }}>{item.mrp ? item.mrp.toFixed(2) : '-'}</td>
            <td style={{ ...cellStyle, textAlign: "right" }}>{item.rate.toFixed(2)}</td>
            {showGSTBreakdown && <td style={{ ...cellStyle, textAlign: "center" }}>{item.gstPercent}%</td>}
            {showGSTBreakdown && (
              <td style={{ ...cellStyle, textAlign: "right", fontSize: "7.5pt" }}>
                {item.gstAmount > 0 ? `₹${item.gstAmount.toFixed(2)}` : '-'}
              </td>
            )}
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: "700" }}>
              {formatCurrency(item.totalAmount)}
            </td>
          </tr>
        ))}
        {/* Fill empty rows only on last page to maintain layout */}
        {isLastPage && Array.from({ length: Math.max(0, minItemRows - pageItems.length) }).map((_, i) => (
          <tr key={`empty-${i}`} style={{ height: "25px" }}>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            {showGSTBreakdown && <td style={cellStyle}>&nbsp;</td>}
            {showGSTBreakdown && <td style={cellStyle}>&nbsp;</td>}
            <td style={cellStyle}>&nbsp;</td>
          </tr>
        ))}
      </tbody>
      {/* Show totals footer only on last page */}
      {isLastPage && (
        <tfoot>
          <tr style={{ background: colors.light, fontWeight: "800" }}>
            <td colSpan={3} style={{ ...cellStyle, textAlign: "right" }}>
              TOTAL QTY:
            </td>
            <td style={{ ...cellStyle, textAlign: "center" }}>{totalQty}</td>
            <td colSpan={showGSTBreakdown ? 4 : 2} style={{ ...cellStyle, textAlign: "right" }}>
              SUB TOTAL:
            </td>
            <td style={{ ...cellStyle, textAlign: "right" }}>{formatCurrency(subtotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  // Render summary section (only on last page)
  const renderSummary = () => (
    <>
      {/* Bottom Summary Section */}
      <div style={{ display: "flex", borderTop: "1px solid #374151" }}>
        <div style={{ flex: 1, padding: "8px", borderRight: "1px solid #374151" }}>
          <div style={{ fontSize: "7pt", fontWeight: "700" }}>AMOUNT IN WORDS:</div>
          <div style={{ fontSize: "9pt", fontStyle: "italic" }}>{numberToWords(grandTotal)} Only</div>

          {bankDetails && (bankDetails.bank_name || bankDetails.account_number) && (
            <div style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "7pt", fontWeight: "700" }}>BANK DETAILS:</div>
              <div style={{ fontSize: "8pt" }}>
                {bankDetails.bank_name} | A/C: {bankDetails.account_number}
                <br />
                IFSC: {bankDetails.ifsc_code}
              </div>
            </div>
          )}
        </div>

        {/* QR Code Section */}
        {qrCodeUrl && (
          <div style={{ 
            width: "100px", 
            padding: "8px", 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid #374151"
          }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: "80px", height: "80px" }} />
            <div style={{ fontSize: "6pt", textAlign: "center", marginTop: "2px" }}>Scan to Pay</div>
            {upiId && <div style={{ fontSize: "5pt", textAlign: "center", color: "#666" }}>{upiId}</div>}
          </div>
        )}

        <div style={{ width: "220px", padding: "8px", background: colors.light }}>
          <table style={{ width: "100%", fontSize: "9pt", fontWeight: "600" }}>
            <tbody>
              <tr>
                <td>Sub Total:</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(subtotal)}</td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td>Total Discount:</td>
                  <td style={{ textAlign: "right" }}>-{formatCurrency(discount)}</td>
                </tr>
              )}
              <tr>
                <td>Taxable Amt:</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(calculatedTaxableAmount)}</td>
              </tr>
              {cgstAmount > 0 && (
                <tr>
                  <td>CGST:</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(cgstAmount)}</td>
                </tr>
              )}
              {sgstAmount > 0 && (
                <tr>
                  <td>SGST:</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(sgstAmount)}</td>
                </tr>
              )}
              <tr style={{ fontSize: "11pt", color: colors.primary }}>
                <td style={{ paddingTop: "5px", borderTop: "1px solid #374151" }}>GRAND TOTAL:</td>
                <td
                  style={{ paddingTop: "5px", borderTop: "1px solid #374151", textAlign: "right", fontWeight: "800" }}
                >
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "20px 10px 10px",
          borderTop: "1px solid #374151",
        }}
      >
        <div style={{ fontSize: "8pt" }}>
          <p>
            <strong>Terms:</strong> 1. Goods once sold will not be taken back.
            <br />
            2. Subject to local jurisdiction.
          </p>
        </div>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ fontSize: "8pt", marginBottom: "30px" }}>
            For <strong>{businessName}</strong>
          </div>
          <div style={{ borderTop: "1px solid #000", fontSize: "8pt" }}>Authorised Signatory</div>
        </div>
      </div>
    </>
  );

  // Render page indicator (shown on all pages when multi-page)
  const renderPageIndicator = (pageNum: number) => (
    totalPages > 1 && (
      <div style={{ 
        textAlign: "right", 
        padding: "4px 8px", 
        fontSize: "8pt", 
        color: "#666",
        borderTop: "1px solid #e5e7eb"
      }}>
        Page {pageNum} of {totalPages}
      </div>
    )
  );

  // Render a single page
  const renderPage = (pageItems: GroupedItem[], pageIndex: number) => {
    const isLastPage = pageIndex === totalPages - 1;
    const startIndex = pageIndex * itemsPerPage;

    return (
      <div
        key={pageIndex}
        className="invoice-page"
        style={{
          width: format === 'a4' ? "210mm" : format === 'a5-horizontal' ? "210mm" : "148mm",
          minHeight: format === 'a4' ? "297mm" : format === 'a5-horizontal' ? "148mm" : "210mm",
          margin: "0 auto",
          padding: "5mm",
          fontFamily: font,
          backgroundColor: "#fff",
          boxSizing: "border-box",
          pageBreakAfter: isLastPage ? 'auto' : 'always',
          breakAfter: isLastPage ? 'auto' : 'page',
        }}
      >
        {/* Main Border Wrapper */}
        <div style={{ 
          border: "1.5px solid #374151", 
          minHeight: format === 'a4' ? "calc(297mm - 10mm)" : format === 'a5-horizontal' ? "calc(148mm - 10mm)" : "calc(210mm - 10mm)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}>
          {renderHeader()}
          
          <div style={{ flex: 1 }}>
            {renderItemsTable(pageItems, startIndex, isLastPage)}
          </div>
          
          {isLastPage && renderSummary()}
          
          {renderPageIndicator(pageIndex + 1)}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>
        {`
          @media print {
            @page { size: A4; margin: 5mm; }
            body { margin: 0; padding: 0; }
            .invoice-page { 
              box-shadow: none !important; 
              border: none !important;
            }
            .invoice-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
          }
        `}
      </style>

      {pages.map((pageItems, pageIndex) => renderPage(pageItems, pageIndex))}
    </>
  );
};

export default ModernWholesaleTemplate;
