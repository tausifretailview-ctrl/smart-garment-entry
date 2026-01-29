import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import QRCode from 'qrcode';

interface ThermalItem {
  sr: number;
  particulars: string;
  qty: number;
  rate: number;
  total: number;
}

interface ThermalPrint80mmProps {
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
}

export const ThermalPrint80mm = React.forwardRef<HTMLDivElement, ThermalPrint80mmProps>(
  (props, ref) => {
    const {
      billNo,
      date,
      customerName,
      customerPhone,
      customerAddress,
      items,
      subTotal,
      discount,
      saleReturnAdjust = 0,
      grandTotal,
      gstBreakdown,
      paymentMethod,
      cashPaid = 0,
      upiPaid = 0,
      cardPaid = 0,
      refundCash = 0,
      documentType = 'invoice',
      termsConditions,
      pointsRedeemed = 0,
      pointsRedemptionValue = 0,
      pointsBalance = 0,
    } = props;

    const getDocumentTitle = () => {
      switch (documentType) {
        case 'quotation': return 'QUOTATION';
        case 'sale-order': return 'SALE ORDER';
        case 'pos': return 'TAX INVOICE';
        default: return 'TAX INVOICE';
      }
    };

    const getDocumentNoLabel = () => {
      switch (documentType) {
        case 'quotation': return 'Quotation No';
        case 'sale-order': return 'Order No';
        default: return 'Bill No';
      }
    };

    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    useEffect(() => {
      fetchSettings();
    }, [currentOrganization?.id]);

    useEffect(() => {
      if (settings?.bill_barcode_settings?.upi_id && grandTotal > 0) {
        generateUpiQrCode();
      }
    }, [settings, grandTotal]);

    const fetchSettings = async () => {
      if (!currentOrganization?.id) return;
      
      try {
        const { data, error } = await (supabase as any)
          .from('settings')
          .select('*')
          .eq('organization_id', currentOrganization.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setSettings(data);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    const generateUpiQrCode = async () => {
      try {
        const upiId = settings?.bill_barcode_settings?.upi_id;
        const businessName = settings?.business_name || 'Store';
        
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${grandTotal.toFixed(2)}&cu=INR`;
        
        const qrUrl = await QRCode.toDataURL(upiString, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        setQrCodeUrl(qrUrl);
      } catch (error) {
        console.error('Error generating UPI QR code:', error);
      }
    };

    const formatCurrency = (amount: number) => {
      return `₹ ${Math.round(amount).toLocaleString('en-IN')}`;
    };

    // Calculate GST if not provided
    const calculatedGst = gstBreakdown || {
      cgst: (grandTotal - subTotal + discount) / 2,
      sgst: (grandTotal - subTotal + discount) / 2,
    };

    return (
      <div 
        ref={ref} 
        className="thermal-print-80mm thermal-receipt-container"
        style={{
          width: '72mm',
          maxWidth: '72mm',
          padding: '3mm',
          backgroundColor: 'white',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '12px',
          color: '#000000',
          fontWeight: 900,
          WebkitFontSmoothing: 'none',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          letterSpacing: '0.3px',
        }}
      >
        {/* Header - Business Details */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontWeight: 900, fontSize: '18px', marginBottom: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {settings?.business_name || 'BUSINESS NAME'}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.4', marginBottom: '3px', fontWeight: 700 }}>
            {settings?.address || 'Business Address'}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700 }}>
            {settings?.mobile_number && `PHONE: ${settings.mobile_number}`}
          </div>
          {settings?.gst_number && (
            <div style={{ fontSize: '11px', fontWeight: 700 }}>
              GSTIN: {settings.gst_number}
            </div>
          )}
          {/* Document Type Title */}
          <div style={{ 
            fontWeight: 900, 
            fontSize: '16px', 
            marginTop: '6px',
            padding: '6px 0',
            borderTop: '2px dashed #000000',
            borderBottom: '2px dashed #000000',
            letterSpacing: '1.5px',
            textTransform: 'uppercase'
          }}>
            {getDocumentTitle()}
          </div>
        </div>

        {/* Bill Info Row */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '12px', 
          fontWeight: 900,
          borderBottom: '2px dashed #000000',
          padding: '6px 0',
          marginBottom: '5px'
        }}>
          <span>{getDocumentNoLabel()}: {billNo}</span>
          <span>Date: {format(date, 'dd/MM/yyyy')}</span>
        </div>

        {/* Customer Details */}
        {(customerName || customerPhone || customerAddress) && (
          <div style={{ 
            fontSize: '11px', 
            fontWeight: 700,
            marginBottom: '6px',
            paddingBottom: '5px',
            borderBottom: '2px dashed #000000'
          }}>
            {customerName && (
              <div><span style={{ fontWeight: 900 }}>Customer:</span> {customerName}</div>
            )}
            {customerPhone && (
              <div><span style={{ fontWeight: 900 }}>Phone:</span> {customerPhone}</div>
            )}
            {customerAddress && (
              <div style={{ lineHeight: '1.3' }}><span style={{ fontWeight: 900 }}>Address:</span> {customerAddress}</div>
            )}
          </div>
        )}

        {/* Items Header */}
        <div style={{ 
          display: 'flex', 
          fontSize: '12px', 
          fontWeight: 900,
          borderBottom: '2px solid #000000',
          paddingBottom: '4px',
          marginBottom: '4px',
          textTransform: 'uppercase'
        }}>
          <div style={{ width: '45%', textAlign: 'left' }}>Item</div>
          <div style={{ width: '15%', textAlign: 'center' }}>Qty</div>
          <div style={{ width: '20%', textAlign: 'right' }}>Price</div>
          <div style={{ width: '20%', textAlign: 'right' }}>Amt</div>
        </div>

        {/* Items List */}
        <div style={{ marginBottom: '6px' }}>
          {items.map((item, index) => (
            <div 
              key={index} 
              style={{ 
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 0',
                borderBottom: index < items.length - 1 ? '1px dotted #000000' : 'none'
              }}
            >
              <div style={{ width: '100%', textAlign: 'left', wordWrap: 'break-word', marginBottom: '3px', fontWeight: 900 }}>
                {item.particulars}
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{ width: '45%', textAlign: 'left' }}></div>
                <div style={{ width: '15%', textAlign: 'center', fontWeight: 900 }}>{item.qty}</div>
                <div style={{ width: '20%', textAlign: 'right', fontWeight: 700 }}>{Math.round(item.rate)}</div>
                <div style={{ width: '20%', textAlign: 'right', fontWeight: 900 }}>{Math.round(item.total)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Subtotal */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '12px',
          fontWeight: 900,
          borderTop: '2px solid #000000',
          paddingTop: '5px',
          marginBottom: '4px'
        }}>
          <span>SubTotal</span>
          <span style={{ fontWeight: 900 }}>{items.length}</span>
          <span style={{ fontWeight: 900 }}>{formatCurrency(subTotal)}</span>
        </div>

        {/* Discount if any */}
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 900, marginBottom: '3px' }}>
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}

        {/* Sale Return Adjust if any */}
        {saleReturnAdjust > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 900, marginBottom: '3px', color: '#000000' }}>
            <span>S/R Adjust</span>
            <span>-{formatCurrency(saleReturnAdjust)}</span>
          </div>
        )}

        {/* GST Breakdown */}
        <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>
          {calculatedGst.cgst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>CGST</span>
              <span>{formatCurrency(calculatedGst.cgst)}</span>
            </div>
          )}
          {calculatedGst.sgst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>SGST</span>
              <span>{formatCurrency(calculatedGst.sgst)}</span>
            </div>
          )}
          {calculatedGst.igst && calculatedGst.igst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span>IGST</span>
              <span>{formatCurrency(calculatedGst.igst)}</span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '16px',
          fontWeight: 900,
          borderTop: '2px dashed #000000',
          borderBottom: '2px dashed #000000',
          padding: '8px 0',
          marginBottom: '8px',
          letterSpacing: '1px',
          textTransform: 'uppercase'
        }}>
          <span>TOTAL</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>

        {/* Payment Details if mixed payment */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0) && (
          <div style={{ fontSize: '11px', fontWeight: 900, marginBottom: '6px', paddingBottom: '5px', borderBottom: '1px dotted #000000' }}>
            {cashPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Cash</span>
                <span>{formatCurrency(cashPaid)}</span>
              </div>
            )}
            {upiPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>UPI</span>
                <span>{formatCurrency(upiPaid)}</span>
              </div>
            )}
            {cardPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Card</span>
                <span>{formatCurrency(cardPaid)}</span>
              </div>
            )}
            {refundCash > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Change</span>
                <span>{formatCurrency(refundCash)}</span>
              </div>
            )}
          </div>
        )}

        {/* Points Information */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <div style={{ 
            fontSize: '11px', 
            fontWeight: 700,
            marginBottom: '6px', 
            paddingBottom: '5px', 
            borderBottom: '1px dotted #000000',
            background: '#ffffff',
            padding: '5px',
            border: '1px solid #000000'
          }}>
            <div style={{ fontWeight: 900, marginBottom: '3px' }}>Loyalty Points</div>
            {pointsRedeemed > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span>Points Redeemed</span>
                <span>{pointsRedeemed} pts (₹{pointsRedemptionValue.toFixed(0)})</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
              <span>Points Balance</span>
              <span>{pointsBalance} pts</span>
            </div>
          </div>
        )}

        {/* UPI QR Code if available */}
        {qrCodeUrl && settings?.bill_barcode_settings?.upi_id && (
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '100px', height: '100px' }} />
            <div style={{ fontSize: '11px', fontWeight: 900 }}>Scan to Pay</div>
          </div>
        )}

        {/* Terms & Conditions */}
        {termsConditions && (
          <div style={{ 
            fontSize: '10px', 
            fontWeight: 700,
            marginTop: '6px',
            paddingTop: '5px',
            borderTop: '2px dashed #000000'
          }}>
            <div style={{ fontWeight: 900, marginBottom: '3px' }}>Terms & Conditions:</div>
            <div style={{ lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{termsConditions}</div>
          </div>
        )}

        {/* Thank You */}
        <div style={{ 
          textAlign: 'center', 
          fontSize: '14px',
          fontWeight: 900,
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '2px dashed #000000',
          letterSpacing: '1.5px',
          textTransform: 'uppercase'
        }}>
          Thank You
        </div>

        {/* Footer Text */}
        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, marginTop: '5px' }}>
            {settings.bill_barcode_settings.footer_text}
          </div>
        )}
      </div>
    );
  }
);

ThermalPrint80mm.displayName = 'ThermalPrint80mm';
