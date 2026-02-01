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
  cashier?: string;
  counter?: string;
}

// Truncate item name to fit thermal width
const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 2) + '..';
};

// Format currency for thermal (no decimals, Indian format)
const formatAmount = (amount: number): string => {
  return Math.round(amount).toLocaleString('en-IN');
};

// Text separator line
const SEPARATOR_LINE = '------------------------------------------------';
const DASHED_LINE = '- - - - - - - - - - - - - - - - - - - - - - - - ';
const DOUBLE_LINE = '================================================';

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
      cashier,
      counter,
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
          width: 150,
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

    // Calculate GST if not provided
    const calculatedGst = gstBreakdown || {
      cgst: (grandTotal - subTotal + discount) / 2,
      sgst: (grandTotal - subTotal + discount) / 2,
    };

    // Calculate total quantity
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    // Base thermal print styles - optimized for 80mm (72mm printable area)
    const baseStyle: React.CSSProperties = {
      width: '70mm',
      maxWidth: '70mm',
      padding: '2mm',
      backgroundColor: 'white',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '11px',
      lineHeight: '1.4',
      color: '#000000',
      fontWeight: 700,
      WebkitFontSmoothing: 'none',
      boxSizing: 'border-box',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      letterSpacing: '0.1px',
      overflow: 'hidden',
    };

    const centerStyle: React.CSSProperties = {
      textAlign: 'center',
      width: '100%',
    };

    const leftRightRow: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
    };

    const boldText: React.CSSProperties = {
      fontWeight: 900,
    };

    const separatorStyle: React.CSSProperties = {
      textAlign: 'center',
      fontSize: '10px',
      letterSpacing: '-0.5px',
      margin: '2px 0',
      color: '#000000',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    };

    return (
      <div ref={ref} className="thermal-print-80mm thermal-receipt-container" style={baseStyle}>
        
        {/* ============ HEADER SECTION ============ */}
        <div style={{ ...centerStyle, marginBottom: '4px' }}>
          {/* Business Name */}
          <div style={{ 
            fontWeight: 900, 
            fontSize: '16px', 
            letterSpacing: '0.5px', 
            textTransform: 'uppercase',
            marginBottom: '2px'
          }}>
            {settings?.business_name || 'STORE NAME'}
          </div>
          
          {/* Address */}
          <div style={{ fontSize: '10px', lineHeight: '1.3', marginBottom: '2px' }}>
            {settings?.address || 'Store Address'}
          </div>
          
          {/* Contact */}
          {settings?.mobile_number && (
            <div style={{ fontSize: '10px' }}>
              Tel: {settings.mobile_number}
            </div>
          )}
          
          {/* GSTIN */}
          {settings?.gst_number && (
            <div style={{ fontSize: '10px', fontWeight: 900, marginTop: '2px' }}>
              GSTIN: {settings.gst_number}
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={separatorStyle}>{DOUBLE_LINE}</div>

        {/* Document Title */}
        <div style={{ 
          ...centerStyle, 
          fontWeight: 900, 
          fontSize: '14px',
          letterSpacing: '1px',
          margin: '4px 0',
          textTransform: 'uppercase'
        }}>
          {getDocumentTitle()}
        </div>

        <div style={separatorStyle}>{SEPARATOR_LINE}</div>

        {/* ============ INVOICE META ============ */}
        <div style={{ fontSize: '11px', marginBottom: '4px' }}>
          <div style={leftRightRow}>
            <span>{getDocumentNoLabel()}: <span style={boldText}>{billNo}</span></span>
            <span>Date: {format(date, 'dd/MM/yy')}</span>
          </div>
          <div style={leftRightRow}>
            <span>Time: {format(date, 'hh:mm a')}</span>
            {(cashier || counter) && (
              <span>{cashier ? `Cashier: ${truncateText(cashier, 12)}` : ''}{counter ? ` C:${counter}` : ''}</span>
            )}
          </div>
        </div>

        {/* ============ CUSTOMER SECTION ============ */}
        {(customerName || customerPhone) && (
          <>
            <div style={separatorStyle}>{DASHED_LINE}</div>
            <div style={{ fontSize: '10px', marginBottom: '4px' }}>
              {customerName && (
                <div><span style={boldText}>Customer:</span> {truncateText(customerName, 28)}</div>
              )}
              {customerPhone && (
                <div><span style={boldText}>Mobile:</span> {customerPhone}</div>
              )}
              {customerAddress && (
                <div style={{ lineHeight: '1.2' }}><span style={boldText}>Addr:</span> {truncateText(customerAddress, 32)}</div>
              )}
            </div>
          </>
        )}

        <div style={separatorStyle}>{SEPARATOR_LINE}</div>

        {/* ============ ITEMS HEADER ============ */}
        <div style={{ 
          display: 'flex', 
          fontSize: '10px', 
          fontWeight: 900,
          marginBottom: '2px',
          textTransform: 'uppercase',
          borderBottom: '1px solid #000',
          paddingBottom: '2px'
        }}>
          <div style={{ width: '48%', textAlign: 'left' }}>ITEM</div>
          <div style={{ width: '12%', textAlign: 'center' }}>QTY</div>
          <div style={{ width: '18%', textAlign: 'right' }}>RATE</div>
          <div style={{ width: '22%', textAlign: 'right' }}>AMT</div>
        </div>

        {/* ============ ITEMS LIST ============ */}
        <div style={{ marginBottom: '4px' }}>
          {items.map((item, index) => (
            <div key={index} style={{ fontSize: '10px', marginBottom: '3px' }}>
              {/* Item name on its own line for readability */}
              <div style={{ 
                fontWeight: 700, 
                fontSize: '10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%'
              }}>
                {truncateText(item.particulars, 40)}
              </div>
              {/* Qty, Rate, Amount */}
              <div style={{ display: 'flex' }}>
                <div style={{ width: '48%', textAlign: 'left' }}></div>
                <div style={{ width: '12%', textAlign: 'center', fontWeight: 900 }}>{item.qty}</div>
                <div style={{ width: '18%', textAlign: 'right' }}>{formatAmount(item.rate)}</div>
                <div style={{ width: '22%', textAlign: 'right', fontWeight: 900 }}>{formatAmount(item.total)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={separatorStyle}>{SEPARATOR_LINE}</div>

        {/* ============ TOTALS SECTION ============ */}
        <div style={{ fontSize: '11px' }}>
          {/* Subtotal with Qty */}
          <div style={{ ...leftRightRow, marginBottom: '2px' }}>
            <span>SubTotal ({totalQty} items)</span>
            <span style={boldText}>₹{formatAmount(subTotal)}</span>
          </div>

          {/* Discount if any */}
          {discount > 0 && (
            <div style={{ ...leftRightRow, marginBottom: '2px' }}>
              <span>Discount</span>
              <span style={boldText}>-₹{formatAmount(discount)}</span>
            </div>
          )}

          {/* Sale Return Adjust if any */}
          {saleReturnAdjust > 0 && (
            <div style={{ ...leftRightRow, marginBottom: '2px' }}>
              <span>S/R Adjust</span>
              <span style={boldText}>-₹{formatAmount(saleReturnAdjust)}</span>
            </div>
          )}

          {/* Points Redemption if any */}
          {pointsRedeemed > 0 && pointsRedemptionValue > 0 && (
            <div style={{ ...leftRightRow, marginBottom: '2px' }}>
              <span>Points ({pointsRedeemed} pts)</span>
              <span style={boldText}>-₹{formatAmount(pointsRedemptionValue)}</span>
            </div>
          )}

          {/* GST Breakdown */}
          {(calculatedGst.cgst > 0 || calculatedGst.sgst > 0) && (
            <>
              <div style={{ ...separatorStyle, margin: '3px 0' }}>{DASHED_LINE}</div>
              <div style={{ fontSize: '10px' }}>
                {calculatedGst.cgst > 0 && (
                  <div style={leftRightRow}>
                    <span>CGST</span>
                    <span>₹{formatAmount(calculatedGst.cgst)}</span>
                  </div>
                )}
                {calculatedGst.sgst > 0 && (
                  <div style={leftRightRow}>
                    <span>SGST</span>
                    <span>₹{formatAmount(calculatedGst.sgst)}</span>
                  </div>
                )}
                {calculatedGst.igst && calculatedGst.igst > 0 && (
                  <div style={leftRightRow}>
                    <span>IGST</span>
                    <span>₹{formatAmount(calculatedGst.igst)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ============ GRAND TOTAL ============ */}
        <div style={separatorStyle}>{DOUBLE_LINE}</div>
        <div style={{ 
          ...leftRightRow, 
          fontSize: '16px',
          fontWeight: 900,
          margin: '4px 0',
          letterSpacing: '0.5px'
        }}>
          <span>TOTAL</span>
          <span>₹{formatAmount(grandTotal)}</span>
        </div>
        <div style={separatorStyle}>{DOUBLE_LINE}</div>

        {/* ============ PAYMENT DETAILS ============ */}
        {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0 || paymentMethod) && (
          <div style={{ fontSize: '10px', margin: '4px 0' }}>
            {/* Payment Mode */}
            <div style={{ ...leftRightRow, marginBottom: '2px' }}>
              <span style={boldText}>Payment:</span>
              <span style={boldText}>{paymentMethod?.toUpperCase() || 'CASH'}</span>
            </div>
            
            {/* Payment breakdown for mixed payments */}
            {(cashPaid > 0 || upiPaid > 0 || cardPaid > 0) && (
              <>
                {cashPaid > 0 && (
                  <div style={leftRightRow}>
                    <span>Cash Received</span>
                    <span>₹{formatAmount(cashPaid)}</span>
                  </div>
                )}
                {upiPaid > 0 && (
                  <div style={leftRightRow}>
                    <span>UPI</span>
                    <span>₹{formatAmount(upiPaid)}</span>
                  </div>
                )}
                {cardPaid > 0 && (
                  <div style={leftRightRow}>
                    <span>Card</span>
                    <span>₹{formatAmount(cardPaid)}</span>
                  </div>
                )}
                {refundCash > 0 && (
                  <div style={{ ...leftRightRow, fontWeight: 900 }}>
                    <span>Change Return</span>
                    <span>₹{formatAmount(refundCash)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ============ LOYALTY POINTS ============ */}
        {(pointsRedeemed > 0 || pointsBalance > 0) && (
          <>
            <div style={separatorStyle}>{DASHED_LINE}</div>
            <div style={{ 
              fontSize: '10px',
              margin: '4px 0',
              padding: '3px',
              border: '1px solid #000',
              borderRadius: '0'
            }}>
              <div style={{ ...centerStyle, fontWeight: 900, marginBottom: '2px' }}>LOYALTY POINTS</div>
              {pointsRedeemed > 0 && (
                <div style={leftRightRow}>
                  <span>Redeemed</span>
                  <span>{pointsRedeemed} pts (₹{formatAmount(pointsRedemptionValue)})</span>
                </div>
              )}
              <div style={{ ...leftRightRow, fontWeight: 900 }}>
                <span>Balance</span>
                <span>{pointsBalance} pts</span>
              </div>
            </div>
          </>
        )}

        {/* ============ UPI QR CODE ============ */}
        {qrCodeUrl && settings?.bill_barcode_settings?.upi_id && (
          <div style={{ ...centerStyle, margin: '6px 0' }}>
            <div style={separatorStyle}>{DASHED_LINE}</div>
            <div style={{ fontSize: '10px', fontWeight: 900, marginBottom: '3px' }}>SCAN TO PAY</div>
            <img src={qrCodeUrl} alt="UPI QR" style={{ width: '80px', height: '80px', margin: '0 auto', display: 'block' }} />
            <div style={{ fontSize: '9px', marginTop: '2px' }}>{settings.bill_barcode_settings.upi_id}</div>
          </div>
        )}

        {/* ============ TERMS & CONDITIONS ============ */}
        {termsConditions && (
          <>
            <div style={separatorStyle}>{DASHED_LINE}</div>
            <div style={{ 
              fontSize: '9px', 
              lineHeight: '1.3',
              marginTop: '4px',
              whiteSpace: 'pre-wrap'
            }}>
              {termsConditions}
            </div>
          </>
        )}

        {/* ============ FOOTER ============ */}
        <div style={separatorStyle}>{SEPARATOR_LINE}</div>
        <div style={{ 
          ...centerStyle, 
          fontSize: '12px',
          fontWeight: 900,
          margin: '6px 0 4px',
          letterSpacing: '1px',
          textTransform: 'uppercase'
        }}>
          THANK YOU!
        </div>
        <div style={{ ...centerStyle, fontSize: '10px', marginBottom: '2px' }}>
          Visit Again
        </div>

        {/* Custom Footer Text */}
        {settings?.bill_barcode_settings?.footer_text && (
          <div style={{ ...centerStyle, fontSize: '9px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
            {settings.bill_barcode_settings.footer_text}
          </div>
        )}

        {/* Powered By / Software info - optional */}
        <div style={{ ...centerStyle, fontSize: '8px', marginTop: '6px', color: '#666' }}>
          {format(date, 'dd-MM-yyyy HH:mm:ss')}
        </div>
      </div>
    );
  }
);

ThermalPrint80mm.displayName = 'ThermalPrint80mm';
