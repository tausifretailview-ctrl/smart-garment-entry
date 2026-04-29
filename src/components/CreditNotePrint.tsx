import React from "react";
import { format as formatDate } from "date-fns";

interface CreditNotePrintProps {
  creditNote: {
    credit_note_number: string;
    customer_name: string;
    customer_phone?: string | null;
    credit_amount: number;
    issue_date: string;
    expiry_date?: string | null;
    notes?: string | null;
  };
  settings?: {
    business_name?: string;
    address?: string;
    mobile_number?: string;
    email_id?: string;
    gst_number?: string;
  } | null;
  format?: 'a4' | 'a5' | 'a5-horizontal' | 'thermal';
}

const numberToWords = (num: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToWords(-num);

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
      words += tens[Math.floor(num / 10)] + ' ' + ones[num % 10];
    }
  }

  return words.trim();
};

const amountInWords = (amount: number): string => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  
  let result = numberToWords(rupees) + ' Rupees';
  if (paise > 0) {
    result += ' and ' + numberToWords(paise) + ' Paise';
  }
  result += ' Only';
  return result;
};

export const CreditNotePrint = React.forwardRef<HTMLDivElement, CreditNotePrintProps>(
  ({ creditNote, settings, format = 'a5' }, ref) => {
    const isThermal = format === 'thermal';
    const pageSize = format === 'a4'
      ? 'A4 portrait'
      : format === 'a5-horizontal'
      ? 'A5 landscape'
      : format === 'thermal'
      ? '80mm auto'
      : 'A5 portrait';

    const containerWidth = isThermal ? '72mm' : (format === 'a4' ? '210mm' : '148mm');
    const containerMinHeight = isThermal ? 'auto' : (format === 'a4' ? '297mm' : '210mm');
    const containerPadding = isThermal ? '4mm' : '8mm';

    return (
      <div 
        ref={ref} 
        className="credit-note-print print-document"
        style={{ 
          fontFamily: 'Arial, sans-serif',
          width: containerWidth,
          minHeight: containerMinHeight,
          padding: containerPadding,
          backgroundColor: 'white',
          color: 'black',
          boxSizing: 'border-box'
        }}
      >
        <style>
          {`
            @media print {
              @page {
                size: ${pageSize};
                margin: ${isThermal ? '2mm' : '5mm'};
              }
              .credit-note-print {
                width: ${isThermal ? '76mm' : (format === 'a4' ? '200mm' : '138mm')} !important;
                min-height: ${isThermal ? 'auto' : (format === 'a4' ? '287mm' : '200mm')} !important;
                padding: ${isThermal ? '2mm' : '5mm'} !important;
              }
              .credit-note-print * {
                color: black !important;
                background-image: none !important;
                box-shadow: none !important;
              }
            }
          `}
        </style>

        {/* Header with Border */}
        <div style={{ 
          textAlign: 'center', 
          borderBottom: '2px solid #000', 
          paddingBottom: '10px', 
          marginBottom: '12px' 
        }}>
          <div style={{ 
            fontSize: '14pt', 
            fontWeight: 'bold',
            letterSpacing: '2px',
            padding: '6px 0',
            border: '2px solid #000',
            marginBottom: '10px'
          }}>
            CREDIT NOTE
          </div>
          {settings?.business_name && (
            <div style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '4px' }}>
              {settings.business_name}
            </div>
          )}
          {settings?.address && (
            <div style={{ fontSize: '9pt', marginBottom: '2px' }}>{settings.address}</div>
          )}
          {settings?.mobile_number && (
            <div style={{ fontSize: '9pt' }}>Ph: {settings.mobile_number}</div>
          )}
          {settings?.gst_number && (
            <div style={{ fontSize: '9pt', fontWeight: 'bold', marginTop: '4px' }}>
              GSTIN: {settings.gst_number}
            </div>
          )}
        </div>

        {/* Credit Note Details - Bordered Box */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          border: '1px solid #000',
          marginBottom: '12px',
          fontSize: '9pt'
        }}>
          <div style={{ padding: '8px', borderRight: '1px solid #000', flex: 1 }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Credit Note No:</div>
            <div style={{ fontSize: '11pt', fontWeight: 'bold' }}>{creditNote.credit_note_number}</div>
          </div>
          <div style={{ padding: '8px', flex: 1, textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Issue Date:</div>
          <div>{formatDate(new Date(creditNote.issue_date), 'dd/MM/yyyy')}</div>
          </div>
        </div>

        {/* Customer Details - Bordered Box */}
        <div style={{ 
          border: '1px solid #000', 
          padding: '10px', 
          marginBottom: '12px',
          fontSize: '9pt'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
            CUSTOMER DETAILS:
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>{creditNote.customer_name}</div>
          {creditNote.customer_phone && (
            <div style={{ marginTop: '4px' }}>Phone: {creditNote.customer_phone}</div>
          )}
        </div>

        {/* Amount Box - Prominent */}
        <div style={{ 
          border: '2px solid #000', 
          padding: '12px', 
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '9pt', marginBottom: '6px' }}>Credit Amount</div>
          <div style={{ fontSize: '18pt', fontWeight: 'bold' }}>
            ₹{creditNote.credit_amount.toFixed(2)}
          </div>
          <div style={{ 
            fontSize: '8pt', 
            marginTop: '8px', 
            fontStyle: 'italic',
            borderTop: '1px solid #ccc',
            paddingTop: '8px'
          }}>
            {amountInWords(creditNote.credit_amount)}
          </div>
        </div>

        {/* Expiry Date */}
        {creditNote.expiry_date && (
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '12px', 
            fontSize: '9pt',
            padding: '6px',
            border: '1px dashed #999'
          }}>
            <strong>Valid Until:</strong> {formatDate(new Date(creditNote.expiry_date), 'dd/MM/yyyy')}
          </div>
        )}

        {/* Notes */}
        {creditNote.notes && (
          <div style={{ 
            border: '1px solid #000', 
            padding: '8px', 
            marginBottom: '12px',
            fontSize: '8pt'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Notes:</div>
            <div>{creditNote.notes}</div>
          </div>
        )}

        {/* Terms */}
        <div style={{ 
          border: '1px solid #000', 
          padding: '8px', 
          marginBottom: '12px',
          fontSize: '7pt'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>
            Terms & Conditions:
          </div>
          <ol style={{ margin: 0, paddingLeft: '15px', lineHeight: 1.5 }}>
            <li>This credit note can be used for future purchases</li>
            <li>Not redeemable for cash</li>
            <li>Please present this note at the time of purchase</li>
            <li>Balance credit can be used in multiple transactions</li>
          </ol>
        </div>

        {/* Footer */}
        <div style={{ 
          marginTop: '15px', 
          paddingTop: '10px', 
          borderTop: '2px solid #000',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end'
        }}>
          <div style={{ fontSize: '8pt' }}>
            <div style={{ fontWeight: 'bold' }}>Thank you for your business!</div>
            <div style={{ fontSize: '7pt', marginTop: '4px', color: '#666' }}>
              This is a computer generated credit note
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '4px', minWidth: '100px' }}>
              <div style={{ fontSize: '8pt', fontWeight: 'bold' }}>Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

CreditNotePrint.displayName = "CreditNotePrint";
