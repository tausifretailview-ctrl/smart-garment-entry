import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { useSettings } from '@/hooks/useSettings';
import type { PosThermalPaper } from '@/utils/invoicePrintFormat';

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
  /** Roll width — 58mm POS printers need narrower layout (Settings → Direct print POS paper). */
  thermalPaper?: PosThermalPaper;
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

const KIDS_MAX_NAME_LEN_80 = 16;
const KIDS_MAX_NAME_LEN_58 = 11;

function kidsLayoutForPaper(paper: PosThermalPaper) {
  const is58 = paper === '58mm';
  return {
    paperWidth: is58 ? '48mm' : '72mm',
    padding: is58 ? '1mm 0.5mm 1mm 1mm' : '1mm 2mm 1mm 3mm',
    baseFont: is58 ? '10px' : '12px',
    headerFont: is58 ? '13px' : '16px',
    titleFont: is58 ? '11px' : '13px',
    itemFont: is58 ? '9px' : '11px',
    footerFont: is58 ? '9px' : '11px',
    grandFont: is58 ? '14px' : '18px',
    maxNameLen: is58 ? KIDS_MAX_NAME_LEN_58 : KIDS_MAX_NAME_LEN_80,
    colQtyFlex: is58 ? '0 0 11%' : '0 0 14%',
    colAmtFlex: is58 ? '0 0 24%' : '0 0 24%',
    stackTotals: is58,
  };
}

/** One-line: short name - size - MRP (no box, no wrap). */
function formatKidsParticularsLine(item: KidsThermalItem, maxNameLen: number): string {
  let name = item.particulars.trim();
  if (name.length > maxNameLen) {
    name = `${name.slice(0, maxNameLen - 2)}..`;
  }
  const size = item.size?.trim() || '';
  const mrpVal = Number(item.mrp) || Number(item.rate) || 0;
  const parts = [name];
  if (size) parts.push(size);
  if (mrpVal > 0) parts.push(fmtMrp(mrpVal));
  return parts.join(' - ');
}

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
      thermalPaper = '80mm',
    } = props;
    const settingsOverride = props.settingsOverride;
    const layout = useMemo(() => kidsLayoutForPaper(thermalPaper), [thermalPaper]);

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
      width: layout.paperWidth,
      maxWidth: layout.paperWidth,
      margin: '0 auto',
      padding: layout.padding,
      backgroundColor: 'white',
      fontFamily: "'Arial Black', 'Arial', sans-serif",
      fontSize: layout.baseFont,
      lineHeight: '1.2',
      color: '#000',
      fontWeight: 900,
      boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      overflowX: thermalPaper === '58mm' ? 'visible' : 'hidden',
      overflowY: 'visible',
      textAlign: 'left',
    };
    const left: React.CSSProperties = { textAlign: 'left', width: '100%' };
    const center: React.CSSProperties = { textAlign: 'center', width: '100%' };
    const dotted: React.CSSProperties = { borderTop: '1px dotted #000', margin: '2px 0' };
    const solid: React.CSSProperties = { borderTop: '1px solid #000', margin: '2px 0' };
    const rowBetween: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '2mm',
      width: '100%',
      flexWrap: 'wrap',
      fontWeight: 900,
      textAlign: 'left',
    };
    const itemRow: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      gap: layout.stackTotals ? '1mm' : '2mm',
      width: '100%',
      fontSize: layout.itemFont,
      fontWeight: 900,
      lineHeight: '1.15',
      padding: '1px 0',
      whiteSpace: 'nowrap',
      textAlign: 'left',
    };
    const colParticulars: React.CSSProperties = {
      flex: '1 1 auto',
      minWidth: 0,
      textAlign: 'left',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontWeight: 900,
    };
    const colQty: React.CSSProperties = {
      flex: layout.colQtyFlex,
      textAlign: 'right',
      fontWeight: 900,
    };
    const colAmt: React.CSSProperties = {
      flex: layout.colAmtFlex,
      flexShrink: 0,
      textAlign: 'right',
      fontWeight: 900,
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
      <div
        ref={ref}
        className="thermal-print-80mm thermal-receipt-container kids-thermal-receipt-80mm"
        data-thermal-paper={thermalPaper}
        style={base}
      >
        {/* Header — shop name & address centered */}
        <div style={{ ...center, marginBottom: '2px' }}>
          <div style={{ fontWeight: 900, fontSize: layout.headerFont, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {businessName}
          </div>
          {address && (
            <div style={{ fontSize: layout.footerFont, fontWeight: 700, lineHeight: '1.2', marginTop: '1px' }}>{address}</div>
          )}
        </div>
        <div style={{ ...left, fontSize: '11px', fontWeight: 900, lineHeight: '1.3' }}>
          {gstNumber && <div>GST NO: {gstNumber}</div>}
          {mobile && <div>Mobile: {mobile}</div>}
          <div>Website: {website}</div>
        </div>

        <div style={dotted} />

        <div style={{ ...center, fontWeight: 900, fontSize: layout.titleFont, letterSpacing: '0.5px', margin: '2px 0' }}>
          {docTitle}
        </div>

        <div style={dotted} />

        <div style={{ ...left, fontSize: layout.itemFont, fontWeight: 900, lineHeight: '1.35' }}>
          {layout.stackTotals ? (
            <>
              <div>Inv.No.: {billNo}</div>
              <div>
                {format(date, 'dd/MM/yyyy')} ({format(date, 'h:mma').toUpperCase()})
              </div>
            </>
          ) : (
            <div style={rowBetween}>
              <span>Inv.No.: {billNo}</span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {format(date, 'dd/MM/yyyy')} ({format(date, 'h:mma').toUpperCase()})
              </span>
            </div>
          )}
          <div>Party.: {partyLabel}</div>
          {salesman && <div>Salesmen: {salesman.toUpperCase()}</div>}
        </div>

        <div style={solid} />

        {/* Items — no box borders, left-aligned columns */}
        <div style={{ width: '100%', fontWeight: 900 }}>
          <div style={{ ...itemRow, fontSize: layout.itemFont, borderBottom: '1px solid #000', paddingBottom: '2px' }}>
            <span style={colParticulars}>Particulars</span>
            <span style={colQty}>Qty</span>
            <span style={colAmt}>N.Amt.</span>
          </div>
          {items.map((item, i) => (
            <div key={i} style={itemRow}>
              <span style={colParticulars}>{formatKidsParticularsLine(item, layout.maxNameLen)}</span>
              <span style={colQty}>{item.qty}</span>
              <span style={colAmt}>₹{fmtAmt(item.total)}</span>
            </div>
          ))}
          <div style={{ ...itemRow, borderTop: '1px dotted #000', marginTop: '2px', paddingTop: '2px' }}>
            <span style={colParticulars}>Sub-Total</span>
            <span style={colQty}>{totalQty}</span>
            <span style={colAmt}>₹{fmtAmt(saleAmount)}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

        <div style={{ ...left, fontSize: layout.itemFont, fontWeight: 900, lineHeight: '1.35' }}>
          <div style={layout.stackTotals ? { ...left, lineHeight: '1.4' } : rowBetween}>
            <span>
              S-Qty: {fmtDec(totalQty)} S-Amt: ₹{fmtDec(saleAmount)}
            </span>
            {!layout.stackTotals && <span>T-MRP: ₹{fmtAmt(totalMrp)}</span>}
          </div>
          {layout.stackTotals && <div>T-MRP: ₹{fmtAmt(totalMrp)}</div>}
          {layout.stackTotals ? (
            <>
              <div
                style={{
                  fontSize: layout.grandFont,
                  fontWeight: 900,
                  textDecoration: 'underline',
                  margin: '2px 0',
                }}
              >
                Net Amt: ₹{fmtAmt(grandTotal)}
              </div>
              <div>Mode: {modeLabel}</div>
              {savedAmount > 0 && (
                <div style={{ fontStyle: 'italic', fontWeight: 900 }}>Saved ₹{fmtAmt(savedAmount)}</div>
              )}
            </>
          ) : (
            <>
              <div style={rowBetween}>
                <span>R-Qty: R-Amt: ₹</span>
                <span style={{ fontSize: layout.grandFont, fontWeight: 900, textDecoration: 'underline', textAlign: 'right' }}>
                  ₹{fmtAmt(grandTotal)}
                </span>
              </div>
              <div style={rowBetween}>
                <span>Mode: {modeLabel}</span>
                {savedAmount > 0 && (
                  <span style={{ fontStyle: 'italic', fontWeight: 900, textAlign: 'right' }}>Saved ₹{fmtAmt(savedAmount)}</span>
                )}
              </div>
            </>
          )}
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
        <div
          style={{
            ...left,
            fontSize: layout.footerFont,
            fontWeight: 900,
            lineHeight: '1.35',
            marginTop: '2px',
          }}
        >
          <div style={{ ...center, fontSize: layout.stackTotals ? layout.titleFont : '14px', letterSpacing: '0.3px' }}>** FIXED RATE **</div>
          <div style={{ margin: '2px 0', fontSize: layout.stackTotals ? layout.footerFont : '13px', ...(layout.stackTotals ? { whiteSpace: 'normal', wordBreak: 'break-word' } : {}) }}>
            ** NO GUARANTEE FOR COLORS FANCY DRESS MATERIAL AND KIDS WEAR **
          </div>
        </div>

        <div style={dotted} />

        <div style={{ ...left, fontSize: layout.footerFont, fontWeight: 900, lineHeight: '1.35', ...(layout.stackTotals ? { whiteSpace: 'normal', wordBreak: 'break-word' } : {}) }}>
          <div style={{ fontWeight: 900, fontSize: layout.titleFont, marginBottom: '2px' }}>** TERM &amp; CONDITIONS **</div>
          {KIDS_DEFAULT_TERMS.map((term, idx) => (
            <div key={idx}>{term}</div>
          ))}
        </div>

        <div style={dotted} />

        <div style={{ ...left, fontSize: layout.footerFont, fontWeight: 900, margin: '3px 0 1px' }}>
          ** THANK YOU FOR SHOPPING WITH US **
        </div>
      </div>
    );
  }
);

KidsThermalReceipt80mm.displayName = 'KidsThermalReceipt80mm';
