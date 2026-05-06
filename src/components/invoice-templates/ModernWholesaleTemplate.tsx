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
  discountPercent?: number;
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
  discountPercent: number;
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
  termsConditions?: string[];
  declarationText?: string;
  stampImageBase64?: string;
  stampSize?: 'small' | 'medium' | 'large';
  [key: string]: any;
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
  termsConditions,
  declarationText,
  stampImageBase64,
  stampSize = 'medium',
}) => {
  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.inter;

  // Use "Rs." for summary labels, plain number for table cells
  const formatCurrencyPlain = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: amountWithDecimal ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };

  const formatCurrencyWithRs = (amount: number) => {
    return formatCurrencyPlain(amount);
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
          discountPercent: item.discountPercent || 0,
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
          discountPercent: item.discountPercent || 0,
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
  

  const isA5 = format === 'a5-vertical' || format === 'a5-horizontal';

  // Items per page: full pages vs last page (reserving space for footer/summary)
  const getItemsPerPage = () => {
    // A4: header (~55mm) + customer (~25mm) + items (~8mm each) + margins (~12mm)
    // Non-last pages have no footer, so can fit 14 items safely
    if (format === 'a4') return 14;
    if (format === 'a5-horizontal') return 8;
    return 10; // a5-vertical
  };

  const getLastPageItems = () => {
    // Last page needs space for summary/footer (~60mm), so fewer items
    if (format === 'a4') return 10;
    if (format === 'a5-horizontal') return 6;
    return 7; // a5-vertical — reserve ~5 rows for footer section
  };

  const itemsPerPage = getItemsPerPage();
  const lastPageMaxItems = getLastPageItems();

  // Smart page splitting: fill early pages fully, reserve space on last page for footer
  const pages: GroupedItem[][] = [];
  const pageStartIndices: number[] = [];
  let remaining = [...groupedItems];
  
  if (remaining.length === 0) {
    pages.push([]);
    pageStartIndices.push(0);
  } else {
    let currentStart = 0;
    while (remaining.length > 0) {
      // If remaining items fit on a single page with footer space, put them all here
      if (remaining.length <= lastPageMaxItems) {
        pages.push(remaining);
        pageStartIndices.push(currentStart);
        remaining = [];
      } 
      // Otherwise, fill this page fully and continue
      else {
        const takeCount = Math.min(itemsPerPage, remaining.length);
        pages.push(remaining.slice(0, takeCount));
        pageStartIndices.push(currentStart);
        currentStart += takeCount;
        remaining = remaining.slice(takeCount);
      }
    }
  }

  const totalPages = pages.length;

  // On last page, use minimal empty rows to avoid pushing footer off-page
  const getEffectiveMinRows = (pageIndex: number) => {
    const isLastPage = pageIndex === totalPages - 1;
    const pageItemCount = pages[pageIndex]?.length || 0;
    if (totalPages === 1) {
      return Math.max(pageItemCount, isA5 ? (format === 'a5-horizontal' ? 3 : 4) : 6);
    }
    // Multi-page: no empty padding rows on any page to prevent overflow
    return pageItemCount;
  };

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
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact" as any,
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
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div
            style={{
              width: isA5 ? "52px" : "80px",
              minWidth: isA5 ? "52px" : "80px",
              padding: isA5 ? "4px" : "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid #374151",
              flexShrink: 0,
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxWidth: "100%", maxHeight: isA5 ? "36px" : "56px" }} />
            ) : (
              <div style={{ fontSize: isA5 ? "6pt" : "8pt", color: "#999" }}>LOGO</div>
            )}
          </div>
          <div style={{ flex: 1, padding: isA5 ? "4px 6px" : "10px", textAlign: "center", overflow: "hidden" }}>
            <h1 style={{ fontSize: isA5 ? "13pt" : "18pt", fontWeight: "800", color: colors.primary, margin: 0, lineHeight: "1.1" }}>{businessName}</h1>
            <p style={{ fontSize: isA5 ? "6.5pt" : "9pt", margin: "1px 0", lineHeight: "1.3" }}>{address}</p>
            <p style={{ fontSize: isA5 ? "6.5pt" : "9pt", fontWeight: "600", margin: 0 }}>
              {gstNumber && `GSTIN: ${gstNumber} | `}Mob: {mobile}
            </p>
          </div>
          {/* DELIVERY CHALLAN / TAX INVOICE — wider box to prevent text cut */}
          <div
            style={{
              width: isA5 ? "96px" : "110px",
              minWidth: isA5 ? "96px" : "110px",
              borderLeft: "1px solid #374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: isA5 ? "4px 3px" : "6px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontWeight: "800", fontSize: isA5 ? "8pt" : "10pt", color: colors.primary, lineHeight: "1.35", letterSpacing: "0.3px" }}>
              {grandTotal < 0 ? (
                <>CREDIT<br />NOTE</>
              ) : businessName?.toLowerCase().includes("banshri") || businessName?.toLowerCase().includes("bansari") || businessName?.toLowerCase().includes("banshri") ? (
                <>DELIVERY<br />CHALLAN</>
              ) : (
                <>TAX<br />INVOICE</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Row */}
      <div style={{ display: "flex", borderBottom: "1px solid #374151", fontSize: isA5 ? "7pt" : "9pt", flexShrink: 0, alignItems: "stretch" }}>
        <div style={{ flex: 1, padding: isA5 ? "3px 5px" : "6px 8px", borderRight: "1px solid #374151", overflow: "hidden" }}>
          <div style={{ fontWeight: "700", color: colors.primary, fontSize: isA5 ? "5.5pt" : "7pt" }}>BILL TO:</div>
          <div style={{ fontWeight: "700", fontSize: isA5 ? "8pt" : "10pt", lineHeight: "1.2" }}>{customerName}</div>
          {customerAddress && <div style={{ fontSize: isA5 ? "6.5pt" : "8pt", lineHeight: "1.3" }}>{customerAddress}</div>}
          {customerMobile && <div style={{ fontSize: isA5 ? "6.5pt" : "8pt" }}>Mob: {customerMobile}</div>}
          {customerGSTIN && (
            <div style={{ fontSize: isA5 ? "6.5pt" : "8.5pt", fontWeight: "700", color: colors.primary }}>GSTIN: {customerGSTIN}</div>
          )}
          {customerTransportDetails && (
            <div style={{ fontSize: isA5 ? "6pt" : "7.5pt" }}>Transport: {customerTransportDetails}</div>
          )}
        </div>
        {/* Inv No + Date — wider box, larger font to prevent truncation */}
        <div style={{ 
          width: isA5 ? "170px" : "220px", 
          minWidth: isA5 ? "170px" : "220px", 
          padding: isA5 ? "3px 6px" : "6px 8px", 
          background: colors.light, 
          boxSizing: "border-box",
          flexShrink: 0,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ fontSize: isA5 ? "6.5pt" : "8pt", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: "600" }}>Inv No:</td>
                <td style={{ fontWeight: "700", textAlign: "right", whiteSpace: "nowrap", fontSize: isA5 ? "6.5pt" : "9pt", color: colors.primary }}>{invoiceNumber}</td>
              </tr>
              <tr>
                <td style={{ fontSize: isA5 ? "6.5pt" : "8pt", whiteSpace: "nowrap", paddingRight: "4px", fontWeight: "600" }}>Date:</td>
                <td style={{ fontWeight: "600", textAlign: "right", fontSize: isA5 ? "6.5pt" : "9pt" }}>{invoiceDate.toLocaleDateString("en-IN")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  // Render items table for a specific page
  const renderItemsTable = (pageItems: GroupedItem[], startIndex: number, isLastPage: boolean) => {
    const colCount = 6 + (isA5 ? 0 : 1) + (showGSTBreakdown ? 2 : 0);
    return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: isA5 ? "20px" : "22px" }} />
        <col />
        <col style={{ width: isA5 ? "34px" : "45px" }} />
        <col style={{ width: isA5 ? "100px" : "100px" }} />
        <col style={{ width: isA5 ? "28px" : "32px" }} />
        {!isA5 && <col style={{ width: "45px" }} />}
        <col style={{ width: isA5 ? "46px" : "45px" }} />
        
        {showGSTBreakdown && <col style={{ width: isA5 ? "26px" : "32px" }} />}
        {showGSTBreakdown && <col style={{ width: isA5 ? "42px" : "48px" }} />}
        <col style={{ width: isA5 ? "66px" : "65px" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={headerCellStyle}>SR</th>
          <th style={headerCellStyle}>PARTICULARS</th>
          <th style={headerCellStyle}>HSN</th>
          <th style={headerCellStyle}>SIZE / QTY</th>
          <th style={headerCellStyle}>QTY</th>
          {!isA5 && <th style={headerCellStyle}>MRP</th>}
          <th style={headerCellStyle}>RATE</th>
          
          {showGSTBreakdown && <th style={headerCellStyle}>GST%</th>}
          {showGSTBreakdown && <th style={headerCellStyle}>GST AMT</th>}
          <th style={headerCellStyle}>AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        {pageItems.map((item, index) => (
          <tr key={index}>
            <td style={{ ...cellStyle, textAlign: "center" }}>{startIndex + index + 1}</td>
            <td style={cellStyle}>
              <div style={{ fontWeight: "700", fontSize: isA5 ? "6.5pt" : "8pt" }}>{item.particulars}</div>
              {item.color && <div style={{ fontSize: isA5 ? "5.5pt" : "7pt", color: "#555", fontStyle: "italic" }}>{item.color}</div>}
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
                 {item.gstAmount > 0 ? item.gstAmount.toFixed(2) : '-'}
               </td>
            )}
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: "700", fontSize: isA5 ? "7pt" : "7.5pt", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: isA5 ? "5px" : "6px" }}>
              {formatCurrencyPlain(item.totalAmount)}
            </td>
          </tr>
        ))}
        {/* Fill empty rows only on last page to maintain layout */}
        {isLastPage && (() => {
          const effectiveMin = typeof startIndex === 'number' ? getEffectiveMinRows(Math.max(0, totalPages - 1)) : 0;
          return Array.from({ length: Math.max(0, effectiveMin - pageItems.length) }).map((_, i) => (
          <tr key={`empty-${i}`} style={{ height: isA5 ? "16px" : "25px" }}>
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
          ));
        })()}
      </tbody>
      {/* Show totals footer only on last page */}
      {isLastPage && (
        <tfoot>
          <tr style={{ background: colors.light, fontWeight: "800" }}>
            <td colSpan={4} style={{ ...cellStyle, textAlign: "right", fontSize: isA5 ? "6.5pt" : "8pt" }}>
              TOTAL QTY:
            </td>
            <td style={{ ...cellStyle, textAlign: "center", fontWeight: "900" }}>{totalQty}</td>
            {!isA5 && <td style={cellStyle}>&nbsp;</td>}
            <td style={cellStyle}>&nbsp;</td>
            
            {showGSTBreakdown && <td style={cellStyle}>&nbsp;</td>}
            {showGSTBreakdown && <td style={{ ...cellStyle, textAlign: "right", fontSize: isA5 ? "5.5pt" : "7pt" }}>
              {(cgstAmount + sgstAmount) > 0 ? (cgstAmount + sgstAmount).toFixed(2) : ''}
            </td>}
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: "900", fontSize: isA5 ? "7pt" : "8pt", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", paddingRight: isA5 ? "5px" : "6px" }}>{formatCurrencyPlain(subtotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
    );
  };

  // Render summary section (only on last page)
  const renderSummary = () => (
    <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
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

        <div style={{ width: isA5 ? "180px" : "280px", flexShrink: 0, padding: isA5 ? "3px 6px 3px 4px" : "8px 10px", background: colors.light, boxSizing: "border-box", overflow: "visible" }}>
          <table style={{ width: "100%", fontSize: isA5 ? "6.5pt" : "9pt", fontWeight: "500", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <colgroup>
              <col style={{ width: "45%" }} />
              <col style={{ width: "55%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Sub Total:</td>
                <td style={{ textAlign: "right", padding: isA5 ? "1px 4px 1px 2px" : "4px 4px 4px 4px" }}>{formatCurrencyWithRs(subtotal)}</td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Total Discount:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 4px 1px 2px" : "4px 4px 4px 4px" }}>-{formatCurrencyWithRs(discount)}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>Taxable Amt:</td>
                <td style={{ textAlign: "right", padding: isA5 ? "1px 4px 1px 2px" : "4px 4px 4px 4px" }}>{formatCurrencyWithRs(calculatedTaxableAmount)}</td>
              </tr>
              {cgstAmount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>CGST:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 4px 1px 2px" : "4px 4px 4px 4px" }}>{formatCurrencyWithRs(cgstAmount)}</td>
                </tr>
              )}
              {sgstAmount > 0 && (
                <tr>
                  <td style={{ padding: isA5 ? "1px 2px 1px 0" : "4px 4px 4px 0", whiteSpace: "nowrap" }}>SGST:</td>
                  <td style={{ textAlign: "right", padding: isA5 ? "1px 4px 1px 2px" : "4px 4px 4px 4px" }}>{formatCurrencyWithRs(sgstAmount)}</td>
                </tr>
              )}
              <tr style={{ fontSize: isA5 ? "7.5pt" : "11pt", color: colors.primary }}>
                <td style={{ paddingTop: isA5 ? "3px" : "6px", borderTop: "1.5px solid #374151", whiteSpace: "nowrap", fontWeight: "600" }}>GRAND TOTAL:</td>
                <td
                  style={{ paddingTop: isA5 ? "3px" : "6px", borderTop: "1.5px solid #374151", textAlign: "right", fontWeight: "700", paddingRight: isA5 ? "4px" : "4px" }}
                >
                  {formatCurrencyWithRs(grandTotal)}
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
          padding: isA5 ? "4px 6px 2px" : "20px 10px 10px",
          borderTop: "1px solid #374151",
        }}
      >
        <div style={{ fontSize: isA5 ? "6pt" : "8pt" }}>
          {termsConditions && termsConditions.length > 0 ? (
            <p style={{ margin: 0 }}>
              <strong>Terms:</strong> {termsConditions.map((t, i) => (
                <span key={i}>{i > 0 && <br />}{i + 1}. {t}</span>
              ))}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong>Terms:</strong> 1. Goods once sold will not be taken back.
              <br />
              2. Subject to local jurisdiction.
            </p>
          )}
        </div>
        <div style={{ textAlign: "center", width: isA5 ? "150px" : "200px" }}>
          <div style={{ fontSize: isA5 ? "6pt" : "8pt", marginBottom: stampImageBase64 ? '4px' : (isA5 ? "12px" : "30px") }}>
            For <strong>{businessName}</strong>
          </div>
          {stampImageBase64 && (
            <img src={stampImageBase64} alt="Stamp" style={{
              width: stampSize === 'small' ? '80px' : stampSize === 'large' ? '160px' : '120px',
              maxHeight: '80px', objectFit: 'contain', margin: '2px auto',
            }} />
          )}
          <div style={{ borderTop: "1px solid #000", fontSize: isA5 ? "6pt" : "8pt" }}>Authorised Signatory</div>
        </div>
      </div>
    </div>
  );

  // Render page footer (shown on all pages)
  const renderPageFooter = (pageNum: number, isLastPage: boolean) => (
    <div style={{ 
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: isA5 ? "3px 6px" : "4px 8px", 
      fontSize: isA5 ? "6pt" : "8pt", 
      color: "#666",
      borderTop: "1px solid #374151",
      background: colors.light,
      flexShrink: 0,
    }}>
      <div style={{ fontStyle: "italic" }}>
        {!isLastPage ? "Continued on next page..." : `Invoice: ${invoiceNumber}`}
      </div>
      <div style={{ fontWeight: "600" }}>
        Page {pageNum} of {totalPages}
      </div>
    </div>
  );

  // Render a single page
  const renderPage = (pageItems: GroupedItem[], pageIndex: number) => {
    const isLastPage = pageIndex === totalPages - 1;
    const startIndex = pageStartIndices[pageIndex] || 0;

    const pageWidth = format === 'a4' ? "210mm" : format === 'a5-horizontal' ? "210mm" : "148mm";
    const pageHeight = format === 'a4' ? "297mm" : format === 'a5-horizontal' ? "148mm" : "210mm";
    const pagePadding = format === 'a5-vertical' ? "2mm" : format === 'a4' ? "6mm" : "5mm";

    return (
      <div
        key={pageIndex}
        className="invoice-page"
        style={{
          width: pageWidth,
          minHeight: isLastPage ? pageHeight : undefined,
          margin: "0 auto",
          padding: pagePadding,
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
          minHeight: isLastPage
            ? (format === 'a4' ? `calc(297mm - 12mm)` : format === 'a5-horizontal' ? `calc(148mm - 10mm)` : `calc(210mm - 4mm)`)
            : undefined,
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
          
          {renderPageFooter(pageIndex + 1, isLastPage)}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              size: ${format === 'a5-vertical' ? '148mm 210mm' : format === 'a5-horizontal' ? 'A5 landscape' : 'A4'};
              margin: ${format === 'a5-vertical' ? '2mm' : format === 'a4' ? '6mm' : '4mm'};
            }
            body { margin: 0; padding: 0; }
            .invoice-page {
              box-shadow: none !important;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .invoice-page:not(:last-child) {
              page-break-after: always;
              break-after: page;
            }
            .invoice-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .invoice-page th,
            .invoice-page thead th {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
              background: ${colors.gradient} !important;
              color: #fff !important;
            }
          }
        `}
      </style>

      {pages.map((pageItems, pageIndex) => renderPage(pageItems, pageIndex))}
    </>
  );
};

export default ModernWholesaleTemplate;
