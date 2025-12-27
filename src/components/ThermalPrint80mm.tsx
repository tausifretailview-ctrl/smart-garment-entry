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
      grandTotal,
      gstBreakdown,
      paymentMethod,
      cashPaid = 0,
      upiPaid = 0,
      cardPaid = 0,
      refundCash = 0,
      documentType = 'invoice',
      termsConditions,
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
      return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Calculate GST if not provided
    const calculatedGst = gstBreakdown || {
      cgst: (grandTotal - subTotal + discount) / 2,
      sgst: (grandTotal - subTotal + discount) / 2,
    };

    return (
      <div 
        ref={ref} 
        className="thermal-print-80mm"
        style={{
          width: '72mm',
          maxWidth: '72mm',
          padding: '3mm',
          backgroundColor: 'white',
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          color: '#000',
          boxSizing: 'border-box',
        }}
      >
        {/* Header - Business Details */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
            {settings?.business_name || 'BUSINESS NAME'}
          </div>
          <div style={{ fontSize: '9px', lineHeight: '1.3', marginBottom: '2px' }}>
            {settings?.address || 'Business Address'}
          </div>
          <div style={{ fontSize: '9px' }}>
            {settings?.mobile_number && `PHONE: ${settings.mobile_number}`}
          </div>
          {settings?.gst_number && (
            <div style={{ fontSize: '9px' }}>
              GSTIN: {settings.gst_number}
            </div>
          )}
          {/* Document Type Title */}
          <div style={{ 
            fontWeight: 'bold', 
            fontSize: '12px', 
            marginTop: '6px',
            padding: '4px 0',
            borderTop: '1px dashed #000',
            borderBottom: '1px dashed #000'
          }}>
            {getDocumentTitle()}
          </div>
        </div>

        {/* Bill Info Row */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '9px', 
          borderBottom: '1px dashed #000',
          padding: '4px 0',
          marginBottom: '4px'
        }}>
          <span>{getDocumentNoLabel()}: {billNo}</span>
          <span>Date: {format(date, 'dd/MM/yyyy')}</span>
        </div>

        {/* Customer Details */}
        {(customerName || customerPhone || customerAddress) && (
          <div style={{ 
            fontSize: '9px', 
            marginBottom: '6px',
            paddingBottom: '4px',
            borderBottom: '1px dashed #000'
          }}>
            {customerName && (
              <div><strong>Customer:</strong> {customerName}</div>
            )}
            {customerPhone && (
              <div><strong>Phone:</strong> {customerPhone}</div>
            )}
            {customerAddress && (
              <div style={{ lineHeight: '1.2' }}><strong>Address:</strong> {customerAddress}</div>
            )}
          </div>
        )}

        {/* Items Header */}
        <div style={{ 
          display: 'flex', 
          fontSize: '9px', 
          fontWeight: 'bold',
          borderBottom: '1px solid #000',
          paddingBottom: '3px',
          marginBottom: '3px'
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
                display: 'flex', 
                fontSize: '9px',
                padding: '2px 0',
                borderBottom: index < items.length - 1 ? '1px dotted #ccc' : 'none'
              }}
            >
              <div style={{ width: '45%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.particulars}
              </div>
              <div style={{ width: '15%', textAlign: 'center' }}>{item.qty}</div>
              <div style={{ width: '20%', textAlign: 'right' }}>{item.rate.toFixed(2)}</div>
              <div style={{ width: '20%', textAlign: 'right' }}>{item.total.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Subtotal */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '9px',
          borderTop: '1px solid #000',
          paddingTop: '4px',
          marginBottom: '3px'
        }}>
          <span>SubTotal</span>
          <span><strong>{items.length}</strong></span>
          <span style={{ fontWeight: 'bold' }}>{formatCurrency(subTotal)}</span>
        </div>

        {/* Discount if any */}
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '2px' }}>
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}

        {/* GST Breakdown */}
        <div style={{ fontSize: '9px', marginBottom: '4px' }}>
          {calculatedGst.cgst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CGST</span>
              <span>{formatCurrency(calculatedGst.cgst)}</span>
            </div>
          )}
          {calculatedGst.sgst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>SGST</span>
              <span>{formatCurrency(calculatedGst.sgst)}</span>
            </div>
          )}
          {calculatedGst.igst && calculatedGst.igst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IGST</span>
              <span>{formatCurrency(calculatedGst.igst)}</span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '12px',
          fontWeight: 'bold',
          borderTop: '1px dashed #000',
          borderBottom: '1px dashed #000',
          padding: '6px 0',
          marginBottom: '8px'
        }}>
          <span>TOTAL</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>

        {/* Payment Details if mixed payment */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0) && (
          <div style={{ fontSize: '9px', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px dotted #ccc' }}>
            {cashPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cash</span>
                <span>{formatCurrency(cashPaid)}</span>
              </div>
            )}
            {upiPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>UPI</span>
                <span>{formatCurrency(upiPaid)}</span>
              </div>
            )}
            {cardPaid > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Card</span>
                <span>{formatCurrency(cardPaid)}</span>
              </div>
            )}
            {refundCash > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Change</span>
                <span>{formatCurrency(refundCash)}</span>
              </div>
            )}
          </div>
        )}

        {/* UPI QR Code if available */}
        {qrCodeUrl && settings?.bill_barcode_settings?.upi_id && (
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '100px', height: '100px' }} />
            <div style={{ fontSize: '8px' }}>Scan to Pay</div>
          </div>
        )}

        {/* Terms & Conditions */}
        {termsConditions && (
          <div style={{ 
            fontSize: '8px', 
            marginTop: '6px',
            paddingTop: '4px',
            borderTop: '1px dashed #000'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Terms & Conditions:</div>
            <div style={{ lineHeight: '1.3', whiteSpace: 'pre-wrap' }}>{termsConditions}</div>
          </div>
        )}

        {/* Thank You */}
        <div style={{ 
          textAlign: 'center', 
          fontSize: '10px',
          fontWeight: 'bold',
          marginTop: '8px',
          paddingTop: '6px',
          borderTop: '1px dashed #000'
        }}>
          Thank You
        </div>

        {/* Footer Text */}
        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ textAlign: 'center', fontSize: '8px', marginTop: '4px' }}>
            {settings.bill_barcode_settings.footer_text}
          </div>
        )}
      </div>
    );
  }
);

ThermalPrint80mm.displayName = 'ThermalPrint80mm';
