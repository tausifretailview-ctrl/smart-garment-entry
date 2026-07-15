import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useSettings } from '@/hooks/useSettings';
import QRCode from 'qrcode';

interface ThermalItem {
  sr: number;
  particulars: string;
  itemNotes?: string;
  barcode?: string;
  qty: number;
  rate: number;
  total: number;
}

interface GSTRateEntry {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst?: number;
  totalTax: number;
}

interface TvsThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: ThermalItem[];
  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;
  gstBreakdown?: {
    cgst: number;
    sgst: number;
    igst?: number;
  };
  gstRateBreakdown?: GSTRateEntry[];
  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  refundCash?: number;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';
  termsConditions?: string;
  notes?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  cashier?: string;
  salesman?: string;
  counter?: string;
  isDcInvoice?: boolean;
  settingsOverride?: any;
}

const FONT = "'Arial Black', Arial, 'Helvetica Neue', Helvetica, sans-serif";
const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const fmtDec = (n: number): string => n.toFixed(2);

const thStyle: React.CSSProperties = {
  padding: '3px 1px',
  fontWeight: 900,
  fontSize: '12px',
  color: '#000',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: '2px solid #000',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const tdStyle: React.CSSProperties = {
  padding: '2px 1px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#000',
  verticalAlign: 'top',
  lineHeight: 1.25,
  wordBreak: 'break-word',
};

export const TvsThermalReceipt80mm = React.forwardRef<HTMLDivElement, TvsThermalReceipt80mmProps>(
  (props, ref) => {
    const {
      billNo, date, customerName, customerPhone, customerAddress,
      items, subTotal, discount, saleReturnAdjust = 0,
      roundOff = 0, grandTotal,
      gstBreakdown, gstRateBreakdown, paymentMethod,
      cashPaid = 0, upiPaid = 0, cardPaid = 0, creditPaid = 0, paidAmount = 0, refundCash = 0,
      documentType = 'invoice', termsConditions, notes,
      pointsRedeemed = 0, pointsRedemptionValue = 0, pointsBalance = 0,
      cashier, salesman, counter, isDcInvoice, settingsOverride,
    } = props;

    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const { data: orgSettings } = useSettings();

    useEffect(() => {
      if (settingsOverride) { setSettings(settingsOverride); return; }
      if (orgSettings) setSettings(orgSettings);
    }, [orgSettings, settingsOverride]);

    useEffect(() => {
      const upiId = (isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id)
        ? settings.bill_barcode_settings.dc_upi_id
        : settings?.bill_barcode_settings?.upi_id;
      if (!upiId || grandTotal <= 0) return;
      (async () => {
        try {
          const name = settings.business_name || 'Store';
          const url = await QRCode.toDataURL(
            `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${grandTotal.toFixed(2)}&cu=INR`,
            { width: 150, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } },
          );
          setQrCodeUrl(url);
        } catch { /* non-blocking */ }
      })();
    }, [settings, grandTotal, isDcInvoice]);

    const docTitle = documentType === 'quotation' ? 'QUOTATION' : documentType === 'sale-order' ? 'SALE ORDER' : (grandTotal < 0 ? 'CREDIT NOTE' : 'TAX INVOICE');
    const docLabel = documentType === 'quotation' ? 'Qtn No' : documentType === 'sale-order' ? 'Ord No' : 'Bill No';
    const gst = gstBreakdown || { cgst: 0, sgst: 0 };
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const netAmount = subTotal - discount;
    const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
    const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;
    const balanceDue = grandTotal - totalPaid;
    const salesPerson = salesman || cashier;

    const base: React.CSSProperties = {
      width: '72mm',
      maxWidth: '72mm',
      padding: '2mm',
      backgroundColor: '#fff',
      fontFamily: FONT,
      fontSize: '13px',
      lineHeight: 1.35,
      color: '#000',
      fontWeight: 700,
      boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      overflowX: 'hidden',
    };
    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const row: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '2mm',
      width: '100%',
    };
    const dblLine: React.CSSProperties = { borderTop: '2px solid #000', margin: '4px 0' };
    const singleLine: React.CSSProperties = { borderTop: '1px solid #000', margin: '3px 0' };

    if (!settings) {
      return (
        <div ref={ref} data-invoice-loading="true" style={{ ...base, textAlign: 'center', padding: '20px' }}>
          Loading...
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="tvs-thermal-receipt-80mm thermal-print-80mm thermal-receipt-container"
        style={base}
      >
        <style>{`
          @media print {
            .tvs-thermal-receipt-80mm,
            .tvs-thermal-receipt-80mm * {
              font-family: Arial, Helvetica, sans-serif !important;
              color: #000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .tvs-thermal-receipt-80mm th {
              font-weight: 900 !important;
            }
          }
        `}</style>

        <div style={dblLine} />
        <div style={{ ...center, marginBottom: '4px' }}>
          {settings?.bill_barcode_settings?.logo_url && (
            <img
              src={settings.bill_barcode_settings.logo_url}
              alt="Logo"
              style={{ maxHeight: '48px', maxWidth: '60mm', margin: '0 auto 4px', display: 'block', objectFit: 'contain' }}
            />
          )}
          <div style={{ fontWeight: 900, fontSize: '17px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
            {settings?.business_name || 'STORE NAME'}
          </div>
          {settings?.address && (
            <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.3 }}>{settings.address}</div>
          )}
          {settings?.mobile_number && (
            <div style={{ fontSize: '12px', fontWeight: 700 }}>Ph: {settings.mobile_number}</div>
          )}
          {settings?.gst_number && (
            <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '2px' }}>GSTIN: {settings.gst_number}</div>
          )}
        </div>
        <div style={dblLine} />

        <div style={{ ...center, fontWeight: 900, fontSize: '14px', margin: '4px 0' }}>{docTitle}</div>
        <div style={singleLine} />

        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
          <div style={row}>
            <span>{docLabel}: <b>{billNo}</b></span>
            <span>Date: {format(date, 'dd/MM/yy')}</span>
          </div>
          <div style={row}>
            <span>Time: {format(date, 'hh:mm a')}</span>
            {salesPerson && <span>By: {salesPerson.substring(0, 14)}</span>}
            {!salesPerson && counter && <span>C: {counter}</span>}
          </div>
        </div>

        {(customerName && customerName !== 'Walk-in Customer') && (
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
            <div style={{ fontWeight: 900 }}>To, {customerName.length > 28 ? `${customerName.substring(0, 26)}..` : customerName}</div>
            {customerPhone && <div>Mob: {customerPhone}</div>}
            {customerAddress && <div>{customerAddress.length > 32 ? `${customerAddress.substring(0, 30)}..` : customerAddress}</div>}
          </div>
        )}

        <div style={singleLine} />

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '2px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: '8%' }}>Sr</th>
              <th style={{ ...thStyle, textAlign: 'left', width: '36%' }}>Description</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '14%' }}>Qty</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '20%' }}>Rate</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '22%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr} style={{ borderBottom: '1px dotted #000' }}>
                <td style={{ ...tdStyle, textAlign: 'left' }}>{item.sr}</td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 900 }}>{item.particulars}</div>
                  {item.itemNotes && (
                    <div style={{ fontSize: '10px', fontWeight: 700 }}>{item.itemNotes}</div>
                  )}
                  {item.barcode && (
                    <div style={{ fontSize: '10px', fontWeight: 900 }}>BC: {item.barcode}</div>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{item.qty}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec(item.rate)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{fmtDec(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ ...row, fontSize: '12px', fontWeight: 900, marginBottom: '2px' }}>
          <span>Total Qty: {totalQty.toFixed(2)}</span>
          <span>Items: {items.length}</span>
        </div>

        <div style={singleLine} />

        <div style={{ fontSize: '12px', fontWeight: 700 }}>
          <div style={row}><span>Subtotal</span><span style={{ fontWeight: 900 }}>₹{fmtAmt(subTotal)}</span></div>
          {discount > 0 && (
            <div style={row}><span>Discount</span><span style={{ fontWeight: 900 }}>-₹{fmtAmt(discount)}</span></div>
          )}
          <div style={row}><span>Net Amount</span><span style={{ fontWeight: 900 }}>₹{fmtAmt(netAmount)}</span></div>
          {roundOff !== 0 && (
            <div style={row}>
              <span>Round Off</span>
              <span style={{ fontWeight: 900 }}>{roundOff > 0 ? '+' : '-'}₹{fmtDec(Math.abs(roundOff))}</span>
            </div>
          )}
          {saleReturnAdjust > 0 && (
            <div style={row}><span>S/R Adjusted</span><span style={{ fontWeight: 900 }}>-₹{fmtAmt(saleReturnAdjust)}</span></div>
          )}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div style={row}>
              <span>Points ({pointsRedeemed})</span>
              <span style={{ fontWeight: 900 }}>-₹{fmtAmt(pointsRedemptionValue)}</span>
            </div>
          )}
        </div>

        <div style={dblLine} />
        <div style={{ ...row, fontSize: '15px', fontWeight: 900, margin: '4px 0' }}>
          <span>{grandTotal < 0 ? 'CREDIT DUE' : 'TOTAL'}</span>
          <span>{grandTotal < 0 ? '-₹' : '₹'}{fmtAmt(Math.abs(grandTotal))}</span>
        </div>
        <div style={dblLine} />

        {discount > 0 && (
          <div style={{ ...center, fontSize: '12px', fontWeight: 900, margin: '3px 0' }}>
            You Saved ₹{fmtAmt(discount)}!
          </div>
        )}

        {gstRateBreakdown && gstRateBreakdown.length > 0 ? (
          <>
            <div style={singleLine} />
            <div style={{ ...center, fontSize: '12px', fontWeight: 900, marginBottom: '3px' }}>GST SUMMARY</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, fontSize: '10px', width: '16%' }}>GST%</th>
                  <th style={{ ...thStyle, fontSize: '10px', textAlign: 'right', width: '28%' }}>Taxable</th>
                  <th style={{ ...thStyle, fontSize: '10px', textAlign: 'right', width: '28%' }}>CGST</th>
                  <th style={{ ...thStyle, fontSize: '10px', textAlign: 'right', width: '28%' }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                {gstRateBreakdown.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ ...tdStyle, fontSize: '10px' }}>{entry.rate}%</td>
                    <td style={{ ...tdStyle, fontSize: '10px', textAlign: 'right' }}>{fmtDec(entry.taxableAmount)}</td>
                    <td style={{ ...tdStyle, fontSize: '10px', textAlign: 'right' }}>{fmtDec(entry.cgst)}</td>
                    <td style={{ ...tdStyle, fontSize: '10px', textAlign: 'right' }}>{fmtDec(entry.sgst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (gst.cgst > 0 || gst.sgst > 0) ? (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '12px', fontWeight: 700 }}>
              {gst.cgst > 0 && <div style={row}><span>CGST</span><span>₹{fmtDec(gst.cgst)}</span></div>}
              {gst.sgst > 0 && <div style={row}><span>SGST</span><span>₹{fmtDec(gst.sgst)}</span></div>}
            </div>
          </>
        ) : null}

        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || creditPaid > 0 || paidAmount > 0 || paymentMethod) && (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '12px', fontWeight: 700 }}>
              <div style={{ fontWeight: 900, marginBottom: '2px' }}>PAYMENT</div>
              {cashPaid > 0 && <div style={row}><span>Cash</span><span>₹{fmtAmt(cashPaid)}</span></div>}
              {upiPaid > 0 && <div style={row}><span>UPI</span><span>₹{fmtAmt(upiPaid)}</span></div>}
              {cardPaid > 0 && <div style={row}><span>Card</span><span>₹{fmtAmt(cardPaid)}</span></div>}
              {creditPaid > 0 && <div style={row}><span>Credit</span><span>₹{fmtAmt(creditPaid)}</span></div>}
              {totalPaid > 0 && (
                <div style={{ ...row, fontWeight: 900 }}><span>TOTAL PAID</span><span>₹{fmtAmt(totalPaid)}</span></div>
              )}
              {refundCash > 0 && <div style={row}><span>Refund</span><span>₹{fmtAmt(refundCash)}</span></div>}
              {Math.abs(balanceDue) > 1 && (
                <div style={{ ...row, fontWeight: 900 }}>
                  <span>{balanceDue < 0 ? 'CREDIT DUE' : 'BALANCE DUE'}</span>
                  <span>{balanceDue < 0 ? '-₹' : '₹'}{fmtAmt(Math.abs(balanceDue))}</span>
                </div>
              )}
            </div>
          </>
        )}

        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <div style={{ fontSize: '11px', margin: '4px 0', padding: '3px', border: '1px solid #000' }}>
            <div style={{ ...center, fontWeight: 900 }}>LOYALTY POINTS</div>
            {pointsRedeemed > 0 && <div style={row}><span>Redeemed</span><span>{pointsRedeemed} pts</span></div>}
            <div style={{ ...row, fontWeight: 900 }}><span>Balance</span><span>{pointsBalance} pts</span></div>
          </div>
        )}

        {qrCodeUrl && (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) && (
          <div style={{ ...center, margin: '4px 0' }}>
            <div style={{ fontSize: '12px', fontWeight: 900 }}>SCAN TO PAY</div>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px', margin: '4px auto', display: 'block' }} />
          </div>
        )}

        {termsConditions && (
          <>
            <div style={singleLine} />
            <div style={{ ...center, fontSize: '12px', fontWeight: 900, marginBottom: '2px' }}>Terms & Conditions</div>
            <div style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{termsConditions}</div>
          </>
        )}

        {notes && notes.trim() && !/^\d+$/.test(notes.trim()) && (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '11px' }}><b>Note:</b> {notes.trim()}</div>
          </>
        )}

        <div style={singleLine} />
        <div style={{ ...center, fontSize: '13px', fontWeight: 900, margin: '4px 0' }}>Thank You! Visit Again!</div>
        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ ...center, fontSize: '10px', marginTop: '2px', whiteSpace: 'pre-wrap' }}>
            {settings.bill_barcode_settings.footer_text}
          </div>
        )}
        <div style={dblLine} />
        <div style={{ ...center, fontSize: '9px', fontWeight: 700 }}>{format(date, 'dd-MM-yyyy HH:mm:ss')}</div>
      </div>
    );
  },
);

TvsThermalReceipt80mm.displayName = 'TvsThermalReceipt80mm';
