import { forwardRef } from "react";

interface SaleReturnItem {
  product_name: string;
  size: string;
  color: string | null;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  line_total: number;
}

interface SaleReturn {
  return_number?: string | null;
  credit_note_number?: string | null;
  customer_name: string;
  original_sale_number: string | null;
  return_date: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  notes: string | null;
  items?: SaleReturnItem[];
  refund_type?: string | null;
  payment_method?: string | null;
}

interface BusinessDetails {
  business_name: string | null;
  address: string | null;
  mobile_number: string | null;
  gst_number: string | null;
}

interface SaleReturnThermalPrintProps {
  saleReturn: SaleReturn;
  businessDetails: BusinessDetails;
}

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (num === 0) return 'Zero';
  let words = '';
  if (Math.floor(num / 100000) > 0) { words += numberToWords(Math.floor(num / 100000)) + ' Lakh '; num %= 100000; }
  if (Math.floor(num / 1000) > 0) { words += numberToWords(Math.floor(num / 1000)) + ' Thousand '; num %= 1000; }
  if (Math.floor(num / 100) > 0) { words += numberToWords(Math.floor(num / 100)) + ' Hundred '; num %= 100; }
  if (num > 0) {
    if (num < 20) words += ones[num];
    else { words += tens[Math.floor(num / 10)]; if (num % 10 > 0) words += ' ' + ones[num % 10]; }
  }
  return words.trim();
}

const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 2)}..` : text;

export const SaleReturnThermalPrint = forwardRef<HTMLDivElement, SaleReturnThermalPrintProps>(
  ({ saleReturn, businessDetails }, ref) => {
    const totalQty = saleReturn.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const isRefund = saleReturn.refund_type === 'cash_refund';
    const returnDate = new Date(saleReturn.return_date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });

    const base: React.CSSProperties = {
      width: '72mm',
      maxWidth: '72mm',
      padding: '2mm 2mm 2mm 4mm',
      backgroundColor: 'white',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '13px',
      lineHeight: 1.45,
      color: '#000',
      fontWeight: 700,
      boxSizing: 'border-box',
      overflow: 'hidden',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    };

    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const row: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      gap: '4px',
    };
    const dblLine: React.CSSProperties = { borderTop: '2px solid #000', margin: '3px 0' };
    const singleLine: React.CSSProperties = { borderTop: '1px dashed #000', margin: '3px 0' };

    /** Column headers — div row prints darker/bolder on thermal than `<th>`. */
    const colHeadRow: React.CSSProperties = {
      display: 'flex',
      width: '100%',
      borderBottom: '2px solid #000',
      padding: '4px 0',
      marginBottom: '2px',
      fontSize: '14px',
      fontWeight: 900,
      color: '#000',
      textTransform: 'uppercase',
      letterSpacing: '0.6px',
      WebkitFontSmoothing: 'none',
      lineHeight: 1.2,
    };
    const colItem: React.CSSProperties = { width: '42%', textAlign: 'left' };
    const colQty: React.CSSProperties = { width: '14%', textAlign: 'center' };
    const colRate: React.CSSProperties = { width: '22%', textAlign: 'right' };
    const colAmt: React.CSSProperties = { width: '22%', textAlign: 'right' };

    return (
      <div ref={ref} className="thermal-print-80mm thermal-receipt-container sale-return-thermal" style={base}>
        <style>
          {`
            .sale-return-thermal .sr-thermal-col-head,
            .sale-return-thermal .sr-thermal-col-head span {
              color: #000 !important;
              font-weight: 900 !important;
              -webkit-font-smoothing: none !important;
              print-color-adjust: exact !important;
            }
            @media print {
              .sale-return-thermal .sr-thermal-col-head,
              .sale-return-thermal .sr-thermal-col-head span {
                font-size: 14px !important;
                font-weight: 900 !important;
                color: #000 !important;
              }
            }
          `}
        </style>
        {/* Header */}
        <div style={dblLine} />
        <div style={{ ...center, marginBottom: '4px' }}>
          <div style={{ fontWeight: 900, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {clip(businessDetails.business_name || 'Business Name', 24)}
          </div>
          {businessDetails.address && (
            <div style={{ fontSize: '11px', lineHeight: 1.3, wordBreak: 'break-word', marginTop: '2px' }}>
              {businessDetails.address}
            </div>
          )}
          {businessDetails.mobile_number && (
            <div style={{ fontSize: '11px' }}>Ph: {businessDetails.mobile_number}</div>
          )}
          {businessDetails.gst_number && (
            <div style={{ fontSize: '11px', fontWeight: 900 }}>GSTIN: {businessDetails.gst_number}</div>
          )}
        </div>
        <div style={dblLine} />

        {/* Title */}
        <div style={{ ...center, fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px', margin: '3px 0' }}>
          {isRefund ? 'REFUND' : 'CREDIT NOTE'}
        </div>
        <div style={{ ...center, fontSize: '11px', marginBottom: '2px' }}>(Sale Return)</div>
        <div style={singleLine} />

        {/* Meta */}
        <div style={{ fontSize: '12px', marginBottom: '3px' }}>
          {saleReturn.return_number && (
            <div style={row}>
              <span>Return:</span>
              <span style={{ fontWeight: 900, textAlign: 'right', wordBreak: 'break-all' }}>
                {saleReturn.return_number}
              </span>
            </div>
          )}
          {saleReturn.credit_note_number && (
            <div style={row}>
              <span>CN No:</span>
              <span style={{ fontWeight: 900, textAlign: 'right', wordBreak: 'break-all' }}>
                {saleReturn.credit_note_number}
              </span>
            </div>
          )}
          <div style={row}>
            <span>Date:</span>
            <span>{returnDate}</span>
          </div>
          {saleReturn.customer_name && (
            <div style={{ marginTop: '2px', wordBreak: 'break-word' }}>
              Cust: {clip(saleReturn.customer_name, 28)}
            </div>
          )}
          {saleReturn.original_sale_number && (
            <div style={row}>
              <span>Orig Inv:</span>
              <span style={{ textAlign: 'right', wordBreak: 'break-all' }}>
                {clip(saleReturn.original_sale_number, 16)}
              </span>
            </div>
          )}
        </div>

        <div style={singleLine} />

        {/* Column headers — bold div row (thermal-safe) */}
        <div className="sr-thermal-col-head" style={colHeadRow}>
          <span style={colItem}>ITEM</span>
          <span style={colQty}>QTY</span>
          <span style={colRate}>RATE</span>
          <span style={colAmt}>AMT</span>
        </div>

        {/* Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
          <tbody>
            {saleReturn.items?.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '0.5px dotted #000' }}>
                <td style={{ padding: '2px 0', lineHeight: 1.3, wordBreak: 'break-word', verticalAlign: 'top' }}>
                  {clip(item.product_name, 22)}
                  {(item.size || item.color) && (
                    <div style={{ fontSize: '10px', fontWeight: 700 }}>
                      {item.size}{item.color ? ` / ${item.color}` : ''}
                      {item.gst_percent > 0 ? ` GST${item.gst_percent}%` : ''}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', padding: '2px 0', verticalAlign: 'top', fontWeight: 900 }}>
                  {item.quantity}
                </td>
                <td style={{ textAlign: 'right', padding: '2px 0', verticalAlign: 'top' }}>
                  {fmtAmt(item.unit_price)}
                </td>
                <td style={{ textAlign: 'right', padding: '2px 0', verticalAlign: 'top', fontWeight: 900 }}>
                  {fmtAmt(item.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={singleLine} />

        {/* Totals */}
        <div style={{ fontSize: '12px' }}>
          <div style={row}>
            <span style={{ fontWeight: 900 }}>Total Qty:</span>
            <span style={{ fontWeight: 900 }}>{totalQty}</span>
          </div>
          <div style={row}>
            <span>Gross Amt:</span>
            <span>₹{fmtAmt(saleReturn.gross_amount)}</span>
          </div>
          {saleReturn.gst_amount > 0 && (
            <div style={row}>
              <span>Total GST:</span>
              <span>₹{fmtAmt(saleReturn.gst_amount)}</span>
            </div>
          )}
        </div>

        <div style={dblLine} />
        <div style={{ ...row, fontSize: '16px', fontWeight: 900, margin: '4px 0' }}>
          <span>{isRefund ? 'NET REFUND:' : 'NET CREDIT:'}</span>
          <span>₹{fmtAmt(saleReturn.net_amount)}</span>
        </div>
        <div style={dblLine} />

        <div style={{ fontSize: '10px', textAlign: 'center', fontStyle: 'italic', margin: '3px 0', lineHeight: 1.35 }}>
          {numberToWords(Math.floor(saleReturn.net_amount))} Rupees Only
        </div>

        {saleReturn.notes && (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '11px', wordBreak: 'break-word' }}>
              <span style={{ fontWeight: 900 }}>Note: </span>
              {clip(saleReturn.notes, 80)}
            </div>
          </>
        )}

        <div style={singleLine} />
        <div style={{ ...center, fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
          <div>This credit can be used for future purchases</div>
          <div>Not redeemable for cash</div>
          <div style={{ marginTop: '6px', fontWeight: 900, fontSize: '13px' }}>Thank you!</div>
        </div>
      </div>
    );
  }
);

SaleReturnThermalPrint.displayName = "SaleReturnThermalPrint";
