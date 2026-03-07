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
  customerTransportDetails?: string;
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
  customerTransportDetails,
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

  // When all items fit on a single page, reduce empty rows to prevent footer overflow
  const effectiveMinItemRows = totalPages === 1 
    ? Math.min(minItemRows, Math.max(groupedItems.length, Math.min(minItemRows, format === 'a4' ? 10 : format === 'a5-horizontal' ? 5 : 7)))
    : minItemRows;

  const isA5 = format === 'a5-vertical' || format === 'a5-horizontal';

  const cellStyle: React.CSSProperties = {
    border: "1px solid #374151",
    padding: isA5 ? "3px 3px" : "6px 4px",
    fontSize: isA5 ? "7pt" : "8.5pt",
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
    fontSize: isA5 ? "6.5pt" : "8pt",
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
              width: isA5 ? "60px" : "80px",
              padding: isA5 ? "6px" : "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid #374151",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: "100%" }} />
            ) : (
              <div style={{ fontSize: isA5 ? "7pt" : "8pt" }}>LOGO</div>
            )}
          </div>
          <div style={{ flex: 1, padding: isA5 ? "5px 8px" : "10px", textAlign: "center" }}>
            <h1 style={{ fontSize: isA5 ? "14pt" : "18pt", fontWeight: "800", color: colors.primary, margin: 0 }}>{businessName}</h1>
            <p style={{ fontSize: isA5 ? "7.5pt" : "9pt", margin: "1px 0" }}>{address}</p>
            <p style={{ fontSize: isA5 ? "7.5pt" : "9pt", fontWeight: "600", margin: 0 }}>
              {gstNumber && `GSTIN: ${gstNumber} | `}Mob: {mobile}
            </p>
          </div>
          <div
            style={{
              width: isA5 ? "70px" : "100px",
              borderLeft: "1px solid #374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: "800", fontSize: isA5 ? "8pt" : "10pt", color: colors.primary }}>
              {businessName?.toLowerCase().includes("banshri") || businessName?.toLowerCase().includes("bansari") || businessName?.toLowerCase().includes("banshri") ? (
                <>DELIVERY<br />CHALLAN</>
              ) : (
                <>TAX<br />INVOICE</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Row */}
      <div style={{ display: "flex", borderBottom: "1px solid #374151", fontSize: isA5 ? "7.5pt" : "9pt", flexShrink: 0 }}>
        <div style={{ flex: 1, padding: isA5 ? "4px 6px" : "6px 8px", borderRight: "1px solid #374151" }}>
          <div style={{ fontWeight: "700", color: colors.primary, fontSize: isA5 ? "6pt" : "7pt" }}>BILL TO:</div>
          <div style={{ fontWeight: "600", fontSize: isA5 ? "9pt" : "10pt" }}>{customerName}</div>
          {customerAddress && <div>{customerAddress}</div>}
          {customerMobile && <div>Mob: {customerMobile}</div>}
          {customerGSTIN && (
            <div style={{ fontWeight: "500" }}>GSTIN: {customerGSTIN}</div>
          )}
          {customerTransportDetails && (
            <div style={{ fontWeight: "500" }}>Transport: {customerTransportDetails}</div>
          )}
        </div>
        <div style={{ width: isA5 ? "140px" : "180px", padding: isA5 ? "4px 6px" : "6px 8px", background: colors.light, boxSizing: "border-box" }}>
          <table style={{ width: "100%", fontSize: isA5 ? "6.5pt" : "9pt" }}>
            <tbody>
              <tr>
                <td style={{ whiteSpace: "nowrap", paddingRight: "4px" }}>Inv No:</td>
                <td style={{ fontWeight: "500", textAlign: "right", wordBreak: "break-all", fontSize: isA5 ? "5.5pt" : "9pt" }}>{invoiceNumber}</td>
              </tr>
              <tr>
                <td style={{ whiteSpace: "nowrap", paddingRight: "4px" }}>Date:</td>
                <td style={{ fontWeight: "500", textAlign: "right", fontSize: isA5 ? "5.5pt" : "9pt" }}>{invoiceDate.toLocaleDateString("en-IN")}</td>
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
          <th style={{ ...headerCellStyle, width: isA5 ? "16px" : "22px" }}>SR</th>
          <th style={{ ...headerCellStyle, width: isA5 ? "80px" : "100px" }}>PARTICULARS</th>
          <th style={{ ...headerCellStyle, width: isA5 ? "30px" : "45px" }}>HSN</th>
          <th style={{ ...headerCellStyle, width: isA5 ? "60px" : "80px" }}>SIZE / QTY</th>
          <th style={{ ...headerCellStyle, width: isA5 ? "26px" : "32px" }}>QTY</th>
          {!isA5 && <th style={{ ...headerCellStyle, width: "45px" }}>MRP</th>}
          <th style={{ ...headerCellStyle, width: isA5 ? "38px" : "45px" }}>RATE</th>
          {showGSTBreakdown && <th style={{ ...headerCellStyle, width: isA5 ? "26px" : "32px" }}>GST%</th>}
          {showGSTBreakdown && <th style={{ ...headerCellStyle, width: isA5 ? "38px" : "48px" }}>GST AMT</th>}
          <th style={{ ...headerCellStyle, width: isA5 ? "55px" : "65px" }}>AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        {pageItems.map((item, index) => (
          <tr key={index}>
            <td style={{ ...cellStyle, textAlign: "center" }}>{startIndex + index + 1}</td>
            <td style={cellStyle}>
              <div style={{ fontWeight: "700", fontSize: isA5 ? "6.5pt" : "8pt" }}>{item.particulars}</div>
            </td>
            <td style={{ ...cellStyle, textAlign: "center", fontSize: isA5 ? "6.5pt" : "7.5pt" }}>{item.hsn || '-'}</td>
            <td style={{ ...cellStyle, fontSize: isA5 ? "6.5pt" : "7.5pt", fontWeight: "500" }}>
              {formatSizeQty(item.sizeQtyList)}
            </td>
            <td style={{ ...cellStyle, textAlign: "center", fontWeight: "700" }}>{item.totalQty}</td>
            {!isA5 && <td style={{ ...cellStyle, textAlign: "right", fontSize: "7.5pt" }}>{item.mrp ? item.mrp.toFixed(2) : '-'}</td>}
            <td style={{ ...cellStyle, textAlign: "right", fontSize: isA5 ? "6.5pt" : "7.5pt" }}>{item.rate.toFixed(2)}</td>
            {showGSTBreakdown && <td style={{ ...cellStyle, textAlign: "center", fontSize: isA5 ? "6.5pt" : "7.5pt" }}>{item.gstPercent}%</td>}
            {showGSTBreakdown && (
              <td style={{ ...cellStyle, textAlign: "right", fontSize: isA5 ? "6pt" : "7pt" }}>
                {item.gstAmount > 0 ? `₹${item.gstAmount.toFixed(2)}` : '-'}
              </td>
            )}
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: "700", fontSize: isA5 ? "7pt" : "7.5pt", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {formatCurrency(item.totalAmount)}
            </td>
          </tr>
        ))}
        {/* Fill empty rows only on last page to maintain layout */}
        {isLastPage && Array.from({ length: Math.max(0, effectiveMinItemRows - pageItems.length) }).map((_, i) => (
          <tr key={`empty-${i}`} style={{ height: isA5 ? "18px" : "25px" }}>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>&nbsp;</td>
            {!isA5 && <td style={cellStyle}>&nbsp;</td>}
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
            <td colSpan={4} style={{ ...cellStyle, textAlign: "right" }}>
              TOTAL QTY:
            </td>
            <td style={{ ...cellStyle, textAlign: "center" }}>{totalQty}</td>
            <td colSpan={showGSTBreakdown ? (isA5 ? 3 : 4) : (isA5 ? 1 : 2)} style={{ ...cellStyle, textAlign: "right" }}>
              SUB TOTAL:
            </td>
            <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCurrency(subtotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  // Render summary section (only on last page)
  const renderSummary = () => (
    <>
      {/* Bottom Summary Section */}
      <div style={{ display: "flex", borderTop: "1px solid #374151", width: "100%", boxSizing: "border-box", overflow: "visible" }}>
        <div style={{ flex: 1, padding: isA5 ? "5px 6px" : "8px", borderRight: "1px solid #374151", minWidth: 0 }}>
          <div style={{ fontSize: isA5 ? "6pt" : "7pt", fontWeight: "700" }}>AMOUNT IN WORDS:</div>
          <div style={{ fontSize: isA5 ? "7.5pt" : "9pt", fontStyle: "italic" }}>{numberToWords(grandTotal)} Only</div>

          {bankDetails && (bankDetails.bank_name || bankDetails.account_number) && (
            <div style={{ marginTop: isA5 ? "5px" : "10px" }}>
              <div style={{ fontSize: isA5 ? "6pt" : "7pt", fontWeight: "700" }}>BANK DETAILS:</div>
              <div style={{ fontSize: isA5 ? "6.5pt" : "8pt" }}>
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
            width: isA5 ? "75px" : "100px", 
            padding: isA5 ? "4px" : "8px", 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid #374151"
          }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: isA5 ? "60px" : "80px", height: isA5 ? "60px" : "80px" }} />
            <div style={{ fontSize: isA5 ? "5pt" : "6pt", textAlign: "center", marginTop: "2px" }}>Scan to Pay</div>
            {upiId && <div style={{ fontSize: isA5 ? "4.5pt" : "5pt", textAlign: "center", color: "#666" }}>{upiId}</div>}
          </div>
        )}

        <div style={{ width: isA5 ? "180px" : "280px", flexShrink: 0, padding: isA5 ? "3px 4px" : "8px 10px", background: colors.light, boxSizing: "border-box", overflow: "visible" }}>
          <table style={{ width: "100%", fontSize: isA5 ? "6.5pt" : "9pt", fontWeight: "500", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <colgroup>
              <col style={{ width: "45%" }} />
              <col style={{ width: "55%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Sub Total:</td>
                <td style={{ textAlign: "right", padding: isA5 ? "1px 0 1px 2px" : "4px 0 4px 4px" }}>{formatCurrency(subtotal)}</td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Total Discount:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 0 1px 2px" : "4px 0 4px 4px" }}>-{formatCurrency(discount)}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Taxable Amt:</td>
                <td style={{ textAlign: "right", padding: isA5 ? "1px 0 1px 2px" : "4px 0 4px 4px" }}>{formatCurrency(calculatedTaxableAmount)}</td>
              </tr>
              {cgstAmount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>CGST:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 0 1px 2px" : "4px 0 4px 4px" }}>{formatCurrency(cgstAmount)}</td>
                </tr>
              )}
              {sgstAmount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>SGST:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 0 1px 2px" : "4px 0 4px 4px" }}>{formatCurrency(sgstAmount)}</td>
                </tr>
              )}
              <tr style={{ fontSize: isA5 ? "7.5pt" : "11pt", color: colors.primary }}>
                <td style={{ paddingTop: isA5 ? "3px" : "6px", borderTop: "1.5px solid #374151", whiteSpace: "nowrap", fontWeight: "600" }}>GRAND TOTAL:</td>
                <td
                  style={{ paddingTop: isA5 ? "3px" : "6px", borderTop: "1.5px solid #374151", textAlign: "right", fontWeight: "700" }}
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
          padding: isA5 ? "8px 6px 4px" : "20px 10px 10px",
          borderTop: "1px solid #374151",
        }}
      >
        <div style={{ fontSize: isA5 ? "6.5pt" : "8pt" }}>
          <p>
            <strong>Terms:</strong> 1. Goods once sold will not be taken back.
            <br />
            2. Subject to local jurisdiction.
          </p>
        </div>
        <div style={{ textAlign: "center", width: isA5 ? "150px" : "200px" }}>
          <div style={{ fontSize: isA5 ? "6.5pt" : "8pt", marginBottom: isA5 ? "20px" : "30px" }}>
            For <strong>{businessName}</strong>
          </div>
          <div style={{ borderTop: "1px solid #000", fontSize: isA5 ? "6.5pt" : "8pt" }}>Authorised Signatory</div>
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
          padding: format === 'a5-vertical' ? "2mm" : "5mm",
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
          minHeight: format === 'a4' ? "calc(297mm - 10mm)" : format === 'a5-horizontal' ? "calc(148mm - 10mm)" : "calc(210mm - 4mm)",
          maxHeight: format === 'a5-vertical' ? "calc(210mm - 4mm)" : undefined,
          overflow: "visible",
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
            @page { size: ${format === 'a5-vertical' ? '148mm 210mm' : format === 'a5-horizontal' ? 'A5 landscape' : 'A4'}; margin: ${format === 'a5-vertical' ? '1mm' : '5mm'}; }
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
