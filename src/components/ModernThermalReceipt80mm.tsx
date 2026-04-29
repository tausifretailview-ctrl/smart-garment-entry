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

interface ModernThermalReceipt80mmProps {
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
}

interface ModernThermalReceipt80mmPropsExt extends ModernThermalReceipt80mmProps {
  settingsOverride?: any;
}

const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const fmtDec = (n: number): string => n.toFixed(2);

export const ModernThermalReceipt80mm = React.forwardRef<HTMLDivElement, ModernThermalReceipt80mmProps>(
  (props, ref) => {
    const {
      billNo, date, customerName, customerPhone, customerAddress,
      items, subTotal, discount, saleReturnAdjust = 0,
      roundOff = 0, grandTotal,
      gstBreakdown, gstRateBreakdown, paymentMethod,
      cashPaid = 0, upiPaid = 0, cardPaid = 0, creditPaid = 0, paidAmount = 0, refundCash = 0,
      documentType = 'invoice', termsConditions, notes,
      pointsRedeemed = 0, pointsRedemptionValue = 0, pointsBalance = 0,
      cashier, salesman, counter, isDcInvoice,
    } = props;
    const settingsOverride = (props as ModernThermalReceipt80mmPropsExt).settingsOverride;

    const { currentOrganization } = useOrganization();
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
            { width: 150, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } }
          );
          setQrCodeUrl(url);
        } catch {}
      })();
    }, [settings, grandTotal]);

    const docTitle = documentType === 'quotation' ? 'QUOTATION' : documentType === 'sale-order' ? 'SALE ORDER' : (grandTotal < 0 ? 'CREDIT NOTE' : 'TAX INVOICE');
    const docLabel = documentType === 'quotation' ? 'Qtn No' : documentType === 'sale-order' ? 'Ord No' : 'Bill No';
    const gst = gstBreakdown || { cgst: 0, sgst: 0 };
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const netAmount = subTotal - discount;
    const totalPaid = (cashPaid + upiPaid + cardPaid + creditPaid) > 0 ? (cashPaid + upiPaid + cardPaid + creditPaid) : paidAmount;
    const balanceDue = grandTotal - totalPaid;
    const salesPerson = salesman || cashier;

    // Payment mode label
    const paymentModeLabel = (() => {
      const modes: string[] = [];
      if (cashPaid > 0) modes.push('Cash');
      if (upiPaid > 0) modes.push('UPI');
      if (cardPaid > 0) modes.push('Card');
      if (creditPaid > 0) modes.push('Credit');
      if (modes.length > 0) return modes.join(' + ');
      if (paymentMethod) return paymentMethod;
      return null;
    })();

    if (!settings) {
      return (
        <div ref={ref} data-invoice-loading="true" style={{ padding: '20px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
          Loading...
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="modern-thermal-receipt"
        style={{
          width: '302px',
          maxWidth: '302px',
          backgroundColor: 'white',
          color: '#000',
          padding: '12px',
          fontSize: '12px',
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          lineHeight: '1.4',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          overflow: 'hidden',
        }}
      >
        {/* ═══ PRINT CSS ═══ */}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .modern-thermal-receipt, .modern-thermal-receipt * { visibility: visible !important; }
            .modern-thermal-receipt { position: absolute; left: 0; top: 0; }
            @page { margin: 0; size: 80mm auto; }
            .mtr-print-hidden { display: none !important; }
          }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          {settings?.bill_barcode_settings?.logo_url && (
            <div style={{ marginBottom: '6px' }}>
              <img
                src={settings.bill_barcode_settings.logo_url}
                alt="Logo"
                style={{ maxHeight: '48px', maxWidth: '200px', margin: '0 auto', display: 'block', objectFit: 'contain' }}
              />
            </div>
          )}
          <div style={{
            fontWeight: 900,
            fontSize: '18px',
            textTransform: 'uppercase',
            letterSpacing: '3px',
            marginBottom: '2px',
            fontFamily: "'Inter', sans-serif",
          }}>
            {settings?.business_name || 'STORE NAME'}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.35', color: '#000', maxWidth: '260px', margin: '0 auto' }}>
            {settings?.address || ''}
          </div>
          {settings?.mobile_number && (
            <div style={{ fontSize: '11px', color: '#000' }}>Tel: {settings.mobile_number}</div>
          )}
          {settings?.gst_number && (
            <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '2px' }}>
              GSTIN: {settings.gst_number}
            </div>
          )}
          {/* Title Pill */}
          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
            <span style={{
              border: '1.5px solid #000',
              padding: '2px 12px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '2px',
              display: 'inline-block',
            }}>
              {docTitle}
            </span>
          </div>
        </div>

        {/* ═══ DASHED SEPARATOR ═══ */}
        <div style={{ borderBottom: '2px dashed #000', margin: '6px 0' }} />

        {/* ═══ META DETAILS ═══ */}
        <div style={{ fontSize: '11px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{docLabel}: <strong>{billNo}</strong></span>
            <span>Date: <strong>{format(date, 'dd/MM/yyyy')}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Time: {format(date, 'hh:mm a')}</span>
            {salesPerson && <span>By: {salesPerson.substring(0, 14)}</span>}
            {!salesPerson && counter && <span>Counter: {counter}</span>}
          </div>
          {(customerName && customerName !== 'Walk-in Customer') && (
            <div style={{ marginTop: '3px' }}>
              <div>Customer: <strong>{customerName.length > 28 ? customerName.substring(0, 26) + '..' : customerName}</strong></div>
              {customerPhone && <div>Mob: {customerPhone}</div>}
              {customerAddress && <div style={{ fontSize: '9px' }}>Addr: {customerAddress.length > 35 ? customerAddress.substring(0, 33) + '..' : customerAddress}</div>}
            </div>
          )}
        </div>

        {/* ═══ DASHED SEPARATOR ═══ */}
        <div style={{ borderBottom: '2px dashed #000', margin: '6px 0' }} />

        {/* ═══ ITEMS TABLE HEADER ═══ */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 800,
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          padding: '3px 0',
          borderBottom: '1.5px solid #000',
          marginBottom: '4px',
        }}>
          <span style={{ flex: 1 }}>ITEM</span>
          <span style={{ width: '40px', textAlign: 'right', fontFamily: 'monospace' }}>QTY</span>
          <span style={{ width: '50px', textAlign: 'right', fontFamily: 'monospace' }}>RATE</span>
          <span style={{ width: '60px', textAlign: 'right', fontFamily: 'monospace' }}>AMT</span>
        </div>

        {/* ═══ ITEMS ═══ */}
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: '6px', fontSize: '11px' }}>
            {/* Line 1: Item name full width */}
            <div style={{ fontWeight: 800, lineHeight: '1.3', wordBreak: 'break-word', fontSize: '11.5px' }}>
              {item.particulars}
            </div>
            {item.barcode && (
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#000' }}>BC: {item.barcode}</div>
            )}
            {/* Line 2: Qty × Rate ... Amount */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#000', fontWeight: 700 }}>
                {item.qty} × ₹{fmtAmt(item.rate)}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '11.5px' }}>
                ₹{fmtAmt(item.total)}
              </span>
            </div>
            {i < items.length - 1 && (
              <div style={{ borderBottom: '1px dotted #000', margin: '3px 0 0' }} />
            )}
          </div>
        ))}

        {/* ═══ DASHED SEPARATOR ═══ */}
        <div style={{ borderBottom: '2px dashed #000', margin: '6px 0' }} />

        {/* ═══ TOTALS ═══ */}
        <div style={{ fontSize: '12px', fontWeight: 700 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '14px', fontWeight: 900 }}>
            <span>Total Items: {items.length}</span>
            <span>Total Qty: {totalQty}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800 }}>Subtotal</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>₹{fmtAmt(subTotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000', fontSize: '12px', fontWeight: 900 }}>
              <span>Discount</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 900 }}>-₹{fmtAmt(discount)}</span>
            </div>
          )}
          {saleReturnAdjust > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>S/R Adjusted</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>-₹{fmtAmt(saleReturnAdjust)}</span>
            </div>
          )}
          {roundOff !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Round Off</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{roundOff > 0 ? '+' : '-'}₹{fmtDec(Math.abs(roundOff))}</span>
            </div>
          )}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Points ({pointsRedeemed} pts)</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>-₹{fmtAmt(pointsRedemptionValue)}</span>
            </div>
          )}
        </div>

        {/* ═══ THICK BLACK LINE ═══ */}
        <div style={{ borderBottom: '3px solid #000', margin: '6px 0' }} />

        {/* ═══ GRAND TOTAL ═══ */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 0',
        }}>
          <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '1px' }}>{grandTotal < 0 ? 'CREDIT DUE TO CUSTOMER' : 'GRAND TOTAL'}</span>
          <span style={{ fontSize: '22px', fontWeight: 900, fontFamily: 'monospace' }}>{grandTotal < 0 ? '-₹' : '₹'}{fmtAmt(Math.abs(grandTotal))}</span>
        </div>

        {/* ═══ THICK BLACK LINE ═══ */}
        <div style={{ borderBottom: '3px solid #000', margin: '2px 0 6px' }} />

        {/* ═══ PAYMENT MODE ═══ */}
        {paymentModeLabel && (
          <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 900, marginBottom: '4px' }}>
            Paid via <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{paymentModeLabel}</span>
          </div>
        )}

        {/* ═══ PAYMENT DETAILS ═══ */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || creditPaid > 0 || paidAmount > 0) && (
          <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>
            {cashPaid > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash</span><span style={{ fontFamily: 'monospace', fontWeight: 900 }}>₹{fmtAmt(cashPaid)}</span></div>}
            {upiPaid > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>UPI</span><span style={{ fontFamily: 'monospace', fontWeight: 900 }}>₹{fmtAmt(upiPaid)}</span></div>}
            {cardPaid > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Card</span><span style={{ fontFamily: 'monospace', fontWeight: 900 }}>₹{fmtAmt(cardPaid)}</span></div>}
            {creditPaid > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Credit</span><span style={{ fontFamily: 'monospace', fontWeight: 900 }}>₹{fmtAmt(creditPaid)}</span></div>}
            {refundCash > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Refund to Customer</span><span style={{ fontFamily: 'monospace', fontWeight: 900 }}>₹{fmtAmt(refundCash)}</span></div>}
            {Math.abs(balanceDue) > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>{balanceDue < 0 ? 'CREDIT DUE TO CUSTOMER' : 'BALANCE DUE'}</span>
                <span style={{ fontFamily: 'monospace' }}>{balanceDue < 0 ? '-₹' : '₹'}{fmtAmt(Math.abs(balanceDue))}</span>
              </div>
            )}
          </div>
        )}

        {/* ═══ YOU SAVED ═══ */}
        {discount > 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 800,
            margin: '4px 0',
            padding: '3px 0',
            border: '1px dashed #000',
            borderRadius: '2px',
          }}>
            ★ You Saved ₹{fmtAmt(discount)}! ★
          </div>
        )}

        {/* ═══ GST DETAILS ═══ */}
        {gstRateBreakdown && gstRateBreakdown.length > 0 ? (
          <>
            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
            <div style={{ textAlign: 'center', fontSize: '9px', fontWeight: 800, marginBottom: '2px', letterSpacing: '1px' }}>GST DETAILS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed', fontFamily: 'monospace' }}>
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
                    <td style={{ textAlign: 'left', padding: '1px 0' }}>{entry.rate}%</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.taxableAmount)}</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.cgst)}</td>
                    <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(entry.sgst)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid #000', fontWeight: 800 }}>
                  <td style={{ padding: '1px 0' }}>Total</td>
                  <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.taxableAmount, 0))}</td>
                  <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.cgst, 0))}</td>
                  <td style={{ textAlign: 'right', padding: '1px 0' }}>{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.sgst, 0))}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (gst.cgst > 0 || gst.sgst > 0) ? (
          <>
            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
            <div style={{ textAlign: 'center', fontSize: '9px', fontWeight: 800, marginBottom: '2px', letterSpacing: '1px' }}>GST DETAILS</div>
            <div style={{ fontSize: '9px', fontFamily: 'monospace' }}>
              {gst.cgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST</span><span>₹{fmtDec(gst.cgst)}</span></div>}
              {gst.sgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST</span><span>₹{fmtDec(gst.sgst)}</span></div>}
            </div>
          </>
        ) : null}

        {/* ═══ LOYALTY POINTS ═══ */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <div style={{ fontSize: '10px', margin: '6px 0', padding: '4px', border: '1px solid #000', borderRadius: '3px' }}>
            <div style={{ textAlign: 'center', fontWeight: 800, marginBottom: '2px', letterSpacing: '0.5px' }}>LOYALTY POINTS</div>
            {pointsRedeemed > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Redeemed</span>
                <span>{pointsRedeemed} pts (₹{fmtAmt(pointsRedemptionValue)})</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span>Balance</span>
              <span>{pointsBalance} pts</span>
            </div>
          </div>
        )}

        {/* ═══ UPI QR ═══ */}
        {qrCodeUrl && (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) && (
          <div style={{ textAlign: 'center', margin: '6px 0' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, marginBottom: '3px', letterSpacing: '0.5px' }}>SCAN TO PAY</div>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px', margin: '0 auto', display: 'block' }} />
            <div style={{ fontSize: '9px', marginTop: '2px', color: '#000' }}>
              {(isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id) ? settings.bill_barcode_settings.dc_upi_id : settings.bill_barcode_settings.upi_id}
            </div>
          </div>
        )}

        {/* ═══ TERMS ═══ */}
        {termsConditions && (
          <>
            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
            <div style={{ fontSize: '13px', color: '#000', lineHeight: '1.35', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 700 }}>
              <div style={{ fontWeight: 900, marginBottom: '1px', color: '#000', fontSize: '14px' }}>Terms & Conditions</div>
              {termsConditions}
            </div>
          </>
        )}

        {/* ═══ NOTE ═══ */}
        {notes && notes.trim() && !/^\d+$/.test(notes.trim()) && (
          <>
            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
            <div style={{ fontSize: '10px', lineHeight: '1.3' }}>
              <span style={{ fontWeight: 800 }}>Note: </span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{notes.trim()}</span>
            </div>
          </>
        )}

        {/* ═══ FOOTER ═══ */}
        <div style={{ borderBottom: '2px dashed #000', margin: '6px 0' }} />
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 800,
            fontStyle: 'italic',
            letterSpacing: '0.5px',
          }}>
            Thank You, Visit Again!
          </div>
        </div>

        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '2px', whiteSpace: 'pre-wrap', color: '#000' }}>
            {settings.bill_barcode_settings.footer_text}
          </div>
        )}

        <div style={{ borderBottom: '1px solid #000', margin: '4px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '8px', color: '#000', marginTop: '2px' }}>
          Powered by Ezzy ERP
        </div>
        <div style={{ textAlign: 'center', fontSize: '7px', color: '#000', marginTop: '1px' }}>
          {format(date, 'dd-MM-yyyy HH:mm:ss')}
        </div>
      </div>
    );
  }
);

ModernThermalReceipt80mm.displayName = 'ModernThermalReceipt80mm';
