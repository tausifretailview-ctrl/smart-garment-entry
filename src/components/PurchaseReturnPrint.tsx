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
      <div ref={ref} className="p-6 bg-white text-black" style={{ width: "210mm", minHeight: "297mm", fontFamily: "Arial, sans-serif" }}>
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

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold">{businessDetails?.business_name || "Company Name"}</h1>
          {businessDetails?.address && (
            <p className="text-xs">{businessDetails.address}</p>
          )}
          {businessDetails?.mobile_number && (
            <p className="text-xs">Phone: {businessDetails.mobile_number}</p>
          )}
          {businessDetails?.gst_number && (
            <p className="text-xs">GSTIN: {businessDetails.gst_number}</p>
          )}
        </div>

        {/* Return Title */}
        <div className="mb-4">
          <h2 className="text-base font-bold">PURCHASE RETURN RECEIPT</h2>
        </div>

        {/* Return Details */}
        <div className="mb-3 text-xs">
          <p className="mb-1">
            <span className="font-semibold">Supplier:</span> {returnData.supplier_name}
          </p>
          {returnData.original_bill_number && (
            <p className="mb-1">
              <span className="font-semibold">Original Bill No:</span> {returnData.original_bill_number}
            </p>
          )}
          <p className="mb-1">
            <span className="font-semibold">Return Date:</span>{" "}
            {format(new Date(returnData.return_date), "dd MMM yyyy")}
          </p>
        </div>

        {/* Items Table */}
        <table className="w-full mb-2 border-collapse text-xs">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-1 px-1 font-semibold">#</th>
              <th className="text-left py-1 px-1 font-semibold">Product</th>
              <th className="text-left py-1 px-1 font-semibold">Brand</th>
              <th className="text-left py-1 px-1 font-semibold">Size</th>
              <th className="text-left py-1 px-1 font-semibold">Barcode</th>
              <th className="text-center py-1 px-1 font-semibold">Qty</th>
              <th className="text-right py-1 px-1 font-semibold">Price</th>
              <th className="text-center py-1 px-1 font-semibold">GST%</th>
              <th className="text-right py-1 px-1 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="py-0.5 px-1">{index + 1}</td>
                <td className="py-0.5 px-1">{item.product_name || "-"}</td>
                <td className="py-0.5 px-1">{item.brand || "-"}</td>
                <td className="py-0.5 px-1">{item.size}</td>
                <td className="py-0.5 px-1">{item.barcode || "-"}</td>
                <td className="py-0.5 px-1 text-center">{item.qty}</td>
                <td className="py-0.5 px-1 text-right">₹{item.pur_price.toFixed(2)}</td>
                <td className="py-0.5 px-1 text-center">{item.gst_per}%</td>
                <td className="py-0.5 px-1 text-right">₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Amount Details - Left aligned under table */}
        <div className="text-xs mb-4">
          <p>Gross Amount: ₹{returnData.gross_amount.toFixed(2)}</p>
          <p>GST Amount: ₹{returnData.gst_amount.toFixed(2)}</p>
          <p className="font-bold">Net Amount: ₹{returnData.net_amount.toFixed(2)}</p>
        </div>

        {/* Notes */}
        {returnData.notes && (
          <div className="mb-4 text-xs">
            <p className="font-semibold">Notes:</p>
            <p>{returnData.notes}</p>
          </div>
        )}

        {/* Signature Section */}
        <div className="mt-8 text-xs">
          <div className="flex justify-between items-end">
            <div>
              <p className="mb-6">Received By:</p>
              <p>Signature</p>
            </div>
            <div className="w-24 h-16 border border-black mr-8"></div>
          </div>
          
          <div className="mt-6">
            <p className="mb-6">Authorized Signatory:</p>
            <p>Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-xs text-center">
          <p>This is a computer-generated document. No signature required.</p>
        </div>
      </div>
    );
  }
);

PurchaseReturnPrint.displayName = "PurchaseReturnPrint";
