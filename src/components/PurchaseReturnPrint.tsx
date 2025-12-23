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
    // Calculate total quantity
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    
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
            .pr-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
            }
            .pr-table th, .pr-table td {
              border: 1px solid #000;
              padding: 4px 6px;
            }
            .pr-table th {
              background-color: #f0f0f0;
              font-weight: 600;
              text-align: center;
            }
            .pr-table td {
              vertical-align: middle;
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

        {/* Items Table - Like Sale Invoice */}
        <table className="pr-table mb-3">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>SR</th>
              <th style={{ width: "30%" }}>PARTICULARS</th>
              <th style={{ width: "10%" }}>BRAND</th>
              <th style={{ width: "10%" }}>SIZE</th>
              <th style={{ width: "15%" }}>BARCODE</th>
              <th style={{ width: "6%" }}>QTY</th>
              <th style={{ width: "10%" }}>PRICE</th>
              <th style={{ width: "6%" }}>GST%</th>
              <th style={{ width: "10%" }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="text-center">{index + 1}</td>
                <td>{item.product_name || "-"}</td>
                <td className="text-center">{item.brand || "-"}</td>
                <td className="text-center">{item.size}</td>
                <td className="text-center">{item.barcode || "-"}</td>
                <td className="text-center">{item.qty}</td>
                <td className="text-right">₹{item.pur_price.toFixed(2)}</td>
                <td className="text-center">{item.gst_per}%</td>
                <td className="text-right">₹{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
            {/* Add empty rows to make minimum 5 rows */}
            {items.length < 5 && Array.from({ length: 5 - items.length }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td className="text-center">{items.length + index + 1}</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            {/* Total Row */}
            <tr className="font-semibold">
              <td colSpan={5} className="text-right">Total:</td>
              <td className="text-center">{totalQty}</td>
              <td colSpan={2}></td>
              <td className="text-right">₹{returnData.gross_amount.toFixed(2)}</td>
            </tr>
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
