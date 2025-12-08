import React from "react";
import { format } from "date-fns";

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
  ({ creditNote, settings }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8 max-w-md mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* Header */}
        <div className="text-center border-b-2 border-purple-600 pb-4 mb-4">
          <h1 className="text-2xl font-bold text-purple-700">CREDIT NOTE</h1>
          {settings?.business_name && (
            <h2 className="text-lg font-semibold mt-2">{settings.business_name}</h2>
          )}
          {settings?.address && (
            <p className="text-sm text-gray-600">{settings.address}</p>
          )}
          {settings?.mobile_number && (
            <p className="text-sm text-gray-600">Ph: {settings.mobile_number}</p>
          )}
          {settings?.gst_number && (
            <p className="text-sm text-gray-600">GSTIN: {settings.gst_number}</p>
          )}
        </div>

        {/* Credit Note Details */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <p className="font-semibold">Credit Note No:</p>
            <p className="text-purple-700 font-bold">{creditNote.credit_note_number}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Issue Date:</p>
            <p>{format(new Date(creditNote.issue_date), 'dd/MM/yyyy')}</p>
          </div>
        </div>

        {/* Customer Details */}
        <div className="bg-purple-50 p-3 rounded-lg mb-4">
          <p className="font-semibold text-sm">Customer:</p>
          <p className="font-bold">{creditNote.customer_name}</p>
          {creditNote.customer_phone && (
            <p className="text-sm text-gray-600">Ph: {creditNote.customer_phone}</p>
          )}
        </div>

        {/* Amount */}
        <div className="bg-purple-100 p-4 rounded-lg mb-4 text-center">
          <p className="text-sm text-gray-600">Credit Amount</p>
          <p className="text-3xl font-bold text-purple-700">
            ₹{creditNote.credit_amount.toFixed(2)}
          </p>
          <p className="text-xs text-gray-600 mt-2 italic">
            {amountInWords(creditNote.credit_amount)}
          </p>
        </div>

        {/* Expiry Date (if any) */}
        {creditNote.expiry_date && (
          <div className="text-center text-sm mb-4">
            <p className="text-gray-600">
              Valid Until: <span className="font-semibold">{format(new Date(creditNote.expiry_date), 'dd/MM/yyyy')}</span>
            </p>
          </div>
        )}

        {/* Notes */}
        {creditNote.notes && (
          <div className="border-t pt-3 mb-4">
            <p className="text-sm font-semibold">Notes:</p>
            <p className="text-sm text-gray-600">{creditNote.notes}</p>
          </div>
        )}

        {/* Terms */}
        <div className="border-t pt-3 text-xs text-gray-500">
          <p className="font-semibold mb-1">Terms & Conditions:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>This credit note can be used for future purchases</li>
            <li>Not redeemable for cash</li>
            <li>Please present this note at the time of purchase</li>
            <li>Balance credit can be used in multiple transactions</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-sm font-semibold">Thank you for your business!</p>
          <p className="text-xs text-gray-500 mt-1">
            This is a computer generated credit note
          </p>
        </div>
      </div>
    );
  }
);

CreditNotePrint.displayName = "CreditNotePrint";
