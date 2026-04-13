import React from 'react';
import { numberToWords } from '@/lib/utils';
import '@/styles/print-invoice-core.css';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  mrp?: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  gstPercent?: number;
}

interface WholesaleA5TemplateProps {
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
  salesman?: string;
  notes?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  saleReturnAdjust?: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalSavings?: number;
  showMRP?: boolean;
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  amountWithGrouping?: boolean;
  paymentMethod?: string;
  amountPaid?: number;
  balanceDue?: number;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  paidAmount?: number;
  declarationText?: string;
  termsConditions?: string[];
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch?: string;
  };
  format?: 'a5-vertical' | 'a5-horizontal' | 'a4';
  colorScheme?: string;
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: string;
  fontFamily?: string;
  qrCodeUrl?: string;
  upiId?: string;
  enableWholesaleGrouping?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  stampImageBase64?: string;
  stampPosition?: 'bottom-right' | 'bottom-left';
  stampSize?: 'small' | 'medium' | 'large';
  transportDetails?: string;
  shippingAddress?: string;
}

const fmt = (n: number, decimal = true, grouping = true) => {
  if (!decimal && !grouping) return String(Math.round(n));
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimal ? 2 : 0,
    maximumFractionDigits: decimal ? 2 : 0,
  });
};

export const WholesaleA5Template: React.FC<WholesaleA5TemplateProps> = ({
  businessName,
  address,
  mobile,
  gstNumber,
  invoiceNumber,
  invoiceDate,
  customerName,
  customerMobile,
  customerAddress,
  salesman,
  items,
  subtotal,
  discount,
  totalTax,
  roundOff,
  grandTotal,
  showTotalQuantity = true,
  amountWithDecimal = true,
  termsConditions,
  cashAmount,
  cardAmount,
  upiAmount,
  amountPaid,
  balanceDue,
  transportDetails,
  shippingAddress,
  stampImageBase64,
  stampPosition = 'bottom-right',
  stampSize = 'medium',
  customHeaderText,
}) => {
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const dateStr = invoiceDate instanceof Date
    ? `${String(invoiceDate.getDate()).padStart(2, '0')}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${invoiceDate.getFullYear()}`
    : String(invoiceDate);

  const amtWords = numberToWords(Math.round(grandTotal));
  const MIN_ROWS = 6;
  const emptyRows = Math.max(0, MIN_ROWS - items.length);

  const advReceiptAmt = (amountPaid ?? 0);
  const balance = balanceDue ?? (grandTotal - advReceiptAmt);

  const stampSizeMap = { small: 50, medium: 70, large: 90 };
  const sSize = stampSizeMap[stampSize] || 70;

  // Common cell style
  const cellBorder = '1px solid #000';
  const headerBg = '#444';
  const headerColor = '#fff';
  const darkRowBg = '#555';

  return (
    <div
      className="wholesale-a5-invoice"
      style={{
        width: '148mm',
        minHeight: '210mm',
        margin: '0 auto',
        padding: '3mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9pt',
        color: '#000',
        background: '#fff',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* ===== HEADER: Business Name ===== */}
      <div style={{ textAlign: 'center', marginBottom: '2mm' }}>
        <div style={{ fontSize: '18pt', fontWeight: 900, letterSpacing: 1, background: headerBg, color: headerColor, padding: '2mm 0', marginBottom: '1mm' }}>
          {businessName}
        </div>
        {customHeaderText && (
          <div style={{ fontSize: '8pt', fontWeight: 600, marginBottom: '0.5mm' }}>{customHeaderText}</div>
        )}
        <div style={{ fontSize: '7.5pt', lineHeight: 1.4 }}>
          {address}
        </div>
        <div style={{ fontSize: '7.5pt' }}>
          Mob: {mobile}
        </div>
        {gstNumber && (
          <div style={{ fontSize: '7pt', marginTop: '0.5mm' }}>GSTIN: {gstNumber}</div>
        )}
      </div>

      {/* ===== META: Invoice No, Date, Salesman, Customer ===== */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1mm', fontSize: '8pt' }}>
        <tbody>
          <tr>
            <td style={{ border: cellBorder, padding: '1mm 2mm', width: '50%', background: '#e8e8e8' }}>
              <strong>EST NO :</strong> {invoiceNumber}
            </td>
            <td style={{ border: cellBorder, padding: '1mm 2mm', background: '#e8e8e8' }}>
              <strong>EST DATE :</strong> {dateStr}
            </td>
          </tr>
          <tr>
            <td style={{ border: cellBorder, padding: '1mm 2mm', background: '#e8e8e8' }}>
              <strong>SALES PERSON :</strong> {salesman || ''}
            </td>
            <td style={{ border: cellBorder, padding: '1mm 2mm' }}>
              <strong>TRANSPORT :</strong> {transportDetails || ''}
            </td>
          </tr>
          <tr>
            <td style={{ border: cellBorder, padding: '1mm 2mm' }}>
              <strong>BILL TO :</strong> {customerName}
              {customerMobile && (
                <div><strong>Whatsapp No :</strong> {customerMobile}</div>
              )}
            </td>
            <td style={{ border: cellBorder, padding: '1mm 2mm' }}>
              <strong>SHIPPING ADD :</strong> {shippingAddress || customerAddress || ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== ITEMS TABLE ===== */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
        <thead>
          <tr style={{ background: headerBg, color: headerColor, fontWeight: 700 }}>
            <th style={{ border: cellBorder, padding: '1.5mm 1mm', width: '8%', textAlign: 'center' }}>SR</th>
            <th style={{ border: cellBorder, padding: '1.5mm 2mm', textAlign: 'center' }}>CODE</th>
            <th style={{ border: cellBorder, padding: '1.5mm 1mm', width: '10%', textAlign: 'center' }}>QTY</th>
            <th style={{ border: cellBorder, padding: '1.5mm 2mm', width: '18%', textAlign: 'right' }}>RATE</th>
            <th style={{ border: cellBorder, padding: '1.5mm 2mm', width: '20%', textAlign: 'right' }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ border: cellBorder, padding: '1mm', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>{item.particulars}</td>
              <td style={{ border: cellBorder, padding: '1mm', textAlign: 'center' }}>{item.qty}</td>
              <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(item.rate, amountWithDecimal)}</td>
              <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(item.total, amountWithDecimal)}</td>
            </tr>
          ))}
          {/* Empty rows to fill the page */}
          {Array.from({ length: emptyRows }).map((_, idx) => (
            <tr key={`empty-${idx}`}>
              <td style={{ border: cellBorder, padding: '1mm', height: '5mm' }}>&nbsp;</td>
              <td style={{ border: cellBorder, padding: '1mm' }}>&nbsp;</td>
              <td style={{ border: cellBorder, padding: '1mm' }}>&nbsp;</td>
              <td style={{ border: cellBorder, padding: '1mm' }}>&nbsp;</td>
              <td style={{ border: cellBorder, padding: '1mm' }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ===== FOOTER: Two-column layout ===== */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', marginTop: '0mm' }}>
        <tbody>
          <tr>
            {/* LEFT: Amount in words, payment, terms */}
            <td style={{ border: cellBorder, padding: '2mm', width: '50%', verticalAlign: 'top' }}>
              <div style={{ marginBottom: '2mm' }}>
                <strong>Amt in Words :</strong> {amtWords}
              </div>

              {/* Payment method row */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2mm' }}>
                <tbody>
                  <tr style={{ background: darkRowBg, color: headerColor, fontWeight: 700, fontSize: '7.5pt' }}>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>CASH :</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>CARD :</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>ONLINE :</td>
                  </tr>
                  <tr style={{ fontSize: '7.5pt' }}>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>
                      {cashAmount ? fmt(cashAmount, amountWithDecimal) : ''}
                    </td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>
                      {cardAmount ? fmt(cardAmount, amountWithDecimal) : ''}
                    </td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'center' }}>
                      {upiAmount ? fmt(upiAmount, amountWithDecimal) : ''}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Terms & Conditions */}
              {termsConditions && termsConditions.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: '1mm' }}>Terms &amp; Condition :-</div>
                  {termsConditions.map((t, i) => (
                    <div key={i} style={{ fontSize: '7pt', lineHeight: 1.3 }}>
                      {i + 1}. {t}
                    </div>
                  ))}
                </div>
              )}
            </td>

            {/* RIGHT: Summary totals */}
            <td style={{ border: cellBorder, padding: '0', width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                <tbody>
                  <tr style={{ background: '#e8e8e8' }}>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>TOTAL QTY</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right', fontWeight: 700 }}>
                      {showTotalQuantity ? totalQty : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>SUB TOTAL</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(subtotal, amountWithDecimal)}</td>
                  </tr>
                  {discount > 0 && (
                    <tr>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>DISCOUNT</td>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(discount, amountWithDecimal)}</td>
                    </tr>
                  )}
                  {totalTax > 0 && (
                    <tr>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>T. CHARGE</td>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(totalTax, amountWithDecimal)}</td>
                    </tr>
                  )}
                  {totalTax === 0 && (
                    <tr>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>T. CHARGE</td>
                      <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>0.00</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>OTHER CHARGE</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>0.00</td>
                  </tr>
                  <tr>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>RD AMOUNT</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(Math.abs(roundOff), amountWithDecimal)}</td>
                  </tr>
                  <tr style={{ background: '#e8e8e8' }}>
                    <td style={{ border: cellBorder, padding: '1.5mm 2mm', fontWeight: 900, fontSize: '9pt' }}>GRAND TOTAL</td>
                    <td style={{ border: cellBorder, padding: '1.5mm 2mm', textAlign: 'right', fontWeight: 900, fontSize: '9pt' }}>{fmt(grandTotal, amountWithDecimal)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', fontWeight: 700 }}>ADV/RECEIPT AMT</td>
                    <td style={{ border: cellBorder, padding: '1mm 2mm', textAlign: 'right' }}>{fmt(advReceiptAmt, amountWithDecimal)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: cellBorder, padding: '1.5mm 2mm', fontWeight: 900, fontSize: '9pt' }}>BALANCE</td>
                    <td style={{ border: cellBorder, padding: '1.5mm 2mm', textAlign: 'right', fontWeight: 900, fontSize: '9pt' }}>{fmt(balance, amountWithDecimal)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Page number */}
      <div style={{ textAlign: 'center', fontSize: '7pt', marginTop: '2mm', color: '#666' }}>
        Page 1/1
      </div>

      {/* Stamp */}
      {stampImageBase64 && (
        <img
          src={stampImageBase64}
          alt="stamp"
          style={{
            position: 'absolute',
            bottom: '15mm',
            [stampPosition === 'bottom-left' ? 'left' : 'right']: '5mm',
            width: `${sSize}px`,
            height: `${sSize}px`,
            objectFit: 'contain',
            opacity: 0.85,
          }}
        />
      )}
    </div>
  );
};
