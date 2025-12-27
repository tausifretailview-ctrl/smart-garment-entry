import { forwardRef } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface PaymentReceiptProps {
  receiptData: {
    voucherNumber: string;
    voucherDate: string;
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceAmount: number;
    paidAmount: number;
    paymentMethod: string;
    previousBalance: number;
    currentBalance: number;
  };
  companyDetails: {
    businessName?: string;
    address?: string;
    mobileNumber?: string;
    emailId?: string;
    gstNumber?: string;
    logoUrl?: string;
    upiId?: string;
  };
  receiptSettings?: {
    headerText?: string;
    footerText?: string;
    showCompanyLogo?: boolean;
    showQrCode?: boolean;
    showSignature?: boolean;
    signatureLabel?: string;
  };
}

export const PaymentReceipt = forwardRef<HTMLDivElement, PaymentReceiptProps>(
  ({ receiptData, companyDetails, receiptSettings = {} }, ref) => {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

    useEffect(() => {
      if (receiptSettings.showQrCode && companyDetails.upiId) {
        const upiString = `upi://pay?pa=${companyDetails.upiId}&pn=${encodeURIComponent(
          companyDetails.businessName || ""
        )}&am=${receiptData.paidAmount}&cu=INR`;

        QRCode.toDataURL(upiString, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
          .then(setQrCodeUrl)
          .catch(console.error);
      }
    }, [companyDetails.upiId, companyDetails.businessName, receiptData.paidAmount, receiptSettings.showQrCode]);

    return (
      <div
        ref={ref}
        className="bg-white p-8 max-w-[210mm] mx-auto"
        style={{
          fontFamily: "Arial, sans-serif",
          color: "#000",
          fontSize: "12px",
        }}
      >
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {receiptSettings.showCompanyLogo && companyDetails.logoUrl && (
                <img
                  src={companyDetails.logoUrl}
                  alt="Company Logo"
                  className="h-16 mb-2"
                />
              )}
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                {companyDetails.businessName || "Company Name"}
              </h1>
              <div className="text-gray-700 space-y-1">
                {companyDetails.address && <p>{companyDetails.address}</p>}
                <div className="flex gap-4">
                  {companyDetails.mobileNumber && <p>Phone: {companyDetails.mobileNumber}</p>}
                  {companyDetails.emailId && <p>Email: {companyDetails.emailId}</p>}
                </div>
                {companyDetails.gstNumber && <p>GSTIN: {companyDetails.gstNumber}</p>}
              </div>
            </div>
            {receiptSettings.showQrCode && qrCodeUrl && (
              <div className="ml-4">
                <img src={qrCodeUrl} alt="Payment QR Code" className="w-32 h-32" />
                <p className="text-xs text-center mt-1">Scan to Pay</p>
              </div>
            )}
          </div>
        </div>

        {/* Receipt Title */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">PAYMENT RECEIPT</h2>
          {receiptSettings.headerText && (
            <p className="text-sm text-gray-600">{receiptSettings.headerText}</p>
          )}
        </div>

        {/* Receipt Details */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="font-semibold text-gray-900">Receipt No:</p>
            <p className="text-gray-700">{receiptData.voucherNumber}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Receipt Date:</p>
            <p className="text-gray-700">
              {receiptData.voucherDate ? format(new Date(receiptData.voucherDate), "dd MMM yyyy") : "-"}
            </p>
          </div>
        </div>

        {/* Customer Details */}
        <div className="border border-gray-300 p-4 mb-6">
          <h3 className="font-bold text-gray-900 mb-2">Received From:</h3>
          <p className="text-gray-700 font-medium mb-1">{receiptData.customerName}</p>
          {receiptData.customerPhone && (
            <p className="text-gray-600 text-sm">Phone: {receiptData.customerPhone}</p>
          )}
          {receiptData.customerAddress && (
            <p className="text-gray-600 text-sm">{receiptData.customerAddress}</p>
          )}
        </div>

        {/* Payment Details Table */}
        <table className="w-full border border-gray-300 mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">Description</th>
              <th className="border border-gray-300 p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2">
                Payment for Invoice: {receiptData.invoiceNumber}
                <br />
                <span className="text-sm text-gray-600">
                  Invoice Date: {receiptData.invoiceDate ? format(new Date(receiptData.invoiceDate), "dd MMM yyyy") : "-"}
                </span>
              </td>
              <td className="border border-gray-300 p-2 text-right">
                ₹{receiptData.invoiceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Previous Balance</td>
              <td className="border border-gray-300 p-2 text-right font-medium">
                ₹{receiptData.previousBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr className="bg-green-50">
              <td className="border border-gray-300 p-2 font-bold">Amount Received</td>
              <td className="border border-gray-300 p-2 text-right font-bold text-green-700">
                ₹{receiptData.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Payment Method</td>
              <td className="border border-gray-300 p-2 text-right">
                {receiptData.paymentMethod?.toUpperCase() || '-'}
              </td>
            </tr>
            <tr className="bg-blue-50">
              <td className="border border-gray-300 p-2 font-bold">Current Balance</td>
              <td className="border border-gray-300 p-2 text-right font-bold text-blue-700">
                ₹{receiptData.currentBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Amount in Words */}
        <div className="mb-6">
          <p className="font-semibold text-gray-900">Amount in Words:</p>
          <p className="text-gray-700 italic">
            Rupees {numberToWords(receiptData.paidAmount)} Only
          </p>
        </div>

        {/* Signature Section */}
        {receiptSettings.showSignature && (
          <div className="flex justify-end mt-12 mb-6">
            <div className="text-center">
              <div className="border-t-2 border-gray-800 pt-2 w-48">
                <p className="font-semibold text-gray-900">
                  {receiptSettings.signatureLabel || "Authorized Signature"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {receiptSettings.footerText && (
          <div className="border-t-2 border-gray-300 pt-4 mt-6 text-center">
            <p className="text-sm text-gray-600">{receiptSettings.footerText}</p>
          </div>
        )}

        <div className="text-center text-xs text-gray-500 mt-4">
          <p>This is a computer-generated receipt and does not require a signature.</p>
        </div>
      </div>
    );
  }
);

PaymentReceipt.displayName = "PaymentReceipt";

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

  if (num === 0) return "Zero";

  const crores = Math.floor(num / 10000000);
  const lakhs = Math.floor((num % 10000000) / 100000);
  const thousands = Math.floor((num % 100000) / 1000);
  const hundreds = Math.floor((num % 1000) / 100);
  const remainder = Math.floor(num % 100);

  let words = "";

  if (crores > 0) {
    words += convertTwoDigit(crores) + " Crore ";
  }

  if (lakhs > 0) {
    words += convertTwoDigit(lakhs) + " Lakh ";
  }

  if (thousands > 0) {
    words += convertTwoDigit(thousands) + " Thousand ";
  }

  if (hundreds > 0) {
    words += ones[hundreds] + " Hundred ";
  }

  if (remainder > 0) {
    if (remainder < 10) {
      words += ones[remainder];
    } else if (remainder < 20) {
      words += teens[remainder - 10];
    } else {
      words += tens[Math.floor(remainder / 10)];
      if (remainder % 10 > 0) {
        words += " " + ones[remainder % 10];
      }
    }
  }

  // Handle decimal part
  const decimal = Math.round((num % 1) * 100);
  if (decimal > 0) {
    words += " and " + convertTwoDigit(decimal) + " Paise";
  }

  return words.trim();
}

function convertTwoDigit(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  return tens[Math.floor(num / 10)] + (num % 10 > 0 ? " " + ones[num % 10] : "");
}
