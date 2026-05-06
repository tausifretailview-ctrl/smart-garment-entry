import React, { forwardRef } from "react";
import { format } from "date-fns";

interface PurchaseReturnItem {
  id: string;
  product_name?: string;
  brand?: string;
  color?: string;
  size: string;
  barcode?: string;
  hsn_code?: string;
  qty: number;
  pur_price: number;
  line_total: number;
  gst_per: number;
  remarks?: string;
  discount_percent?: number;
  discount_amount?: number;
}

interface BankDetails {
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_holder?: string;
}

interface PurchaseReturnPrintProps {
  returnData: {
    id: string;
    return_number?: string;
    return_date: string;
    supplier_name: string;
    supplier_address?: string;
    supplier_phone?: string;
    supplier_gst?: string;
    original_bill_number?: string;
    original_bill_date?: string;
    gross_amount: number;
    is_dc?: boolean;
    gst_amount: number;
    net_amount: number;
    notes?: string;
    discount_amount?: number;
    discount_percent?: number;
  };
  items: PurchaseReturnItem[];
  businessDetails?: {
    business_name?: string;
    address?: string;
    mobile_number?: string;
    email_id?: string;
    gst_number?: string;
    state?: string;
    city?: string;
  };
  saleSettings?: {
    terms_list?: string[];
    bank_details?: BankDetails;
    show_bank_details?: boolean;
    logo_url?: string;
  };
  logoUrl?: string;
}

// Number to words conversion
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
      if (num % 10 > 0) {
        words += ' ' + ones[num % 10];
      }
    }
  }
  
  return words.trim();
}

function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  
  let result = numberToWords(rupees) + ' Rupees';
  if (paise > 0) {
    result += ' and ' + numberToWords(paise) + ' Paise';
  }
  result += ' Only';
  
  return result.toUpperCase();
}

export const PurchaseReturnPrint = forwardRef<HTMLDivElement, PurchaseReturnPrintProps>(
  ({ returnData, items, businessDetails, saleSettings, logoUrl }, ref) => {
    const isDC = !!returnData.is_dc;
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const discountAmount = returnData.discount_amount || 0;
    const discountPercent = returnData.discount_percent || 0;
    const amountBeforeTax = returnData.gross_amount - discountAmount;
    
    
    
    // Get bank details from settings
    const bankDetails = saleSettings?.bank_details;
    const showBankDetails = saleSettings?.show_bank_details !== false && bankDetails;
    
    // Get logo URL
    const logo = logoUrl || saleSettings?.logo_url;
    
    return (
      <div ref={ref} className="bg-white text-black" style={{ width: "210mm", maxHeight: "297mm", fontFamily: "Arial, sans-serif", padding: "5mm" }}>
        <style>
          {`
            @media print {
              @page {
                size: A4;
                margin: 5mm;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
            .pr-border {
              border: 1px solid #000;
            }
            .pr-border-t { border-top: 1px solid #000; }
            .pr-border-b { border-bottom: 1px solid #000; }
            .pr-border-l { border-left: 1px solid #000; }
            .pr-border-r { border-right: 1px solid #000; }
            .pr-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            .pr-table th, .pr-table td {
              border: 1px solid #000;
              padding: 2px 4px;
            }
            .pr-table th {
              background-color: #f5f5f5;
              font-weight: 600;
              text-align: center;
            }
            .pr-cell {
              font-size: 12px;
              padding: 2px 4px;
            }
            .pr-label {
              font-weight: 600;
              min-width: 70px;
              display: inline-block;
            }
          `}
        </style>

        <div className="pr-border">
          {/* Header Section - Business name centered, logo on right */}
          <div className="flex items-start pr-border-b p-2">
            {/* Empty left space for balance */}
            <div style={{ flex: 1 }}></div>
            
            {/* Center - Business Name & Address */}
            <div style={{ flex: 2 }} className="text-center">
              <h1 className="text-xl font-bold mb-1">{businessDetails?.business_name || "Company Name"}</h1>
              <p className="text-sm">{businessDetails?.address || ""}</p>
              <p className="text-sm">
                {businessDetails?.mobile_number && `Phone: ${businessDetails.mobile_number}`}
                {businessDetails?.email_id && ` | Email: ${businessDetails.email_id}`}
              </p>
              <p className="text-sm font-semibold">GSTIN: {businessDetails?.gst_number || ""}</p>
            </div>
            
            {/* Right - Logo */}
            <div style={{ flex: 1 }} className="text-right">
              {logo ? (
                <img src={logo} alt="Logo" style={{ maxHeight: "50px", maxWidth: "80px", marginLeft: "auto" }} />
              ) : (
                <div className="text-xs text-gray-400 italic">Logo</div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="text-center pr-border-b py-1" style={{ backgroundColor: "#f5f5f5" }}>
            <h2 className="text-base font-bold">
              PURCHASE RETURN ({isDC ? "DELIVERY CHALLAN" : "DEBIT NOTE"})
            </h2>
          </div>

          {/* Billed To / Shipped To Section */}
          <div className="flex pr-border-b">
            <div className="w-1/2 pr-border-r p-1">
              <p className="text-sm font-bold mb-1 bg-gray-100 px-1">Details Of Supplier (Billed To)</p>
              <div className="pr-cell">
                <p><span className="pr-label">Name</span>: {returnData.supplier_name}</p>
                <p><span className="pr-label">Address</span>: {returnData.supplier_address || ""}</p>
                <p><span className="pr-label">City</span>: </p>
                <p><span className="pr-label">State</span>: MAHARASHTRA - 27</p>
                <p><span className="pr-label">GSTIN No</span>: {returnData.supplier_gst || ""}</p>
              </div>
            </div>
            <div className="w-1/2 p-1">
              <p className="text-sm font-bold mb-1 bg-gray-100 px-1">Details Of Consignee (Shipped To)</p>
              <div className="pr-cell">
                <p><span className="pr-label">Name</span>: {businessDetails?.business_name || ""}</p>
                <p><span className="pr-label">Address</span>: {businessDetails?.address || ""}</p>
                <p><span className="pr-label">City</span>: {businessDetails?.city || ""}</p>
                <p><span className="pr-label">State</span>: {businessDetails?.state || "MAHARASHTRA - 27"}</p>
                <p><span className="pr-label">Broker</span>: Direct Party</p>
              </div>
            </div>
          </div>

          {/* Return Details Section */}
          <div className="flex pr-border-b">
            <div className="w-1/2 pr-border-r p-1">
              <div className="pr-cell">
                <p><span className="pr-label">LrNo :</span></p>
                <p><span className="pr-label">Lr Dt :</span> {format(new Date(returnData.return_date), "dd/MM/yyyy")}</p>
                <p><span className="pr-label">Transport</span>:</p>
              </div>
            </div>
            <div className="w-1/2 p-1">
              <div className="flex">
                <div className="w-1/2 pr-cell">
                  <p><span className="pr-label">Return No</span>: {returnData.return_number || ""}</p>
                  <p><span className="pr-label">Return Dt</span>: {format(new Date(returnData.return_date), "dd/MM/yyyy")}</p>
                  <p><span className="pr-label">Party DebitNote No.</span>:</p>
                  <p><span className="pr-label">Party DebitNote Date:</span> {format(new Date(returnData.return_date), "dd/MM/yyyy")}</p>
                </div>
                <div className="w-1/2 pr-cell">
                  <p><span className="pr-label">S Bill No.</span>: {returnData.original_bill_number || ""}</p>
                  <p><span className="pr-label">S Bill Date.</span>: {returnData.original_bill_date ? format(new Date(returnData.original_bill_date), "dd/MM/yyyy") : ""}</p>
                  <p><span className="pr-label">Agst Bill No.</span>:</p>
                  <p><span className="pr-label">Agst Bill Date.</span>:</p>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="pr-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>Sr</th>
                <th style={{ width: "22%" }}>Description Of Goods</th>
                <th style={{ width: "8%" }}>Color</th>
                {!isDC && <th style={{ width: "8%" }}>Hsn Code</th>}
                <th style={{ width: "7%" }}>Pcs</th>
                <th style={{ width: "11%" }}>Rate</th>
                <th style={{ width: "8%" }}>Disc%</th>
                <th style={{ width: "11%" }}>Disc Amt</th>
                <th style={{ width: "11%" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="text-center">{index + 1}</td>
                  <td>{item.product_name || "-"}</td>
                  <td className="text-center">{item.color || "-"}</td>
                  {!isDC && <td className="text-center">{item.hsn_code || ""}</td>}
                  <td className="text-center">{item.qty}</td>
                  <td className="text-right">{item.pur_price.toFixed(2)}</td>
                  <td className="text-right">{(item.discount_percent || 0).toFixed(2)}</td>
                  <td className="text-right">{(item.discount_amount || 0).toFixed(2)}</td>
                  <td className="text-right">{item.line_total.toFixed(2)}</td>
                </tr>
              ))}
              {/* Add empty rows for minimum 10 rows */}
              {items.length < 10 && Array.from({ length: 10 - items.length }).map((_, index) => (
                <tr key={`empty-${index}`} style={{ height: "18px" }}>
                  <td>&nbsp;</td>
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
            </tbody>
          </table>

          {/* Total Row */}
          <div className="flex pr-border-t">
            <div className="pr-border-r p-1 text-center font-bold" style={{ width: "6%", fontSize: "12px" }}></div>
            <div className="pr-border-r p-1 font-bold" style={{ width: "22%", fontSize: "12px" }}>Total</div>
            <div className="pr-border-r p-1" style={{ width: "8%", fontSize: "12px" }}></div>
            {!isDC && <div className="pr-border-r p-1" style={{ width: "8%", fontSize: "12px" }}></div>}
            <div className="pr-border-r p-1 text-center font-bold" style={{ width: "7%", fontSize: "12px" }}>{totalQty}</div>
            <div className="pr-border-r p-1" style={{ width: "11%", fontSize: "12px" }}></div>
            <div className="pr-border-r p-1" style={{ width: "8%", fontSize: "12px" }}></div>
            <div className="pr-border-r p-1 text-right font-bold" style={{ width: "11%", fontSize: "12px" }}>{items.reduce((sum, item) => sum + (item.discount_amount || 0), 0).toFixed(2)}</div>
            <div className="p-1 text-right font-bold" style={{ width: "11%", fontSize: "12px" }}>{returnData.gross_amount.toFixed(2)}</div>
          </div>

          {/* Remark & Discount Row */}
          <div className="flex pr-border-t">
            <div className="w-1/2 pr-border-r p-1">
              <span className="text-sm font-bold">Remark:</span>
              <span className="text-sm ml-2">{returnData.notes || ""}</span>
            </div>
            <div className="w-1/2 flex">
              <div className="w-1/2 pr-border-r p-1 text-sm">Dis : {discountPercent.toFixed(2)}(%)</div>
              <div className="w-1/2 p-1 text-right text-sm">{discountAmount.toFixed(2)}</div>
            </div>
          </div>

          {/* Amount in Words & Summary Section */}
          <div className="flex pr-border-t">
            <div className="w-1/2 pr-border-r">
              <div className="p-1">
                <p className="text-sm"><span className="font-bold">In Words :</span> {amountInWords(returnData.net_amount)}</p>
              </div>
              
              {/* Bank Details */}
              {showBankDetails && (
                <div className="pr-border-t p-1">
                  <p className="text-sm font-bold mb-1">BANK DETAILS:</p>
                  {bankDetails?.bank_name && <p className="text-sm">Bank: {bankDetails.bank_name}</p>}
                  {bankDetails?.account_holder && <p className="text-sm">A/c Holder: {bankDetails.account_holder}</p>}
                  {bankDetails?.account_number && <p className="text-sm">A/c No: {bankDetails.account_number}</p>}
                  {bankDetails?.ifsc_code && <p className="text-sm">IFSC: {bankDetails.ifsc_code}</p>}
                </div>
              )}

            </div>

            {/* Amount Summary */}
            <div className="w-1/2">
              {!isDC && (
                <div className="flex pr-border-b">
                  <div className="w-2/3 pr-border-r p-1 text-sm font-bold">Total Amount Before Tax</div>
                  <div className="w-1/3 p-1 text-right text-sm">{amountBeforeTax.toFixed(2)}</div>
                </div>
              )}
              {!isDC && (
                <>
                  <div className="flex pr-border-b">
                    <div className="w-2/3 pr-border-r p-1 text-sm font-bold">Add : GST</div>
                    <div className="w-1/3 p-1 text-right text-sm">{returnData.gst_amount.toFixed(2)}</div>
                  </div>
                  <div className="flex pr-border-b">
                    <div className="w-2/3 pr-border-r p-1 text-sm font-bold">Total Amount After Tax</div>
                    <div className="w-1/3 p-1 text-right text-sm font-bold">{returnData.net_amount.toFixed(2)}</div>
                  </div>
                </>
              )}
              {isDC && (
                <div className="flex pr-border-b">
                  <div className="w-2/3 pr-border-r p-1 text-sm font-bold">Total Amount</div>
                  <div className="w-1/3 p-1 text-right text-sm font-bold">{returnData.net_amount.toFixed(2)}</div>
                </div>
              )}

              {/* Signatory */}
              <div className="p-2 text-center">
                <p className="text-sm font-bold mb-6">For, {businessDetails?.business_name || ""}</p>
                <p className="text-sm font-bold">Authorised Signatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PurchaseReturnPrint.displayName = "PurchaseReturnPrint";
