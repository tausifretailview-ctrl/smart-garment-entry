import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useSettings } from '@/hooks/useSettings';

interface ThermalItem {
  sr: number;
  particulars: string;
  itemNotes?: string;
  barcode?: string;
  qty: number;
  rate: number;
  total: number;
}

interface NewDesignThermalReceipt80mmProps {
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
  cashier?: string;
  salesman?: string;
  counter?: string;
  settingsOverride?: any;
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const fmtDec = (n: number): string => n.toFixed(2);

const orderTypeLabel = (
  documentType: NewDesignThermalReceipt80mmProps['documentType'],
  paymentMethod?: string,
): string => {
  if (documentType === 'quotation') return 'Quotation';
  if (documentType === 'sale-order') return 'Sale Order';
  if (paymentMethod) {
    const normalized = paymentMethod.toLowerCase();
    if (normalized.includes('cash')) return 'Cash';
    if (normalized.includes('upi')) return 'UPI';
    if (normalized.includes('card')) return 'Card';
    if (normalized.includes('credit') || normalized.includes('pay_later')) return 'Credit';
    if (normalized.includes('mix')) return 'Mixed';
    return paymentMethod;
  }
  if (documentType === 'pos') return 'Pick Up';
  return 'Sale';
};

export const NewDesignThermalReceipt80mm = React.forwardRef<
  HTMLDivElement,
  NewDesignThermalReceipt80mmProps
>((props, ref) => {
  const {
    billNo,
    date,
    customerName,
    items,
    subTotal,
    discount,
    saleReturnAdjust = 0,
    roundOff = 0,
    grandTotal,
    paymentMethod,
    documentType = 'invoice',
    termsConditions,
    notes,
    cashier,
    salesman,
    settingsOverride,
  } = props;

  const [settings, setSettings] = useState<any>(null);
  const { data: orgSettings } = useSettings();

  useEffect(() => {
    if (settingsOverride) {
      setSettings(settingsOverride);
      return;
    }
    if (orgSettings) setSettings(orgSettings);
  }, [orgSettings, settingsOverride]);

  const base: React.CSSProperties = {
    width: '72mm',
    maxWidth: '72mm',
    padding: '2mm 1.5mm',
    backgroundColor: '#fff',
    fontFamily: FONT,
    fontSize: '12px',
    lineHeight: 1.35,
    color: '#000',
    fontWeight: 400,
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
  const rule: React.CSSProperties = { borderTop: '1px solid #000', margin: '3px 0' };

  const thStyle: React.CSSProperties = {
    padding: '2px 1px',
    fontWeight: 700,
    fontSize: '11px',
    color: '#000',
    borderBottom: '1px solid #000',
    verticalAlign: 'bottom',
  };

  const tdStyle: React.CSSProperties = {
    padding: '2px 1px',
    fontSize: '11px',
    color: '#000',
    verticalAlign: 'top',
    lineHeight: 1.3,
    wordBreak: 'break-word',
  };

  if (!settings) {
    return (
      <div ref={ref} data-invoice-loading="true" style={{ ...base, textAlign: 'center', padding: '20px' }}>
        Loading...
      </div>
    );
  }

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const netSubTotal = subTotal - discount;
  const salesPerson = salesman || cashier || '—';
  const displayCustomer =
    customerName && customerName !== 'Walk-in Customer' ? customerName : '____________________';
  const orderType = orderTypeLabel(documentType, paymentMethod);
  const footerText =
    settings?.bill_barcode_settings?.footer_text?.trim() ||
    settings?.invoice_footer_text?.trim() ||
    'Thank you for visiting us!';
  const regulatoryLine =
    settings?.bill_barcode_settings?.regulatory_text?.trim() ||
    (settings?.gst_number ? `GSTIN: ${settings.gst_number}` : '');

  // Prop from InvoiceWrapper, or Sale settings → Terms list (up to 6 lines)
  const termsFromSettings = Array.isArray(settings?.sale_settings?.terms_list)
    ? (settings.sale_settings.terms_list as string[]).map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const termsText =
    (termsConditions && termsConditions.trim()) ||
    (termsFromSettings.length > 0 ? termsFromSettings.join('\n') : '');
  const notesText = notes?.trim() && !/^\d+$/.test(notes.trim()) ? notes.trim() : '';

  return (
    <div
      ref={ref}
      className="new-design-thermal-receipt-80mm thermal-print-80mm thermal-receipt-container"
      style={base}
    >
      <style>{`
        @media print {
          .new-design-thermal-receipt-80mm,
          .new-design-thermal-receipt-80mm * {
            font-family: Helvetica, Arial, sans-serif !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div style={center}>
        {settings?.bill_barcode_settings?.logo_url && (
          <img
            src={settings.bill_barcode_settings.logo_url}
            alt="Logo"
            style={{
              maxHeight: '42px',
              maxWidth: '58mm',
              margin: '0 auto 4px',
              display: 'block',
              objectFit: 'contain',
            }}
          />
        )}
        <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: 1.25, marginBottom: '2px' }}>
          {settings?.business_name || 'STORE NAME'}
        </div>
        {settings?.invoice_header_text && (
          <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>
            {settings.invoice_header_text}
          </div>
        )}
        {settings?.address && (
          <div style={{ fontSize: '10px', lineHeight: 1.3, marginBottom: '2px' }}>{settings.address}</div>
        )}
        {settings?.gst_number && (
          <div style={{ fontSize: '10px', fontWeight: 600 }}>GSTIN: {settings.gst_number}</div>
        )}
        {settings?.mobile_number && (
          <div style={{ fontSize: '10px', marginTop: '1px' }}>Contact No- {settings.mobile_number}</div>
        )}
      </div>

      <div style={rule} />

      <div style={{ fontSize: '11px', margin: '2px 0' }}>
        Name: <span style={{ fontWeight: 600 }}>{displayCustomer}</span>
      </div>

      <div style={rule} />

      <div style={{ fontSize: '11px', marginBottom: '2px' }}>
        <div style={row}>
          <span>Date: {format(date, 'dd/MM/yy')}</span>
          <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{orderType}</span>
        </div>
        <div>{format(date, 'HH:mm')}</div>
        <div style={{ ...row, marginTop: '2px' }}>
          <span>Cashier: {salesPerson}</span>
          <span>Bill No.: {billNo}</span>
        </div>
      </div>

      <div style={rule} />

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '2px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '44%' }}>Item</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '14%' }}>Qty.</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '20%' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '22%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sr}>
              <td style={tdStyle}>
                <div>{item.particulars}</div>
                {item.itemNotes && <div style={{ fontSize: '10px' }}>{item.itemNotes}</div>}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{item.qty}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(item.rate)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={rule} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '2px',
          fontSize: '11px',
          alignItems: 'center',
          marginBottom: '2px',
        }}
      >
        <span>Total Qty: {totalQty}</span>
        <span style={{ textAlign: 'center' }}>Sub Total</span>
        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDec(netSubTotal)}</span>
      </div>

      {discount > 0 && (
        <div style={{ ...row, fontSize: '11px' }}>
          <span>Discount</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{fmtDec(discount)}</span>
        </div>
      )}
      {roundOff !== 0 && (
        <div style={{ ...row, fontSize: '11px' }}>
          <span>Round Off</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {roundOff > 0 ? '+' : '-'}
            {fmtDec(Math.abs(roundOff))}
          </span>
        </div>
      )}
      {saleReturnAdjust > 0 && (
        <div style={{ ...row, fontSize: '11px' }}>
          <span>S/R Adjusted</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{fmtDec(saleReturnAdjust)}</span>
        </div>
      )}

      <div style={rule} />

      <div style={{ ...row, fontSize: '13px', fontWeight: 700, margin: '2px 0' }}>
        <span>Grand Total</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>₹ {fmtDec(grandTotal)}</span>
      </div>

      <div style={rule} />

      <div style={{ ...center, fontSize: '10px', marginTop: '4px', lineHeight: 1.4 }}>
        {regulatoryLine && <div>{regulatoryLine}</div>}
        <div style={{ marginTop: '3px', fontWeight: 600 }}>{footerText}</div>
      </div>

      {termsText && (
        <>
          <div style={rule} />
          <div style={{ fontSize: '10px', lineHeight: 1.35, marginTop: '2px' }}>
            <div style={{ fontWeight: 700, textAlign: 'center', marginBottom: '2px', fontSize: '11px' }}>
              Terms & Conditions
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>
              {termsText}
            </div>
          </div>
        </>
      )}

      {notesText && (
        <>
          <div style={rule} />
          <div style={{ fontSize: '10px', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700 }}>Note: </span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{notesText}</span>
          </div>
        </>
      )}
    </div>
  );
});

NewDesignThermalReceipt80mm.displayName = 'NewDesignThermalReceipt80mm';
