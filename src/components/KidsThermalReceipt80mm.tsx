import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useSettings } from '@/hooks/useSettings';

interface KidsThermalItem {
  sr: number;
  particulars: string;
  size?: string;
  mrp?: number;
  qty: number;
  rate: number;
  total: number;
}

interface KidsThermalReceipt80mmProps {
  billNo: string;
  date: Date;
  customerName?: string;
  customerPhone?: string;
  items: KidsThermalItem[];
  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  roundOff?: number;
  grandTotal: number;
  paymentMethod?: string;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  refundCash?: number;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';
  salesman?: string;
  settingsOverride?: Record<string, unknown>;
}

const KIDS_DEFAULT_TERMS = [
  '*GST Charged @ Applicable rates on discounted price',
  'Final Amount is inclusive of applicable taxes',
  '*NO RETURN ONLY EXCHANGE WITHIN 5-DAYS',
  'Exchange Timing 11:30 AM To 2:30 PM',
  'Exchange Only Monday to Saturday',
];

const fmtAmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const fmtDec = (n: number): string => n.toFixed(2);
const fmtMrp = (n: number): string => n.toFixed(3);

export const KidsThermalReceipt80mm = React.forwardRef<HTMLDivElement, KidsThermalReceipt80mmProps>(
  (props, ref) => {
    const {
      billNo,
      date,
      customerName,
      customerPhone,
      items,
      subTotal,
      discount,
      saleReturnAdjust = 0,
      roundOff = 0,
      grandTotal,
      paymentMethod,
      cashPaid = 0,
      upiPaid = 0,
      cardPaid = 0,
      creditPaid = 0,
      paidAmount = 0,
      refundCash = 0,
      documentType = 'invoice',
      salesman,
    } = props;
    const settingsOverride = props.settingsOverride;

    const { data: orgSettings } = useSettings();
    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
      if (settingsOverride) {
        setSettings(settingsOverride);
        return;
      }
      if (orgSettings) setSettings(orgSettings as Record<string, unknown>);
    }, [orgSettings, settingsOverride]);

    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const saleAmount = items.reduce((s, i) => s + i.total, 0);
    const totalMrp = items.reduce((s, i) => s + (Number(i.mrp) || Number(i.rate) || 0) * i.qty, 0);
    const savedAmount = Math.max(0, totalMrp - saleAmount);

    const breakdownPaid = cashPaid + upiPaid + cardPaid + creditPaid;
    const totalPaid = breakdownPaid > 0 ? breakdownPaid : paidAmount;

    const docTitle =
      documentType === 'quotation' || documentType === 'pos'
        ? 'ESTIMATE'
        : documentType === 'sale-order'
          ? 'SALE ORDER'
          : grandTotal < 0
            ? 'CREDIT NOTE'
            : 'TAX INVOICE';

    const partyLabel = (() => {
      const name = (customerName || 'CASH').toUpperCase();
      const phone = customerPhone?.trim();
      return phone ? `${name}<${phone}>` : name;
    })();

    const modeLabel = (() => {
      const mode = (paymentMethod || 'CASH').toUpperCase().replace(/_/g, ' ');
      const amt = totalPaid > 0 ? totalPaid : grandTotal;
      return `${mode}-${fmtDec(amt)}`;
    })();

    const base: React.CSSProperties = {
      width: '72mm',
      maxWidth: '72mm',
      padding: '1mm 1.5mm',
      backgroundColor: 'white',
      fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
      fontSize: '12px',
      lineHeight: '1.25',
      color: '#000',
      fontWeight: 700,
      boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      overflowX: 'hidden',
      overflowY: 'visible',
    };
    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const dotted: React.CSSProperties = { borderTop: '1px dotted #000', margin: '2px 0' };
    const solid: React.CSSProperties = { borderTop: '1px solid #000', margin: '2px 0' };
    const rowBetween: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '2mm',
      width: '100%',
    };
    const cellBorder: React.CSSProperties = {
      border: '1px solid #000',
      padding: '1px 2px',
      verticalAlign: 'top',
    };

    if (!settings) {
      return (
        <div ref={ref} data-invoice-loading="true" style={{ ...base, textAlign: 'center', padding: '16px' }}>
          Loading...
        </div>
      );
    }

    const businessName = (settings.business_name as string) || 'STORE NAME';
    const address = (settings.address as string) || '';
    const gstNumber = (settings.gst_number as string) || '';
    const mobile = (settings.mobile_number as string) || '';
    const website = (settings.website as string) || '-';

    return (
      <div ref={ref} className="thermal-print-80mm thermal-receipt-container kids-thermal-receipt-80mm" style={base}>
        {/* Header */}
        <div style={{ ...center, marginBottom: '2px' }}>
          <div style={{ fontWeight: 900, fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {businessName}
          </div>
          {address && (
            <div style={{ fontSize: '10px', fontWeight: 700, lineHeight: '1.2', marginTop: '1px' }}>{address}</div>
          )}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: '1.3' }}>
          {gstNumber && <div>GST NO: {gstNumber}</div>}
          {mobile && <div>Mobile: {mobile}</div>}
          <div>Website: {website}</div>
        </div>

        <div style={dotted} />

        <div style={{ ...center, fontWeight: 900, fontSize: '13px', letterSpacing: '0.5px', margin: '2px 0' }}>
          {docTitle}
        </div>

        <div style={dotted} />

        <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: '1.35' }}>
          <div style={rowBetween}>
            <span>Inv.No.: {billNo}</span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {format(date, 'dd/MM/yyyy')} ({format(date, 'h:mma').toUpperCase()})
            </span>
          </div>
          <div>Party.: {partyLabel}</div>
          {salesman && <div>Salesmen: {salesman.toUpperCase()}</div>}
        </div>

        <div style={solid} />

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontWeight: 800, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...cellBorder, textAlign: 'left', width: '58%', fontWeight: 900, fontSize: '11px' }}>Particulars</th>
              <th style={{ ...cellBorder, textAlign: 'center', width: '14%', fontWeight: 900, fontSize: '11px' }}>Qty</th>
              <th style={{ ...cellBorder, textAlign: 'right', width: '28%', fontWeight: 900, fontSize: '11px' }}>N.Amt.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const sizePart = item.size?.trim() ? ` ( ${item.size.trim()} )` : '';
              const mrpVal = Number(item.mrp) || Number(item.rate) || 0;
              return (
                <tr key={i}>
                  <td style={{ ...cellBorder, wordBreak: 'break-word', lineHeight: '1.2' }}>
                    {item.particulars}
                    {sizePart}
                    {mrpVal > 0 && (
                      <span style={{ whiteSpace: 'nowrap' }}> | MRP@{fmtMrp(mrpVal)}</span>
                    )}
                  </td>
                  <td style={{ ...cellBorder, textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ ...cellBorder, textAlign: 'right' }}>₹{fmtAmt(item.total)}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...cellBorder, fontWeight: 900 }}>Sub-Total</td>
              <td style={{ ...cellBorder, textAlign: 'center', fontWeight: 900 }}>{totalQty}</td>
              <td style={{ ...cellBorder, textAlign: 'right', fontWeight: 900 }}>₹{fmtAmt(saleAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

        <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: '1.35' }}>
          <div style={rowBetween}>
            <span>
              S-Qty: {fmtDec(totalQty)} S-Amt: ₹{fmtDec(saleAmount)}
            </span>
            <span>T-MRP: ₹{fmtAmt(totalMrp)}</span>
          </div>
          <div style={rowBetween}>
            <span>R-Qty: R-Amt: ₹</span>
            <span style={{ fontSize: '18px', fontWeight: 900, textDecoration: 'underline' }}>
              ₹{fmtAmt(grandTotal)}
            </span>
          </div>
          <div style={rowBetween}>
            <span>Mode: {modeLabel}</span>
            {savedAmount > 0 && (
              <span style={{ fontStyle: 'italic', fontWeight: 900 }}>Saved ₹{fmtAmt(savedAmount)}</span>
            )}
          </div>
        </div>

        {roundOff !== 0 && (
          <div style={{ fontSize: '10px', fontWeight: 800 }}>
            Round Off: {roundOff > 0 ? '+' : '-'}₹{fmtDec(Math.abs(roundOff))}
          </div>
        )}
        {saleReturnAdjust > 0 && (
          <div style={{ fontSize: '10px', fontWeight: 800 }}>S/R Adjusted: -₹{fmtAmt(saleReturnAdjust)}</div>
        )}
        {discount > 0 && savedAmount <= 0 && (
          <div style={{ fontSize: '10px', fontWeight: 800, fontStyle: 'italic' }}>Saved ₹{fmtAmt(discount)}</div>
        )}
        {refundCash > 0 && (
          <div style={{ fontSize: '10px', fontWeight: 800 }}>Refund: ₹{fmtAmt(refundCash)}</div>
        )}

        <div style={solid} />

        {/* Fixed footer — KIDS ZONE style */}
        <div style={{ ...center, fontSize: '11px', fontWeight: 900, lineHeight: '1.35', marginTop: '2px' }}>
          <div>** FIXED RATE **</div>
          <div style={{ margin: '2px 0' }}>
            ** NO GUARANTEE FOR COLORS FANCY DRESS MATERIAL AND KIDS WEAR **
          </div>
        </div>

        <div style={dotted} />

        <div style={{ fontSize: '10px', fontWeight: 800, lineHeight: '1.35' }}>
          <div style={{ ...center, fontWeight: 900, marginBottom: '2px' }}>** TERM &amp; CONDITIONS **</div>
          {KIDS_DEFAULT_TERMS.map((term, idx) => (
            <div key={idx}>{term}</div>
          ))}
        </div>

        <div style={dotted} />

        <div style={{ ...center, fontSize: '11px', fontWeight: 900, margin: '3px 0 1px' }}>
          ** THANK YOU FOR SHOPPING WITH US **
        </div>
      </div>
    );
  }
);

KidsThermalReceipt80mm.displayName = 'KidsThermalReceipt80mm';
