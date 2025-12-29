import React from "react";
import { numberToWords } from "@/lib/utils";

// ... (Interfaces remain the same as your provided code)

export const ModernWholesaleTemplate: React.FC<ModernWholesaleTemplateProps> = ({
  // ... (Props remain the same)
  minItemRows = 12, // Increased default rows to fill space better
  // ...
}) => {
  const colors = colorSchemes[colorScheme] || colorSchemes.blue;
  const font = fontFamilyMap[fontFamily] || fontFamilyMap.inter;

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: amountWithDecimal ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const groupItems = (items: WholesaleItem[]): GroupedItem[] => {
    if (!enableWholesaleGrouping) {
      return items.map((item) => ({
        particulars: item.particulars,
        brand: item.brand,
        color: item.color,
        style: item.style,
        hsn: item.hsn,
        rate: item.rate,
        mrp: item.mrp,
        gstPercent: item.gstPercent,
        sizeQtyList: [{ size: item.size, qty: item.qty }],
        totalQty: item.qty,
        totalAmount: item.total,
      }));
    }

    const grouped: Record<string, GroupedItem> = {};
    items.forEach((item) => {
      const key = `${item.particulars}-${item.rate}`;
      if (!grouped[key]) {
        grouped[key] = {
          particulars: item.particulars,
          brand: item.brand,
          color: item.color,
          style: item.style,
          hsn: item.hsn,
          rate: item.rate,
          mrp: item.mrp,
          gstPercent: item.gstPercent,
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

  // STYLES UPDATED FOR ALIGNMENT
  const cellStyle: React.CSSProperties = {
    border: "1px solid #374151",
    padding: "6px 4px",
    fontSize: "8.5pt",
    verticalAlign: "middle", // Better for multiline size grouping
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

  return (
    <>
      <style>
        {`
          @media print {
            @page { size: A4; margin: 10mm; }
            body { margin: 0; padding: 0; }
            .invoice-container { box-shadow: none !important; border: none !important; }
          }
        `}
      </style>

      <div
        className="invoice-container"
        style={{
          width: "190mm", // Adjusted for A4 safe printable area
          minHeight: "277mm",
          margin: "0 auto",
          padding: "0",
          fontFamily: font,
          backgroundColor: "#fff",
          boxSizing: "border-box",
        }}
      >
        {/* Main Border Wrapper */}
        <div style={{ border: "1.5px solid #374151", height: "100%" }}>
          {/* Header (Business Details) */}
          <div style={{ display: "flex", borderBottom: "1.5px solid #374151", background: colors.light }}>
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
                <img src={logoUrl} style={{ maxWidth: "100%" }} />
              ) : (
                <div style={{ fontSize: "8pt" }}>LOGO</div>
              )}
            </div>
            <div style={{ flex: 1, padding: "10px", textAlign: "center" }}>
              <h1 style={{ fontSize: "18pt", fontWeight: "800", color: colors.primary, margin: 0 }}>{businessName}</h1>
              <p style={{ fontSize: "9pt", margin: "2px 0" }}>{address}</p>
              <p style={{ fontSize: "9pt", fontWeight: "600" }}>
                GSTIN: {gstNumber} | Mob: {mobile}
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

          {/* Customer Row */}
          <div style={{ display: "flex", borderBottom: "1px solid #374151", fontSize: "9pt" }}>
            <div style={{ flex: 1, padding: "8px", borderRight: "1px solid #374151" }}>
              <div style={{ fontWeight: "700", color: colors.primary, fontSize: "7pt" }}>BILL TO:</div>
              <div style={{ fontWeight: "700", fontSize: "11pt" }}>{customerName}</div>
              <div>{customerAddress}</div>
              {customerGSTIN && (
                <div>
                  <strong>GSTIN: {customerGSTIN}</strong>
                </div>
              )}
            </div>
            <div style={{ width: "180px", padding: "8px", background: colors.light }}>
              <table style={{ width: "100%", fontSize: "9pt" }}>
                <tr>
                  <td>Inv No:</td>
                  <td style={{ fontWeight: "700" }}>{invoiceNumber}</td>
                </tr>
                <tr>
                  <td>Date:</td>
                  <td style={{ fontWeight: "700" }}>{invoiceDate.toLocaleDateString("en-IN")}</td>
                </tr>
              </table>
            </div>
          </div>

          {/* Items Table - FIXED LAYOUT FOR PROPER ALIGNMENT */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, width: "30px" }}>SR</th>
                <th style={{ ...headerCellStyle, width: "180px" }}>PARTICULARS</th>
                <th style={{ ...headerCellStyle, width: "130px" }}>SIZE / QTY</th>
                <th style={{ ...headerCellStyle, width: "40px" }}>QTY</th>
                <th style={{ ...headerCellStyle, width: "70px" }}>RATE</th>
                {showGSTBreakdown && <th style={{ ...headerCellStyle, width: "40px" }}>GST%</th>}
                <th style={{ ...headerCellStyle, width: "80px" }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((item, index) => (
                <tr key={index}>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{index + 1}</td>
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
                  <td style={{ ...cellStyle, textAlign: "right" }}>{item.rate.toFixed(2)}</td>
                  {showGSTBreakdown && <td style={{ ...cellStyle, textAlign: "center" }}>{item.gstPercent}%</td>}
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: "700" }}>
                    {formatCurrency(item.totalAmount)}
                  </td>
                </tr>
              ))}
              {/* Spacer rows */}
              {Array.from({ length: Math.max(0, minItemRows - groupedItems.length) }).map((_, i) => (
                <tr key={`empty-${i}`} style={{ height: "25px" }}>
                  <td style={cellStyle}>&nbsp;</td>
                  <td style={cellStyle}>&nbsp;</td>
                  <td style={cellStyle}>&nbsp;</td>
                  <td style={cellStyle}>&nbsp;</td>
                  <td style={cellStyle}>&nbsp;</td>
                  {showGSTBreakdown && <td style={cellStyle}>&nbsp;</td>}
                  <td style={cellStyle}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: colors.light, fontWeight: "800" }}>
                <td colSpan={3} style={{ ...cellStyle, textAlign: "right" }}>
                  TOTAL QTY:
                </td>
                <td style={{ ...cellStyle, textAlign: "center" }}>{totalQty}</td>
                <td colSpan={showGSTBreakdown ? 2 : 1} style={{ ...cellStyle, textAlign: "right" }}>
                  SUB TOTAL:
                </td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{formatCurrency(subtotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Bottom Summary Section */}
          <div style={{ display: "flex", borderTop: "1px solid #374151" }}>
            <div style={{ flex: 1, padding: "8px", borderRight: "1px solid #374151" }}>
              <div style={{ fontSize: "7pt", fontWeight: "700" }}>AMOUNT IN WORDS:</div>
              <div style={{ fontSize: "9pt", fontStyle: "italic" }}>{numberToWords(grandTotal)} Only</div>

              <div style={{ marginTop: "10px" }}>
                <div style={{ fontSize: "7pt", fontWeight: "700" }}>BANK DETAILS:</div>
                <div style={{ fontSize: "8pt" }}>
                  {bankDetails?.bank_name} | A/C: {bankDetails?.account_number}
                  <br />
                  IFSC: {bankDetails?.ifsc_code}
                </div>
              </div>
            </div>

            <div style={{ width: "220px", padding: "8px", background: colors.light }}>
              <table style={{ width: "100%", fontSize: "9pt", fontWeight: "600" }}>
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
        </div>
      </div>
    </>
  );
};

export default ModernWholesaleTemplate;
