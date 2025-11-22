import { forwardRef } from "react";

interface SaleReturnItem {
  product_name: string;
  size: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  line_total: number;
}

interface SaleReturn {
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

export const SaleReturnPrint = forwardRef<HTMLDivElement, SaleReturnPrintProps>(
  ({ saleReturn, businessDetails }, ref) => {
    return (
      <div ref={ref} className="p-8 bg-white text-black">
        <style>
          {`
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          `}
        </style>

        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold">{businessDetails.business_name || "Business Name"}</h1>
          <p className="text-sm">{businessDetails.address || "Business Address"}</p>
          <p className="text-sm">
            Phone: {businessDetails.mobile_number || "N/A"} | GST: {businessDetails.gst_number || "N/A"}
          </p>
          <h2 className="text-xl font-bold mt-4">SALE RETURN RECEIPT</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm">
              <strong>Customer:</strong> {saleReturn.customer_name}
            </p>
            {saleReturn.original_sale_number && (
              <p className="text-sm">
                <strong>Original Sale:</strong> {saleReturn.original_sale_number}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm">
              <strong>Return Date:</strong> {new Date(saleReturn.return_date).toLocaleDateString()}
            </p>
          </div>
        </div>

        <table className="w-full mb-6 border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-2 text-sm">S.No</th>
              <th className="text-left py-2 text-sm">Product</th>
              <th className="text-left py-2 text-sm">Size</th>
              <th className="text-right py-2 text-sm">Qty</th>
              <th className="text-right py-2 text-sm">Price</th>
              <th className="text-right py-2 text-sm">GST%</th>
              <th className="text-right py-2 text-sm">Total</th>
            </tr>
          </thead>
          <tbody>
            {saleReturn.items?.map((item, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-2 text-sm">{index + 1}</td>
                <td className="py-2 text-sm">{item.product_name}</td>
                <td className="py-2 text-sm">{item.size}</td>
                <td className="text-right py-2 text-sm">{item.quantity}</td>
                <td className="text-right py-2 text-sm">₹{item.unit_price.toFixed(2)}</td>
                <td className="text-right py-2 text-sm">{item.gst_percent}%</td>
                <td className="text-right py-2 text-sm">₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-64">
            <div className="flex justify-between py-1 text-sm">
              <span>Gross Amount:</span>
              <span>₹{saleReturn.gross_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span>Total GST:</span>
              <span>₹{saleReturn.gst_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 border-t-2 border-black font-bold">
              <span>Net Return Amount:</span>
              <span>₹{saleReturn.net_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {saleReturn.notes && (
          <div className="mb-6">
            <p className="text-sm">
              <strong>Notes:</strong> {saleReturn.notes}
            </p>
          </div>
        )}

        <div className="text-center text-xs text-gray-600 mt-8 pt-4 border-t border-gray-300">
          <p>Thank you for your business</p>
        </div>
      </div>
    );
  }
);

SaleReturnPrint.displayName = "SaleReturnPrint";
