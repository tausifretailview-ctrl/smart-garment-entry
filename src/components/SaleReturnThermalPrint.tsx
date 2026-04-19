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

const dashedLine = '- - - - - - - - - - - - - - - - - - - -';

export const SaleReturnThermalPrint = forwardRef<HTMLDivElement, SaleReturnThermalPrintProps>(
  ({ saleReturn, businessDetails }, ref) => {
    const totalQty = saleReturn.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    const S: React.CSSProperties = {
      width: '80mm',
      padding: '4mm',
      fontFamily: "'Courier New', monospace",
      fontSize: '14px',
      fontWeight: 'bold',
      backgroundColor: 'white',
      color: 'black',
      boxSizing: 'border-box',
      lineHeight: 1.45,
    };

    return (
      <div ref={ref} className="sale-return-thermal" style={S}>
        <style>{`
          @media print {
            @page { size: 80mm auto; margin: 2mm; }
            .sale-return-thermal { width: 76mm !important; }
            .sale-return-thermal * { color: black !important; }
          }
        `}</style>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {businessDetails.business_name || 'Business Name'}
          </div>
          {businessDetails.address && (
            <div style={{ fontSize: '10px', marginTop: '2px' }}>{businessDetails.address}</div>
          )}
          {businessDetails.mobile_number && (
            <div style={{ fontSize: '10px' }}>Ph: {businessDetails.mobile_number}</div>
          )}
          {businessDetails.gst_number && (
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>GSTIN: {businessDetails.gst_number}</div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Title */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
          CREDIT NOTE
        </div>
        <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '2px' }}>
          (Sale Return)
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Meta info */}
        <div style={{ fontSize: '11px', margin: '4px 0' }}>
          {saleReturn.return_number && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Return No:</span>
              <span style={{ fontWeight: 'bold' }}>{saleReturn.return_number}</span>
            </div>
          )}
          {saleReturn.credit_note_number && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CN No:</span>
              <span style={{ fontWeight: 'bold' }}>{saleReturn.credit_note_number}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date:</span>
            <span>{new Date(saleReturn.return_date).toLocaleDateString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer:</span>
            <span style={{ fontWeight: 'bold', textAlign: 'right', maxWidth: '55%' }}>{saleReturn.customer_name}</span>
          </div>
          {saleReturn.original_sale_number && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Orig. Invoice:</span>
              <span>{saleReturn.original_sale_number}</span>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Column headers */}
        <div style={{ display: 'flex', fontSize: '10px', fontWeight: 'bold', padding: '2px 0' }}>
          <span style={{ width: '8%' }}>#</span>
          <span style={{ flex: 1 }}>Item</span>
          <span style={{ width: '12%', textAlign: 'center' }}>Qty</span>
          <span style={{ width: '22%', textAlign: 'right' }}>Rate</span>
          <span style={{ width: '22%', textAlign: 'right' }}>Amt</span>
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Items */}
        {saleReturn.items?.map((item, idx) => (
          <div key={idx} style={{ marginBottom: '3px' }}>
            <div style={{ display: 'flex', fontSize: '11px' }}>
              <span style={{ width: '8%' }}>{idx + 1}</span>
              <span style={{ flex: 1, fontWeight: 'bold' }}>{item.product_name}</span>
              <span style={{ width: '12%', textAlign: 'center' }}>{item.quantity}</span>
              <span style={{ width: '22%', textAlign: 'right' }}>{item.unit_price.toFixed(0)}</span>
              <span style={{ width: '22%', textAlign: 'right' }}>{item.line_total.toFixed(0)}</span>
            </div>
            {(item.size || item.color) && (
              <div style={{ fontSize: '9px', paddingLeft: '8%', color: '#444' }}>
                {item.size}{item.color ? ` / ${item.color}` : ''}
                {item.gst_percent > 0 ? ` (GST ${item.gst_percent}%)` : ''}
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Totals */}
        <div style={{ fontSize: '11px', margin: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Total Qty:</span>
            <span style={{ fontWeight: 'bold' }}>{totalQty}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Gross Amount:</span>
            <span>₹{saleReturn.gross_amount.toFixed(2)}</span>
          </div>
          {saleReturn.gst_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total GST:</span>
              <span>₹{saleReturn.gst_amount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Grand Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
          <span>NET CREDIT:</span>
          <span>₹{saleReturn.net_amount.toFixed(2)}</span>
        </div>

        <div style={{ fontSize: '9px', textAlign: 'center', fontStyle: 'italic', margin: '2px 0' }}>
          {numberToWords(Math.floor(saleReturn.net_amount))} Rupees Only
        </div>

        <div style={{ textAlign: 'center', fontSize: '9px', letterSpacing: '1px' }}>{dashedLine}</div>

        {/* Notes */}
        {saleReturn.notes && (
          <div style={{ fontSize: '10px', margin: '4px 0' }}>
            <span style={{ fontWeight: 'bold' }}>Note: </span>{saleReturn.notes}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '8px', color: '#444' }}>
          <div>This credit can be used for future purchases</div>
          <div>Not redeemable for cash</div>
          <div style={{ marginTop: '6px', fontWeight: 'bold' }}>Thank you!</div>
        </div>
      </div>
    );
  }
);

SaleReturnThermalPrint.displayName = "SaleReturnThermalPrint";
