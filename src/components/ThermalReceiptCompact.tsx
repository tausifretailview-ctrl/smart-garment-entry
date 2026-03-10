import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
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
  refundCash?: number;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';
  termsConditions?: string;
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  cashier?: string;
  counter?: string;
}

const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const fmtDec = (n: number): string => n.toFixed(2);

const DASH = '- - - - - - - - - - - - - - - - - - - - - - - -';

export const ThermalReceiptCompact = React.forwardRef<HTMLDivElement, ThermalReceiptCompactProps>(
  (props, ref) => {
    const {
      billNo, date, customerName, customerPhone, customerAddress,
      items, subTotal, discount, saleReturnAdjust = 0, grandTotal,
      gstBreakdown, gstRateBreakdown, paymentMethod,
      cashPaid = 0, upiPaid = 0, cardPaid = 0, refundCash = 0,
      documentType = 'invoice', termsConditions,
      pointsRedeemed = 0, pointsRedemptionValue = 0, pointsBalance = 0,
      cashier, counter,
    } = props;

    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    useEffect(() => {
      if (!currentOrganization?.id) return;
      (async () => {
        const { data } = await (supabase as any)
          .from('settings')
          .select('business_name, address, mobile_number, email_id, gst_number, sale_settings, bill_barcode_settings')
          .eq('organization_id', currentOrganization.id)
          .maybeSingle();
        if (data) setSettings(data);
      })();
    }, [currentOrganization?.id]);

    useEffect(() => {
      if (!settings?.bill_barcode_settings?.upi_id || grandTotal <= 0) return;
      (async () => {
        try {
          const upiId = settings.bill_barcode_settings.upi_id;
          const name = settings.business_name || 'Store';
          const url = await QRCode.toDataURL(
            `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${grandTotal.toFixed(2)}&cu=INR`,
            { width: 150, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } }
          );
          setQrCodeUrl(url);
        } catch {}
      })();
    }, [settings, grandTotal]);

    const docTitle = documentType === 'quotation' ? 'QUOTATION' : documentType === 'sale-order' ? 'SALE ORDER' : 'TAX INVOICE';
    const docLabel = documentType === 'quotation' ? 'Quotation No' : documentType === 'sale-order' ? 'Order No' : 'Bill No';

    const gst = gstBreakdown || { cgst: (grandTotal - subTotal + discount) / 2, sgst: (grandTotal - subTotal + discount) / 2 };
    const totalQty = items.reduce((s, i) => s + i.qty, 0);

    // Clean sans-serif font for crisp thermal output — no WebkitTextStroke
    const base: React.CSSProperties = {
      width: '70mm', maxWidth: '70mm', padding: '2mm',
      backgroundColor: 'white', fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '14px', lineHeight: '1.5', color: '#000',
      fontWeight: 700,
      boxSizing: 'border-box', WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact', overflow: 'hidden',
      letterSpacing: '0.3px',
    };

    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', width: '100%' };
    const sep: React.CSSProperties = { textAlign: 'center', fontSize: '11px', margin: '4px 0', color: '#000', overflow: 'hidden', whiteSpace: 'nowrap', letterSpacing: '-0.3px' };

    return (
      <div ref={ref} className="thermal-print-80mm thermal-receipt-container" style={base}>

        {/* HEADER */}
        <div style={{ ...center, marginBottom: '5px' }}>
          <div style={{ fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '3px', letterSpacing: '1px' }}>
            {settings?.business_name || 'STORE NAME'}
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.4', fontWeight: 700 }}>{settings?.address || 'Store Address'}</div>
          {settings?.mobile_number && <div style={{ fontSize: '13px', fontWeight: 700 }}>Ph: {settings.mobile_number}</div>}
          {settings?.gst_number && <div style={{ fontSize: '13px', fontWeight: 900, marginTop: '1px' }}>GSTIN: {settings.gst_number}</div>}
        </div>

        <div style={sep}>{DASH}</div>

        {/* DOC TITLE */}
        <div style={{ ...center, fontWeight: 900, fontSize: '16px', letterSpacing: '1px', margin: '4px 0', textTransform: 'uppercase' }}>{docTitle}</div>

        <div style={sep}>{DASH}</div>

        {/* META */}
        <div style={{ fontSize: '13px', marginBottom: '5px', fontWeight: 700 }}>
          <div style={row}><span>{docLabel}: <b>{billNo}</b></span><span>{format(date, 'dd/MM/yy')}</span></div>
          <div style={row}>
            <span>{format(date, 'hh:mm a')}</span>
            {(cashier || counter) && <span>{cashier ? `${cashier}` : ''}{counter ? ` C:${counter}` : ''}</span>}
          </div>
        </div>

        {/* CUSTOMER */}
        {(customerName || customerPhone) && (
          <>
            <div style={sep}>{DASH}</div>
            <div style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 700 }}>
              {customerName && <div><b>Customer:</b> {customerName.length > 28 ? customerName.substring(0, 26) + '..' : customerName}</div>}
              {customerPhone && <div><b>Mobile:</b> {customerPhone}</div>}
              {customerAddress && <div><b>Addr:</b> {customerAddress.length > 32 ? customerAddress.substring(0, 30) + '..' : customerAddress}</div>}
            </div>
          </>
        )}

        <div style={sep}>{DASH}</div>

        {/* ITEMS TABLE HEADER */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '3px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 900, width: '44%' }}>Description</th>
              <th style={{ textAlign: 'center', padding: '2px 0', fontWeight: 900, width: '12%' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 900, width: '20%' }}>Price</th>
              <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 900, width: '24%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '0.5px dotted #000' }}>
                <td style={{ padding: '3px 0', lineHeight: '1.25', wordBreak: 'break-word', fontWeight: 800 }}>
                  {item.particulars.length > 20 ? item.particulars.substring(0, 18) + '..' : item.particulars}
                  {item.barcode && <div style={{ fontSize: '10px', fontWeight: 700 }}>BC: {item.barcode}</div>}
                </td>
                <td style={{ textAlign: 'center', padding: '3px 0', fontWeight: 900 }}>{item.qty}</td>
                <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 800 }}>{fmtAmt(item.rate)}</td>
                <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 900 }}>{fmtAmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={sep}>{DASH}</div>

        {/* TOTALS */}
        <div style={{ fontSize: '12px', fontWeight: 800 }}>
          <div style={row}><span>Subtotal ({totalQty} items)</span><span><b>₹{fmtAmt(subTotal)}</b></span></div>
          {discount > 0 && <div style={row}><span>Discount</span><span><b>-₹{fmtAmt(discount)}</b></span></div>}
          {saleReturnAdjust > 0 && <div style={row}><span>S/R Adjust</span><span><b>-₹{fmtAmt(saleReturnAdjust)}</b></span></div>}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div style={row}><span>Points ({pointsRedeemed} pts)</span><span><b>-₹{fmtAmt(pointsRedemptionValue)}</b></span></div>
          )}

          {/* ============ GST RATE-WISE BREAKDOWN ============ */}
          {gstRateBreakdown && gstRateBreakdown.length > 0 ? (
            <>
              <div style={{ ...sep, margin: '3px 0' }}>{DASH}</div>
              <div style={{ fontSize: '11px', fontWeight: 900, marginBottom: '3px', textAlign: 'center' }}>
                GST DETAILS
              </div>
              <div style={{ display: 'flex', fontSize: '10px', fontWeight: 900, borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '2px' }}>
                <div style={{ width: '22%', textAlign: 'left' }}>GST%</div>
                <div style={{ width: '26%', textAlign: 'right' }}>Taxable</div>
                <div style={{ width: '26%', textAlign: 'right' }}>CGST</div>
                <div style={{ width: '26%', textAlign: 'right' }}>SGST</div>
              </div>
              {gstRateBreakdown.map((entry, idx) => (
                <div key={idx} style={{ display: 'flex', fontSize: '10px', fontWeight: 800, marginBottom: '2px' }}>
                  <div style={{ width: '22%', textAlign: 'left' }}>{entry.rate}%</div>
                  <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(entry.taxableAmount)}</div>
                  <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(entry.cgst)}</div>
                  <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(entry.sgst)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', fontSize: '10px', fontWeight: 900, borderTop: '1px solid #000', paddingTop: '2px', marginTop: '2px' }}>
                <div style={{ width: '22%', textAlign: 'left' }}>Total</div>
                <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.taxableAmount, 0))}</div>
                <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.cgst, 0))}</div>
                <div style={{ width: '26%', textAlign: 'right' }}>₹{fmtDec(gstRateBreakdown.reduce((s, e) => s + e.sgst, 0))}</div>
              </div>
            </>
          ) : (gst.cgst > 0 || gst.sgst > 0) ? (
            <>
              <div style={{ ...sep, margin: '3px 0' }}>{DASH}</div>
              <div style={{ fontSize: '11px', fontWeight: 800 }}>
                {gst.cgst > 0 && <div style={row}><span>CGST</span><span>₹{fmtAmt(gst.cgst)}</span></div>}
                {gst.sgst > 0 && <div style={row}><span>SGST</span><span>₹{fmtAmt(gst.sgst)}</span></div>}
                {gst.igst && gst.igst > 0 && <div style={row}><span>IGST</span><span>₹{fmtAmt(gst.igst)}</span></div>}
              </div>
            </>
          ) : null}
        </div>

        {/* NET AMOUNT */}
        <div style={{ ...sep, margin: '3px 0' }}>{DASH}</div>
        <div style={{ ...row, fontSize: '16px', fontWeight: 900, margin: '4px 0', WebkitTextStroke: '0.6px #000' }}>
          <span>NET AMOUNT</span><span>₹{fmtAmt(grandTotal)}</span>
        </div>
        <div style={sep}>{DASH}</div>

        {/* PAYMENT */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || paymentMethod) && (
          <div style={{ fontSize: '11px', margin: '4px 0', fontWeight: 800 }}>
            <div style={row}><span><b>Payment:</b></span><span><b>{paymentMethod?.toUpperCase() || 'CASH'}</b></span></div>
            {cashPaid > 0 && <div style={row}><span>Cash</span><span>₹{fmtAmt(cashPaid)}</span></div>}
            {upiPaid > 0 && <div style={row}><span>UPI</span><span>₹{fmtAmt(upiPaid)}</span></div>}
            {cardPaid > 0 && <div style={row}><span>Card</span><span>₹{fmtAmt(cardPaid)}</span></div>}
            {refundCash > 0 && <div style={{ ...row, fontWeight: 900 }}><span>Change</span><span>₹{fmtAmt(refundCash)}</span></div>}
          </div>
        )}

        {/* LOYALTY */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <>
            <div style={sep}>{DASH}</div>
            <div style={{ fontSize: '11px', margin: '3px 0', padding: '3px', border: '1px solid #000', fontWeight: 800 }}>
              <div style={{ ...center, fontWeight: 900, marginBottom: '2px', fontSize: '11px' }}>LOYALTY POINTS</div>
              {pointsRedeemed > 0 && <div style={row}><span>Redeemed</span><span>{pointsRedeemed} pts (₹{fmtAmt(pointsRedemptionValue)})</span></div>}
              <div style={{ ...row, fontWeight: 900 }}><span>Balance</span><span>{pointsBalance} pts</span></div>
            </div>
          </>
        )}

        {/* UPI QR */}
        {qrCodeUrl && settings?.bill_barcode_settings?.upi_id && (
          <div style={{ ...center, margin: '5px 0' }}>
            <div style={sep}>{DASH}</div>
            <div style={{ fontSize: '11px', fontWeight: 900, marginBottom: '3px' }}>SCAN TO PAY</div>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px', margin: '0 auto', display: 'block' }} />
            <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 800 }}>{settings.bill_barcode_settings.upi_id}</div>
          </div>
        )}

        {/* TERMS */}
        {termsConditions && (
          <>
            <div style={sep}>{DASH}</div>
            <div style={{ fontSize: '10px', lineHeight: '1.3', whiteSpace: 'pre-wrap', fontWeight: 800 }}>{termsConditions}</div>
          </>
        )}

        {/* FOOTER */}
        <div style={sep}>{DASH}</div>
        <div style={{ ...center, fontSize: '13px', fontWeight: 900, margin: '5px 0 3px', letterSpacing: '1px', WebkitTextStroke: '0.5px #000' }}>Thank You!</div>
        <div style={{ ...center, fontSize: '11px', marginBottom: '2px', fontWeight: 800 }}>Visit Again</div>

        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ ...center, fontSize: '10px', marginTop: '3px', whiteSpace: 'pre-wrap', fontWeight: 800 }}>{settings.bill_barcode_settings.footer_text}</div>
        )}

        <div style={{ ...center, fontSize: '9px', marginTop: '4px', color: '#000', fontWeight: 700 }}>{format(date, 'dd-MM-yyyy HH:mm:ss')}</div>
      </div>
    );
  }
);

ThermalReceiptCompact.displayName = 'ThermalReceiptCompact';
