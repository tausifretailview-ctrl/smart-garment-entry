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

interface SaleReturnPrintProps {
  saleReturn: SaleReturn;
  businessDetails: BusinessDetails;
}

// Number to words helper
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
              'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToWords(Math.abs(num));
  
  let words = '';
  
  if (Math.floor(num / 10000000) > 0) {
    words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }
  if (Math.floor(num / 100) > 0) {
    words += numberToWords(Math.floor(num / 100)) + ' Hundred ';
    num %= 100;
  }
  if (num > 0) {
    if (num < 20) {
      words += ones[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10 > 0) words += ' ' + ones[num % 10];
    }
  }
  return words.trim();
}

function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let result = numberToWords(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + numberToWords(paise) + ' Paise';
  return result.toUpperCase() + ' ONLY';
}

export const SaleReturnPrint = forwardRef<HTMLDivElement, SaleReturnPrintProps>(
  ({ saleReturn, businessDetails }, ref) => {
    const totalQty = saleReturn.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    return (
      <div 
        ref={ref} 
        className="credit-note-print print-document"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '10mm',
          fontFamily: 'Arial, sans-serif',
          fontSize: '10pt',
          backgroundColor: 'white',
          color: 'black',
          boxSizing: 'border-box'
        }}
      >
        <style>
          {`
            @media print {
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              .credit-note-print {
                width: 200mm !important;
                min-height: 287mm !important;
              }
              .credit-note-print * {
                color: black !important;
                background-image: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
              .credit-note-print table,
              .credit-note-print th,
              .credit-note-print td {
                border: 1px solid #000 !important;
              }
            }
          `}
        </style>

        {/* Outer Border Container */}
        <div style={{ border: '2px solid #000' }}>
          {/* Company Header */}
          <div style={{ 
            textAlign: 'center', 
            borderBottom: '2px solid #000',
            padding: '10px'
          }}>
            <div style={{ fontSize: '16pt', fontWeight: 'bold', marginBottom: '4px' }}>
              {businessDetails.business_name || "Business Name"}
            </div>
            <div style={{ fontSize: '9pt', marginBottom: '2px' }}>
              {businessDetails.address || "Business Address"}
            </div>
            <div style={{ fontSize: '9pt' }}>
              Phone: {businessDetails.mobile_number || "N/A"} | GSTIN: {businessDetails.gst_number || "N/A"}
            </div>
          </div>

          {/* Document Title */}
          <div style={{ 
            textAlign: 'center', 
            borderBottom: '2px solid #000',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            fontSize: '14pt',
            fontWeight: 'bold',
            letterSpacing: '2px'
          }}>
            CREDIT NOTE (SALE RETURN)
          </div>

          {/* Customer & Return Details */}
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
            <div style={{ flex: 1, padding: '8px', borderRight: '1px solid #000', fontSize: '9pt' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                CUSTOMER DETAILS:
              </div>
              <div><strong>Name:</strong> {saleReturn.customer_name}</div>
              {saleReturn.original_sale_number && (
                <div><strong>Original Invoice:</strong> {saleReturn.original_sale_number}</div>
              )}
            </div>
            <div style={{ width: '40%', padding: '8px', fontSize: '9pt' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                RETURN DETAILS:
              </div>
              {saleReturn.return_number && (
                <div><strong>Return No:</strong> {saleReturn.return_number}</div>
              )}
              {saleReturn.credit_note_number && (
                <div><strong>Credit Note No:</strong> {saleReturn.credit_note_number}</div>
              )}
              <div><strong>Return Date:</strong> {new Date(saleReturn.return_date).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {/* Items Table */}
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '9pt'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ border: '1px solid #000', padding: '6px', width: '6%', fontWeight: 'bold' }}>Sr.</th>
                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', fontWeight: 'bold' }}>Product Description</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '10%', fontWeight: 'bold' }}>Size</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '10%', fontWeight: 'bold' }}>Color</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '8%', fontWeight: 'bold' }}>Qty</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '12%', fontWeight: 'bold', textAlign: 'right' }}>Rate</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '8%', fontWeight: 'bold', textAlign: 'center' }}>GST %</th>
                <th style={{ border: '1px solid #000', padding: '6px', width: '14%', fontWeight: 'bold', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {saleReturn.items?.map((item, index) => (
                <tr key={index}>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{index + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>{item.product_name}</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{item.size}</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{item.color || '-'}</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>₹{item.unit_price.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{item.gst_percent}%</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>₹{item.line_total.toFixed(2)}</td>
                </tr>
              ))}
              {/* Empty rows for minimum display */}
              {(saleReturn.items?.length || 0) < 8 && Array.from({ length: 8 - (saleReturn.items?.length || 0) }).map((_, index) => (
                <tr key={`empty-${index}`}>
                  <td style={{ border: '1px solid #000', padding: '5px', height: '20px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>&nbsp;</td>
                </tr>
              ))}
              {/* Total Row */}
              <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>TOTAL</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{totalQty}</td>
                <td style={{ border: '1px solid #000', padding: '6px' }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '6px' }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₹{saleReturn.gross_amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          {/* Amount Summary & Amount in Words */}
          <div style={{ display: 'flex', borderTop: '1px solid #000' }}>
            {/* Amount in Words */}
            <div style={{ flex: 1, padding: '10px', borderRight: '1px solid #000', fontSize: '9pt' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Amount in Words:</div>
              <div style={{ fontStyle: 'italic' }}>{amountInWords(saleReturn.net_amount)}</div>
              
              {saleReturn.notes && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #ccc' }}>
                  <strong>Notes:</strong> {saleReturn.notes}
                </div>
              )}
            </div>

            {/* Amount Summary */}
            <div style={{ width: '40%', fontSize: '9pt' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #ddd' }}>
                <span>Gross Amount:</span>
                <span>₹{saleReturn.gross_amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #ddd' }}>
                <span>Total GST:</span>
                <span>₹{saleReturn.gst_amount.toFixed(2)}</span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '8px 10px',
                backgroundColor: '#f0f0f0',
                fontWeight: 'bold',
                fontSize: '11pt'
              }}>
                <span>NET CREDIT AMOUNT:</span>
                <span>₹{saleReturn.net_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Declaration & Signature */}
          <div style={{ 
            display: 'flex', 
            borderTop: '2px solid #000',
            padding: '10px',
            fontSize: '8pt'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Declaration:</div>
              <div style={{ lineHeight: 1.4 }}>
                We declare that this credit note shows the actual credit amount for goods returned.
                This credit can be adjusted against future purchases.
              </div>
            </div>
            <div style={{ width: '150px', textAlign: 'center', paddingTop: '30px' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
                <div style={{ fontWeight: 'bold' }}>Authorised Signatory</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ 
            textAlign: 'center', 
            borderTop: '1px solid #000',
            padding: '8px',
            fontSize: '8pt',
            color: '#666'
          }}>
            Thank you for your business
          </div>
        </div>
      </div>
    );
  }
);

SaleReturnPrint.displayName = "SaleReturnPrint";
