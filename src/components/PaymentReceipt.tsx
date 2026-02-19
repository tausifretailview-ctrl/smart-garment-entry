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
    discountAmount?: number;
    discountReason?: string;
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

    const invoiceAmount = receiptData?.invoiceAmount || 0;
    const previousBalance = receiptData?.previousBalance || 0;
    const paidAmount = receiptData?.paidAmount || 0;
    const currentBalance = receiptData?.currentBalance || 0;
    const discountAmount = receiptData?.discountAmount || 0;
    const discountReason = receiptData?.discountReason || '';
    const totalSettled = paidAmount + discountAmount;

    useEffect(() => {
      if (receiptSettings.showQrCode && companyDetails.upiId && paidAmount > 0) {
        const upiString = `upi://pay?pa=${companyDetails.upiId}&pn=${encodeURIComponent(
          companyDetails.businessName || ""
        )}&am=${paidAmount}&cu=INR`;

        QRCode.toDataURL(upiString, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
          .then(setQrCodeUrl)
          .catch(console.error);
      }
    }, [companyDetails.upiId, companyDetails.businessName, paidAmount, receiptSettings.showQrCode]);

    return (
      <div
        ref={ref}
        className="bg-white p-4 max-w-[210mm] mx-auto"
        style={{
          fontFamily: "Arial, sans-serif",
          color: "#000",
          fontSize: "11px",
        }}
      >
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-2 mb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {receiptSettings.showCompanyLogo && companyDetails.logoUrl && (
                <img
                  src={companyDetails.logoUrl}
                  alt="Company Logo"
                  className="h-12 mb-1"
                />
              )}
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                {companyDetails.businessName || "Company Name"}
              </h1>
              <div className="text-gray-700 text-[10px] leading-snug mt-0.5">
                {companyDetails.address && <p>{companyDetails.address}</p>}
                <p>
                  {companyDetails.mobileNumber && <>Phone: {companyDetails.mobileNumber}</>}
                  {companyDetails.mobileNumber && companyDetails.emailId && <>&nbsp;&nbsp;&nbsp;</>}
                  {companyDetails.emailId && <>Email: {companyDetails.emailId}</>}
                </p>
                {companyDetails.gstNumber && <p>GSTIN: {companyDetails.gstNumber}</p>}
              </div>
            </div>
            {receiptSettings.showQrCode && qrCodeUrl && (
              <div className="ml-2">
                <img src={qrCodeUrl} alt="Payment QR Code" className="w-24 h-24" />
                <p className="text-[9px] text-center">Scan to Pay</p>
              </div>
            )}
          </div>
        </div>

        {/* Receipt Title */}
        <div className="text-center mb-2">
          <h2 className="text-base font-bold text-gray-900">PAYMENT RECEIPT</h2>
          {receiptSettings.headerText && (
            <p className="text-[10px] text-gray-600">{receiptSettings.headerText}</p>
          )}
        </div>

        {/* Receipt Details */}
        <div className="grid grid-cols-2 gap-2 mb-2 text-[11px]">
          <div>
            <span className="font-semibold text-gray-900">Receipt No: </span>
            <span className="text-gray-700">{receiptData.voucherNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-900">Receipt Date: </span>
            <span className="text-gray-700">
              {receiptData.voucherDate ? format(new Date(receiptData.voucherDate), "dd MMM yyyy") : "-"}
            </span>
          </div>
        </div>

        {/* Customer Details */}
        <div className="border border-gray-300 p-2 mb-2 text-[11px]">
          <p className="font-bold text-gray-900 text-[10px] mb-0.5">Received From:</p>
          <p className="text-gray-700 font-medium">{receiptData.customerName}</p>
          {receiptData.customerPhone && (
            <span className="text-gray-600 text-[10px]">Phone: {receiptData.customerPhone}&nbsp;&nbsp;</span>
          )}
          {receiptData.customerAddress && (
            <span className="text-gray-600 text-[10px]">{receiptData.customerAddress}</span>
          )}
        </div>

        {/* Payment Details Table */}
        <table className="w-full border border-gray-300 mb-2 text-[11px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-1.5 text-left font-semibold">Description</th>
              <th className="border border-gray-300 p-1.5 text-right font-semibold w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-1.5">
                Payment for Invoice: {receiptData?.invoiceNumber || '-'}
                <span className="text-[10px] text-gray-600 ml-2">
                  ({receiptData?.invoiceDate ? format(new Date(receiptData.invoiceDate), "dd MMM yyyy") : "-"})
                </span>
              </td>
              <td className="border border-gray-300 p-1.5 text-right">
                ₹{Math.round(invoiceAmount).toLocaleString("en-IN")}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1.5">Previous Balance</td>
              <td className="border border-gray-300 p-1.5 text-right">
                ₹{Math.round(previousBalance).toLocaleString("en-IN")}
              </td>
            </tr>
            <tr className="bg-green-50">
              <td className="border border-gray-300 p-1.5 font-bold">Amount Received</td>
              <td className="border border-gray-300 p-1.5 text-right font-bold text-green-700">
                ₹{Math.round(paidAmount).toLocaleString("en-IN")}
              </td>
            </tr>
            {discountAmount > 0 && (
              <tr className="bg-amber-50">
                <td className="border border-gray-300 p-1.5">
                  Discount{discountReason && <span className="text-[9px] text-gray-500 ml-1">({discountReason})</span>}
                </td>
                <td className="border border-gray-300 p-1.5 text-right text-amber-700">
                  ₹{Math.round(discountAmount).toLocaleString("en-IN")}
                </td>
              </tr>
            )}
            {discountAmount > 0 && (
              <tr className="bg-emerald-50">
                <td className="border border-gray-300 p-1.5 font-bold">Total Settled</td>
                <td className="border border-gray-300 p-1.5 text-right font-bold text-emerald-700">
                  ₹{Math.round(totalSettled).toLocaleString("en-IN")}
                </td>
              </tr>
            )}
            <tr>
              <td className="border border-gray-300 p-1.5">Payment Method</td>
              <td className="border border-gray-300 p-1.5 text-right">
                {receiptData?.paymentMethod?.toUpperCase() || '-'}
              </td>
            </tr>
            <tr className="bg-blue-50">
              <td className="border border-gray-300 p-1.5 font-bold">Current Balance</td>
              <td className="border border-gray-300 p-1.5 text-right font-bold text-blue-700">
                ₹{Math.round(currentBalance).toLocaleString("en-IN")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Amount in Words */}
        <div className="mb-2 text-[10px]">
          <span className="font-semibold text-gray-900">Amount in Words: </span>
          <span className="text-gray-700 italic">
            Rupees {numberToWords(paidAmount)} Only
            {discountAmount > 0 && (
              <span className="ml-1">(Discount: Rupees {numberToWords(discountAmount)} Only)</span>
            )}
          </span>
        </div>

        {/* Signature Section */}
        {receiptSettings.showSignature && (
          <div className="flex justify-end mt-8 mb-2">
            <div className="text-center">
              <div className="border-t-2 border-gray-800 pt-1 w-40">
                <p className="font-semibold text-gray-900 text-[10px]">
                  {receiptSettings.signatureLabel || "Authorized Signature"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {receiptSettings.footerText && (
          <div className="border-t border-gray-300 pt-2 mt-2 text-center">
            <p className="text-[10px] text-gray-600">{receiptSettings.footerText}</p>
          </div>
        )}

        <div className="text-center text-[9px] text-gray-500 mt-2">
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
