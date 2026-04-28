import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSettings } from '@/hooks/useSettings';
import QRCode from 'qrcode';

interface ThermalItem {
  sr: number;
  particulars: string;
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

interface ThermalReceiptCompactProps {
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
  // Saved-sale signed amounts (negative = refund outflow). When provided and
  // grandTotal < 0, the receipt renders a "Refund Paid" line and shows the
  // bill as settled (Net Settled ₹0) instead of leaving a negative TOTAL.
  cashAmount?: number;
  upiAmount?: number;
  cardAmount?: number;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';
  termsConditions?: string;
  notes?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  cashier?: string;
  salesman?: string;
  isDcInvoice?: boolean;
  counter?: string;
}

const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const fmtDec = (n: number): string => n.toFixed(2);

export const ThermalReceiptCompact = React.forwardRef<HTMLDivElement, ThermalReceiptCompactProps>(
  (props, ref) => {
    const {
      billNo, date, customerName, customerPhone, customerAddress,
      items, subTotal, discount, saleReturnAdjust = 0,
      roundOff = 0, grandTotal,
      gstBreakdown, gstRateBreakdown, paymentMethod,
      cashPaid = 0, upiPaid = 0, cardPaid = 0, creditPaid = 0, paidAmount = 0, refundCash = 0,
      cashAmount = 0, upiAmount = 0, cardAmount = 0,
      documentType = 'invoice', termsConditions, notes,
      pointsRedeemed = 0, pointsRedemptionValue = 0, pointsBalance = 0,
      cashier, salesman, counter, isDcInvoice,
    } = props;

    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const { data: orgSettings } = useSettings();

    useEffect(() => {
      if (orgSettings) setSettings(orgSettings);
    }, [orgSettings]);

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
            { width: 150, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } }
          );
          setQrCodeUrl(url);
        } catch {}
      })();
    }, [settings, grandTotal]);

    const docTitle = documentType === 'quotation' ? 'QUOTATION' : documentType === 'sale-order' ? 'SALE ORDER' : (grandTotal < 0 ? 'CREDIT NOTE' : 'TAX INVOICE');
    const docLabel = documentType === 'quotation' ? 'Qtn' : documentType === 'sale-order' ? 'Ord' : 'Bill';
    const gst = gstBreakdown || { cgst: 0, sgst: 0 };
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const netAmount = subTotal - discount;
    const totalPaid = (cashPaid + upiPaid + cardPaid + creditPaid) > 0 ? (cashPaid + upiPaid + cardPaid + creditPaid) : paidAmount;
    const balanceDue = grandTotal - totalPaid;
    const salesPerson = salesman || cashier;

    // Refund detection: when net is negative AND any of cash/upi/card was paid out
    // (negative amounts on the saved sale), the customer was already refunded.
    const refundOutflow =
      (cashAmount < 0 ? -cashAmount : 0) +
      (upiAmount < 0 ? -upiAmount : 0) +
      (cardAmount < 0 ? -cardAmount : 0);
    const isRefundReceipt = grandTotal < 0 && refundOutflow > 0;
    const refundMode =
      cashAmount < 0 ? 'Cash' :
      upiAmount < 0 ? 'UPI' :
      cardAmount < 0 ? 'Bank' : 'Cash';

    const base: React.CSSProperties = {
      width: '72mm', maxWidth: '72mm', padding: '2mm 2mm 2mm 4mm',
      backgroundColor: 'white', fontFamily: "'Courier New', Courier, monospace",
      fontSize: '14px', lineHeight: '1.5', color: '#000',
      fontWeight: 700, boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      overflow: 'hidden',
    };
    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', width: '100%' };
    const dblLine: React.CSSProperties = { borderTop: '2px solid #000', margin: '3px 0' };
    const singleLine: React.CSSProperties = { borderTop: '1px dashed #000', margin: '3px 0' };

    if (!settings) {
      return (
        <div ref={ref} data-invoice-loading="true" style={{ ...base, textAlign: 'center', padding: '20px' }}>
          Loading...
        </div>
      );
    }

    return (
      <div ref={ref} className="thermal-print-80mm thermal-receipt-container" style={base}>

        {/* HEADER */}
        <div style={dblLine} />
        <div style={{ ...center, marginBottom: '4px' }}>
          {settings?.bill_barcode_settings?.logo_url && (
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <img
                src={settings.bill_barcode_settings.logo_url}
                alt="Logo"
                style={{ maxHeight: '50px', maxWidth: '60mm', margin: '0 auto', display: 'block', objectFit: 'contain' }}
              />
            </div>
          )}
          <div style={{ fontWeight: 900, fontSize: '18px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
            {settings?.business_name || 'STORE NAME'}
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.3' }}>{settings?.address || ''}</div>
          {settings?.mobile_number && <div style={{ fontSize: '13px' }}>Tel: {settings.mobile_number}</div>}
          {settings?.gst_number && <div style={{ fontSize: '13px', fontWeight: 900 }}>GSTIN: {settings.gst_number}</div>}
        </div>
        <div style={dblLine} />

        {/* DOC TITLE */}
        <div style={{ ...center, fontWeight: 900, fontSize: '14px', letterSpacing: '1px', margin: '3px 0' }}>{docTitle}</div>
        <div style={singleLine} />

        {/* BILL INFO */}
        <div style={{ fontSize: '13px', marginBottom: '3px' }}>
          <div style={row}>
            <span>{docLabel}: <b>{billNo}</b></span>
            <span>{format(date, 'dd/MM/yy')}</span>
          </div>
          <div style={row}>
            <span>{format(date, 'hh:mm a')}</span>
            {salesPerson && <span>By: {salesPerson.substring(0, 12)}</span>}
            {!salesPerson && counter && <span>C: {counter}</span>}
          </div>
        </div>

        {/* CUSTOMER */}
        {(customerName && customerName !== 'Walk-in Customer') && (
          <div style={{ fontSize: '13px', marginBottom: '3px' }}>
            <div>Cust: {customerName.length > 28 ? customerName.substring(0, 26) + '..' : customerName}</div>
            {customerPhone && <div>Mob: {customerPhone}</div>}
          </div>
        )}

        <div style={singleLine} />

        {/* ITEMS — compact table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px', width: '44%' }}>ITEM</th>
              <th style={{ textAlign: 'center', padding: '2px 0', fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px', width: '12%' }}>QTY</th>
              <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px', width: '20%' }}>RATE</th>
              <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px', width: '24%' }}>AMT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <tr style={{ borderBottom: '0.5px dotted #000' }}>
                  <td style={{ padding: '2px 0', lineHeight: '1.3', wordBreak: 'break-word', fontWeight: 700 }}>
                    {item.particulars.length > 20 ? item.particulars.substring(0, 18) + '..' : item.particulars}
                    {item.barcode && <div style={{ fontSize: '13px', fontWeight: 900 }}>BC:{item.barcode}</div>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '2px 0', fontWeight: 900 }}>{item.qty}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{fmtAmt(item.rate)}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0', fontWeight: 900 }}>{fmtAmt(item.total)}</td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <div style={singleLine} />

        {/* TOTALS */}
        <div style={{ fontSize: '13px' }}>
          <div style={row}><span style={{ fontWeight: 900 }}>Total Items: {items.length}</span><span style={{ fontWeight: 900 }}>Total Qty: {totalQty}</span></div>
          <div style={row}><span>Subtotal</span><span><b>₹{fmtAmt(subTotal)}</b></span></div>
          {discount > 0 && <div style={row}><span>Discount</span><span><b>-₹{fmtAmt(discount)}</b></span></div>}
          <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />
          <div style={row}><span>Net Amount</span><span><b>₹{fmtAmt(netAmount)}</b></span></div>
          {roundOff !== 0 && (
            <div style={row}><span>Round Off</span><span><b>{roundOff > 0 ? '+' : '-'}₹{fmtDec(Math.abs(roundOff))}</b></span></div>
          )}
          {saleReturnAdjust > 0 && <div style={row}><span>S/R Adjusted</span><span><b>-₹{fmtAmt(saleReturnAdjust)}</b></span></div>}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div style={row}><span>Points ({pointsRedeemed})</span><span><b>-₹{fmtAmt(pointsRedemptionValue)}</b></span></div>
          )}
        </div>

        {/* GRAND TOTAL */}
        <div style={dblLine} />
        <div style={{ ...row, fontSize: '18px', fontWeight: 900, margin: '4px 0' }}>
          <span>TOTAL</span><span>₹{fmtAmt(grandTotal)}</span>
        </div>
        <div style={dblLine} />

        {/* REFUND PAID — settles negative bill to zero */}
        {isRefundReceipt && (
          <>
            <div style={{ ...row, fontSize: '13px', fontWeight: 900, margin: '2px 0' }}>
              <span>Refund Paid ({refundMode})</span>
              <span>₹{fmtAmt(refundOutflow)}</span>
            </div>
            <div style={{ ...row, fontSize: '14px', fontWeight: 900, margin: '2px 0' }}>
              <span>Net Settled</span>
              <span>₹{fmtAmt(grandTotal + refundOutflow)}</span>
            </div>
            <div style={dblLine} />
          </>
        )}

        {/* YOU SAVED */}
        {discount > 0 && (
          <div style={{ ...center, fontSize: '13px', fontWeight: 900, margin: '2px 0' }}>
            *** You Saved ₹{fmtAmt(discount)}! ***
          </div>
        )}

        {/* GST DETAILS */}
        {gstRateBreakdown && gstRateBreakdown.length > 0 ? (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '11px', fontWeight: 900, textAlign: 'center', marginBottom: '2px' }}>GST DETAILS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '1px 0', fontWeight: 900, width: '15%', color: '#000', WebkitPrintColorAdjust: 'exact' as any }}>GST%</th>
                  <th style={{ textAlign: 'right', padding: '1px 0', fontWeight: 900, width: '30%', color: '#000', WebkitPrintColorAdjust: 'exact' as any }}>Taxable</th>
                  <th style={{ textAlign: 'right', padding: '1px 0', fontWeight: 900, width: '27%', color: '#000', WebkitPrintColorAdjust: 'exact' as any }}>CGST</th>
                  <th style={{ textAlign: 'right', padding: '1px 0', fontWeight: 900, width: '28%', color: '#000', WebkitPrintColorAdjust: 'exact' as any }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                {gstRateBreakdown.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '1px 0' }}>{entry.rate}%</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.taxableAmount)}</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.cgst)}</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.sgst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (gst.cgst > 0 || gst.sgst > 0) ? (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '11px' }}>
              {gst.cgst > 0 && <div style={row}><span>CGST</span><span>₹{fmtDec(gst.cgst)}</span></div>}
              {gst.sgst > 0 && <div style={row}><span>SGST</span><span>₹{fmtDec(gst.sgst)}</span></div>}
            </div>
          </>
        ) : null}

        <div style={singleLine} />

        {/* PAYMENT */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || creditPaid > 0 || paidAmount > 0 || paymentMethod) && (
          <div style={{ fontSize: '12px', marginBottom: '3px' }}>
            <div style={{ fontWeight: 900, marginBottom: '1px' }}>PAYMENT</div>
            {cashPaid > 0 && <div style={row}><span>Cash</span><span>₹{fmtAmt(cashPaid)}</span></div>}
            {upiPaid > 0 && <div style={row}><span>UPI</span><span>₹{fmtAmt(upiPaid)}</span></div>}
            {cardPaid > 0 && <div style={row}><span>Card</span><span>₹{fmtAmt(cardPaid)}</span></div>}
            {creditPaid > 0 && <div style={row}><span>Credit</span><span>₹{fmtAmt(creditPaid)}</span></div>}
            {totalPaid > 0 && <div style={{ ...row, fontWeight: 900 }}><span>TOTAL PAID</span><span>₹{fmtAmt(totalPaid)}</span></div>}
            {refundCash > 0 && <div style={row}><span>Refund to Customer</span><span>₹{fmtAmt(refundCash)}</span></div>}
            {balanceDue > 1 && <div style={{ ...row, fontWeight: 900 }}><span>BAL DUE</span><span>₹{fmtAmt(balanceDue)}</span></div>}
          </div>
        )}

        <div style={dblLine} />

        {/* LOYALTY */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <div style={{ fontSize: '11px', margin: '2px 0', padding: '2px', border: '1px solid #000' }}>
            <div style={{ ...center, fontWeight: 900 }}>LOYALTY POINTS</div>
            {pointsRedeemed > 0 && <div style={row}><span>Redeemed</span><span>{pointsRedeemed} pts</span></div>}
            <div style={{ ...row, fontWeight: 900 }}><span>Balance</span><span>{pointsBalance} pts</span></div>
          </div>
        )}

        {/* UPI QR */}
        {qrCodeUrl && (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) && (
          <div style={{ ...center, margin: '4px 0' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '2px' }}>SCAN TO PAY</div>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '75px', height: '75px', margin: '0 auto', display: 'block' }} />
            <div style={{ fontSize: '8px', marginTop: '1px' }}>{(isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id) ? settings.bill_barcode_settings.dc_upi_id : settings.bill_barcode_settings.upi_id}</div>
          </div>
        )}

        {/* TERMS — auto-cut before terms so items section ends cleanly */}
        {termsConditions && (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '14px', fontWeight: 900, textAlign: 'center', marginBottom: '2px' }}>Terms & Conditions</div>
            <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>{termsConditions}</div>
          </>
        )}

        {/* NOTE */}
        {notes && notes.trim() && !/^\d+$/.test(notes.trim()) && (
          <>
            <div style={singleLine} />
            <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
              <span style={{ fontWeight: 900 }}>Note: </span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{notes.trim()}</span>
            </div>
          </>
        )}

        {/* FOOTER */}
        <div style={singleLine} />
        <div style={{ ...center, fontSize: '13px', fontWeight: 900, margin: '3px 0' }}>Thank You! Visit Again!</div>
        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ ...center, fontSize: '8px', whiteSpace: 'pre-wrap' }}>{settings.bill_barcode_settings.footer_text}</div>
        )}
        <div style={dblLine} />
        <div style={{ ...center, fontSize: '8px', marginTop: '2px', color: '#000' }}>{format(date, 'dd-MM-yyyy HH:mm:ss')}</div>
      </div>
    );
  }
);

ThermalReceiptCompact.displayName = 'ThermalReceiptCompact';
