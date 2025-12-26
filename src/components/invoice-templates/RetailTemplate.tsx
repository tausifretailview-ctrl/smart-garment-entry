import React from 'react';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  mrp?: number;
  qty: number;
  rate: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface RetailTemplateProps {
  businessName: string;
  address: string;
  mobile: string;
  email?: string;
  gstNumber?: string;
  logoUrl?: string;
  
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceTime?: string;
  
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  
  items: InvoiceItem[];
  
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  
  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  
  qrCodeUrl?: string;
  upiId?: string;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  declarationText?: string;
  termsConditions?: string[];
  
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  amountWithGrouping?: boolean;
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: string;
  fontFamily?: string;
  
  salesman?: string;
  
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
}

export const RetailTemplate: React.FC<RetailTemplateProps> = ({
  businessName,
  address,
  mobile,
  email,
  gstNumber,
  logoUrl,
  invoiceNumber,
  invoiceDate,
  invoiceTime,
  customerName,
  customerAddress,
  customerMobile,
  customerGSTIN,
  items,
  subtotal,
  discount,
  grandTotal,
  paymentMethod,
  paidAmount,
  qrCodeUrl,
  termsConditions = [],
  amountWithDecimal = true,
  amountWithGrouping = true,
  format = 'a5-vertical',
  salesman,
}) => {
  const isA4 = format === 'a4';
  const FIXED_ROWS = 8;

  // Format amount helper
  const formatAmount = (amount: number) => {
    const value = amountWithDecimal ? amount.toFixed(2) : Math.round(amount).toString();
    if (amountWithGrouping) {
      const parts = value.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }
    return value;
  };

  // Enforce exactly 8 rows
  const displayItems: (InvoiceItem | null)[] = [...items].slice(0, FIXED_ROWS);
  while (displayItems.length < FIXED_ROWS) {
    displayItems.push(null);
  }

  // Calculate total quantity
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  // Get dimensions based on format
  const getContainerStyle = (): React.CSSProperties => {
    if (isA4) {
      return {
        width: '210mm',
        minHeight: '297mm',
        padding: '8mm',
      };
    }
    // A5 vertical - strict fixed dimensions
    return {
      width: '148mm',
      height: '210mm',
      padding: '5mm',
    };
  };

  return (
    <div 
      className="retail-invoice-template bg-white text-black"
      style={{
        ...getContainerStyle(),
        fontFamily: 'Arial, sans-serif',
        fontSize: isA4 ? '11px' : '9px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        borderBottom: '2px solid #000',
        paddingBottom: '6px',
        marginBottom: '6px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isA4 ? '16px' : '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            {businessName}
          </div>
          <div style={{ fontSize: isA4 ? '9px' : '8px', marginTop: '2px' }}>{address}</div>
          <div style={{ fontSize: isA4 ? '9px' : '8px' }}>
            {mobile && `Mob: ${mobile}`}
            {email && ` | ${email}`}
          </div>
          {gstNumber && (
            <div style={{ fontSize: isA4 ? '9px' : '8px', fontWeight: 'bold' }}>GSTIN: {gstNumber}</div>
          )}
        </div>
        {logoUrl && (
          <img 
            src={logoUrl} 
            alt="Logo" 
            style={{ 
              maxHeight: isA4 ? '50px' : '40px', 
              maxWidth: '80px',
              objectFit: 'contain' 
            }} 
          />
        )}
      </div>

      {/* Tax Invoice Title */}
      <div style={{ 
        textAlign: 'center', 
        fontWeight: 'bold', 
        fontSize: isA4 ? '14px' : '12px',
        borderBottom: '1px solid #000',
        paddingBottom: '4px',
        marginBottom: '6px',
      }}>
        TAX INVOICE
      </div>

      {/* Customer & Invoice Details */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        borderBottom: '1px solid #000',
        paddingBottom: '6px',
        marginBottom: '6px',
        fontSize: isA4 ? '10px' : '8px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold' }}>BILL TO:</div>
          <div>{customerName || 'Walk-in Customer'}</div>
          {customerAddress && <div>{customerAddress}</div>}
          {customerMobile && <div>Ph: {customerMobile}</div>}
          {customerGSTIN && <div>GSTIN: {customerGSTIN}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div><strong>Invoice No:</strong> {invoiceNumber}</div>
          <div>
            <strong>Date:</strong> {invoiceDate.toLocaleDateString('en-IN')}
            {invoiceTime && ` ${invoiceTime}`}
          </div>
          {salesman && <div><strong>Salesman:</strong> {salesman}</div>}
          {paymentMethod && <div><strong>Payment:</strong> {paymentMethod}</div>}
        </div>
      </div>

      {/* Items Table - Fixed 8 rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '40px',
                textAlign: 'center',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Sr.</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px',
                textAlign: 'left',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Description</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '60px',
                textAlign: 'center',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Size</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '90px',
                textAlign: 'center',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Barcode</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '50px',
                textAlign: 'center',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Qty</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '80px',
                textAlign: 'right',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Rate</th>
              <th style={{ 
                border: '1px solid #000', 
                padding: '4px', 
                width: '90px',
                textAlign: 'right',
                fontSize: isA4 ? '10px' : '8px',
                fontWeight: 'bold',
              }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, index) => (
              <tr key={index}>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'center',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                }}>
                  {item ? index + 1 : ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item?.particulars || ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'center',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                }}>
                  {item?.size || ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'center',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '9px' : '7px',
                }}>
                  {item?.barcode || ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'center',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                }}>
                  {item ? item.qty : ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'right',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                }}>
                  {item ? formatAmount(item.rate) : ''}
                </td>
                <td style={{ 
                  border: '1px solid #000', 
                  padding: '4px', 
                  textAlign: 'right',
                  height: isA4 ? '28px' : '22px',
                  fontSize: isA4 ? '10px' : '8px',
                }}>
                  {item ? formatAmount(item.total) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Section - Fixed at bottom */}
      <div style={{ marginTop: 'auto' }}>
        {/* Totals Row */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          borderTop: '1px solid #000',
          paddingTop: '6px',
          marginTop: '6px',
        }}>
          {/* Terms & QR */}
          <div style={{ flex: 1, fontSize: isA4 ? '8px' : '7px' }}>
            {termsConditions.length > 0 && (
              <div>
                <strong>Terms & Conditions:</strong>
                <ul style={{ margin: '2px 0 0 12px', padding: 0 }}>
                  {termsConditions.slice(0, 3).map((term, i) => (
                    <li key={i}>{term}</li>
                  ))}
                </ul>
              </div>
            )}
            {qrCodeUrl && (
              <div style={{ marginTop: '4px' }}>
                <img src={qrCodeUrl} alt="UPI QR" style={{ width: '50px', height: '50px' }} />
              </div>
            )}
          </div>

          {/* Amount Summary */}
          <div style={{ 
            width: '180px',
            fontSize: isA4 ? '10px' : '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>Total Qty:</span>
              <span>{totalQty}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>Sub Total:</span>
              <span>₹{formatAmount(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>Discount:</span>
                <span>- ₹{formatAmount(discount)}</span>
              </div>
            )}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '4px',
              fontWeight: 'bold',
              fontSize: isA4 ? '12px' : '10px',
              border: '1px solid #000',
              backgroundColor: '#f0f0f0',
              marginTop: '4px',
            }}>
              <span>GRAND TOTAL:</span>
              <span>₹{formatAmount(grandTotal)}</span>
            </div>
            {paidAmount && paidAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', marginTop: '2px' }}>
                <span>Received:</span>
                <span>₹{formatAmount(paidAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Signature Section */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          marginTop: '12px',
          paddingTop: '6px',
          borderTop: '1px solid #000',
        }}>
          <div style={{ 
            fontSize: isA4 ? '9px' : '7px',
            textAlign: 'center',
          }}>
            <div style={{ borderTop: '1px solid #000', width: '100px', marginTop: '20px', paddingTop: '2px' }}>
              Customer Signature
            </div>
          </div>
          <div style={{ 
            fontSize: isA4 ? '9px' : '7px',
            textAlign: 'center',
          }}>
            <div style={{ borderTop: '1px solid #000', width: '100px', marginTop: '20px', paddingTop: '2px' }}>
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          @page { 
            size: ${isA4 ? 'A4 portrait' : 'A5 portrait'}; 
            margin: 0; 
          }
          .retail-invoice-template {
            width: ${isA4 ? '210mm' : '148mm'} !important;
            height: ${isA4 ? '297mm' : '210mm'} !important;
            padding: ${isA4 ? '8mm' : '5mm'} !important;
            page-break-after: always;
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
};
