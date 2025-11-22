import React, { forwardRef } from "react";
import { format } from "date-fns";

interface PurchaseReturnItem {
  id: string;
  product_name?: string;
  brand?: string;
  size: string;
  barcode?: string;
  qty: number;
  pur_price: number;
  line_total: number;
  gst_per: number;
}

interface PurchaseReturnPrintProps {
  returnData: {
    id: string;
    return_date: string;
    supplier_name: string;
    original_bill_number?: string;
    gross_amount: number;
    gst_amount: number;
    net_amount: number;
    notes?: string;
  };
  items: PurchaseReturnItem[];
  businessDetails?: {
    business_name?: string;
    address?: string;
    mobile_number?: string;
    gst_number?: string;
  };
}

export const PurchaseReturnPrint = forwardRef<HTMLDivElement, PurchaseReturnPrintProps>(
  ({ returnData, items, businessDetails }, ref) => {
    return (
      <div ref={ref} className="p-8 bg-white text-black" style={{ width: "210mm", minHeight: "297mm" }}>
        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">{businessDetails?.business_name || "Company Name"}</h1>
          {businessDetails?.address && (
            <p className="text-sm mb-1">{businessDetails.address}</p>
          )}
          {businessDetails?.mobile_number && (
            <p className="text-sm mb-1">Phone: {businessDetails.mobile_number}</p>
          )}
          {businessDetails?.gst_number && (
            <p className="text-sm mb-1">GSTIN: {businessDetails.gst_number}</p>
          )}
        </div>

        {/* Return Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-red-600">PURCHASE RETURN RECEIPT</h2>
        </div>

        {/* Return Details */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="mb-2">
              <span className="font-semibold">Supplier:</span> {returnData.supplier_name}
            </p>
            {returnData.original_bill_number && (
              <p className="mb-2">
                <span className="font-semibold">Original Bill No:</span> {returnData.original_bill_number}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="mb-2">
              <span className="font-semibold">Return Date:</span>{" "}
              {format(new Date(returnData.return_date), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6 border-collapse">
          <thead>
            <tr className="border-y-2 border-gray-800">
              <th className="text-left py-2 px-2 text-sm">#</th>
              <th className="text-left py-2 px-2 text-sm">Product</th>
              <th className="text-left py-2 px-2 text-sm">Brand</th>
              <th className="text-center py-2 px-2 text-sm">Size</th>
              <th className="text-center py-2 px-2 text-sm">Barcode</th>
              <th className="text-center py-2 px-2 text-sm">Qty</th>
              <th className="text-right py-2 px-2 text-sm">Price</th>
              <th className="text-right py-2 px-2 text-sm">GST%</th>
              <th className="text-right py-2 px-2 text-sm">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-300">
                <td className="py-2 px-2 text-sm">{index + 1}</td>
                <td className="py-2 px-2 text-sm">{item.product_name || "-"}</td>
                <td className="py-2 px-2 text-sm">{item.brand || "-"}</td>
                <td className="py-2 px-2 text-sm text-center">{item.size}</td>
                <td className="py-2 px-2 text-sm text-center">{item.barcode || "-"}</td>
                <td className="py-2 px-2 text-sm text-center">{item.qty}</td>
                <td className="py-2 px-2 text-sm text-right">₹{item.pur_price.toFixed(2)}</td>
                <td className="py-2 px-2 text-sm text-right">{item.gst_per}%</td>
                <td className="py-2 px-2 text-sm text-right font-medium">₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span>Gross Amount:</span>
              <span className="font-medium">₹{returnData.gross_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>GST Amount:</span>
              <span className="font-medium">₹{returnData.gst_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 border-t-2 border-gray-800">
              <span className="font-bold">Net Amount:</span>
              <span className="font-bold text-lg">₹{returnData.net_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {returnData.notes && (
          <div className="mb-6 text-sm">
            <p className="font-semibold mb-1">Notes:</p>
            <p className="text-gray-700">{returnData.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-400">
          <div className="flex justify-between text-sm">
            <div>
              <p className="mb-8">Received By:</p>
              <p className="border-t border-gray-400 pt-1">Signature</p>
            </div>
            <div className="text-right">
              <p className="mb-8">Authorized Signatory:</p>
              <p className="border-t border-gray-400 pt-1">Signature</p>
            </div>
          </div>
        </div>

        {/* Print Info */}
        <div className="mt-6 text-xs text-center text-gray-500">
          <p>This is a computer-generated document. No signature required.</p>
        </div>
      </div>
    );
  }
);

PurchaseReturnPrint.displayName = "PurchaseReturnPrint";
