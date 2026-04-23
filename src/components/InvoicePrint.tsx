import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSettings } from '@/hooks/useSettings';
import QRCode from 'qrcode';
import './InvoicePrint.css';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  qty: number;
  rate: number;
  total: number;
  uom?: string;
}

interface InvoicePrintProps {
  billNo: string;
  date: Date;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  customerGSTIN?: string;
  items: InvoiceItem[];
  subTotal: number;
  discount: number;
  grandTotal: number;
  tenderAmount: number;
  cashPaid: number;
  refundCash: number;
  upiPaid: number;
  gstin?: string;
  template?: string;
  colorScheme?: string;
  paymentMethod?: string;
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  bankDetails?: {
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
  };
  declarationText?: string;
  termsConditions?: string[];
  isDcInvoice?: boolean;
}

export const InvoicePrint = React.forwardRef<HTMLDivElement, InvoicePrintProps>(
  (props, ref) => {
    const {
      billNo,
      date,
      customerName,
      customerAddress,
      customerMobile,
      customerGSTIN,
      items,
      subTotal,
      discount,
      grandTotal,
      tenderAmount,
      cashPaid,
      refundCash,
      upiPaid,
      gstin,
      template: propTemplate,
      colorScheme: propColorScheme,
      paymentMethod,
      showHSN,
      showBarcode,
      showGSTBreakdown,
      showBankDetails,
      bankDetails: propBankDetails,
      declarationText: propDeclarationText,
      termsConditions: propTermsConditions
    } = props;

  const { currentOrganization } = useOrganization();
  const [settings, setSettings] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    if (orgSettings) setSettings(orgSettings);
  }, [orgSettings]);

  useEffect(() => {
    if (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) {
      generateUpiQrCode();
    }
  }, [settings, grandTotal]);


  const generateUpiQrCode = async () => {
    try {
      const upiId = (props.isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id)
        ? settings.bill_barcode_settings.dc_upi_id
        : settings?.bill_barcode_settings?.upi_id;
      if (!upiId) return;
      const businessName = settings?.business_name || 'Store';
      
      // UPI payment string format
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

    const template = propTemplate || settings?.sale_settings?.invoice_template || 'classic';
    const colorScheme = propColorScheme || settings?.sale_settings?.invoice_color_scheme || 'blue';
    const invoiceFormat = settings?.bill_barcode_settings?.invoice_format || 'a5-vertical';
    
    // Use prop values if provided, otherwise fall back to settings
    const displayShowHSN = showHSN ?? settings?.sale_settings?.show_hsn_code ?? true;
    const displayShowBarcode = showBarcode ?? settings?.sale_settings?.show_barcode ?? true;
    const displayShowGSTBreakdown = showGSTBreakdown ?? settings?.sale_settings?.show_gst_breakdown ?? true;
    const displayShowBankDetails = showBankDetails ?? settings?.sale_settings?.show_bank_details ?? false;
    const bankDetails = propBankDetails || settings?.sale_settings?.bank_details;
    const declarationText = propDeclarationText || settings?.sale_settings?.declaration_text || 'Declaration: Composition taxable person, not eligible to collect tax on supplies.';
    const termsConditions = propTermsConditions || settings?.sale_settings?.terms_list;
    
    const showProductDetails = settings?.bill_barcode_settings?.show_product_details ?? true;
    const headerText = settings?.bill_barcode_settings?.header_text || '';
    const footerText = settings?.bill_barcode_settings?.footer_text || '';

    // Color scheme styles
    const colorStyles: Record<string, { primary: string; secondary: string; accent: string }> = {
      blue: { primary: '#1e40af', secondary: '#3b82f6', accent: '#dbeafe' },
      green: { primary: '#15803d', secondary: '#22c55e', accent: '#dcfce7' },
      purple: { primary: '#7e22ce', secondary: '#a855f7', accent: '#f3e8ff' },
      red: { primary: '#b91c1c', secondary: '#ef4444', accent: '#fee2e2' },
      orange: { primary: '#c2410c', secondary: '#f97316', accent: '#ffedd5' },
      gray: { primary: '#374151', secondary: '#6b7280', accent: '#f3f4f6' },
    };

    const currentColors = colorStyles[colorScheme] || colorStyles.blue;

    const templateClass = `invoice-print invoice-${template} invoice-color-${colorScheme} invoice-format-${invoiceFormat}`;

    return (
      <div ref={ref} className={templateClass} style={{ '--invoice-primary': currentColors.primary, '--invoice-secondary': currentColors.secondary, '--invoice-accent': currentColors.accent } as React.CSSProperties}>
        {/* Dynamic @page size for A4 */}
        {invoiceFormat === 'a4-full' && (
          <style>{`
            @page { size: A4 portrait; margin: 6mm; }
            @media print {
              .invoice-print.invoice-format-a4-full {
                width: 198mm !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
              }
              .invoice-print.invoice-format-a4-full .footer-section,
              .invoice-print.invoice-format-a4-full .payment-section,
              .invoice-print.invoice-format-a4-full .terms-section {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `}</style>
        )}
        {/* Header Text */}
        {headerText && (
          <div className="header-text" style={{ textAlign: 'center', padding: '8px', fontSize: '12px', fontWeight: 'bold', color: currentColors.primary, borderBottom: `1px solid ${currentColors.accent}` }}>
            {headerText}
          </div>
        )}
        {/* Header */}
        <div className="header" style={{ borderBottomColor: currentColors.primary }}>
          <div className="logo-section">
            {settings?.bill_barcode_settings?.logo_url ? (
              <img src={settings.bill_barcode_settings.logo_url} alt="Company Logo" className="shop-logo" />
            ) : (
              <img src="/placeholder.svg" alt="Shop Logo" className="shop-logo" />
            )}
          </div>
          <div className="shop-details">
            <h1 className="shop-name" style={{ color: currentColors.primary }}>{settings?.business_name || 'OWN FASHION'}</h1>
            <p className="shop-address">
              {settings?.address || 'Shop No.2, Sumati Paradise, Plot No.227, Sec No.R4, Vadhghar Node, Pushpak, Panvel - 420206.'}
            </p>
            <p className="shop-contact">
              {settings?.mobile_number ? `CONTACT : ${settings.mobile_number}` : 'CONTACT : 9326320664'}
              {settings?.email_id && ` | EMAIL: ${settings.email_id}`}
              {settings?.gst_number && ` | GSTIN: ${settings.gst_number}`}
            </p>
          </div>
        </div>

        <div className="bill-info-container">
          {/* Left Section */}
          <div className="customer-section">
            <h2 className="bill-type">BILL OF SUPPLY</h2>
            <div className="customer-details">
              <p><strong>NAME :</strong> {customerName}</p>
              <p><strong>MOB NO :</strong> {customerMobile}</p>
              {customerGSTIN && <p><strong>GSTIN :</strong> {customerGSTIN}</p>}
            </div>
          </div>

          {/* Right Section */}
          <div className="bill-details">
            <p><strong>BILL NO :</strong> {billNo}</p>
            <p><strong>DATE :</strong> {format(date, 'dd-MM-yyyy')}</p>
            <p><strong>TIME :</strong> {format(date, 'hh:mm:ss a')}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>SR</th>
              <th style={{ width: '35%' }}>PARTICULARS</th>
              {showProductDetails && (
                <>
                  <th style={{ width: '12%' }}>SIZE</th>
                  {displayShowHSN && <th style={{ width: '15%' }}>HSN</th>}
                </>
              )}
              <th style={{ width: '8%' }}>QTY</th>
              <th style={{ width: '12%' }}>MRP/RATE</th>
              <th style={{ width: '13%' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sr}>
                <td>{item.sr}</td>
                <td>
                  <div>{item.particulars}</div>
                  {showProductDetails && displayShowBarcode && <div className="barcode-text"><strong>BC:{item.barcode}</strong></div>}
                </td>
                {showProductDetails && (
                  <>
                    <td>{item.size}</td>
                    {displayShowHSN && <td>{item.hsn}</td>}
                  </>
                )}
                <td>{item.qty}{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? ` ${item.uom}` : ''}</td>
                <td>{item.rate.toFixed(2)}</td>
                <td>{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Section */}
        <div className="footer-section">
          <div className="declaration">
            <p style={{ whiteSpace: 'pre-line' }}>{declarationText}</p>
            {displayShowGSTBreakdown && (
              <div style={{ marginTop: '8px' }}>
                <p><strong>Tax Breakdown:</strong></p>
                <p>CGST: ₹{((grandTotal - subTotal + discount) / 2).toFixed(2)}</p>
                <p>SGST: ₹{((grandTotal - subTotal + discount) / 2).toFixed(2)}</p>
              </div>
            )}
          </div>
          <div className="totals-right">
            <p><strong>SUB TOTAL:</strong> {subTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="payment-section">
          <div className="payment-left">
            <p><strong>Payment Mode:</strong> {paymentMethod ? paymentMethod.toUpperCase() : 'CASH'}</p>
            <p><strong>Tender Amt:</strong> {tenderAmount.toFixed(2)}</p>
            <p><strong>Cash Paid:</strong> {cashPaid.toFixed(2)}</p>
            <p><strong>Refund Cash:</strong> {refundCash.toFixed(2)}</p>
            <p><strong>UPI Paid:</strong> {upiPaid.toFixed(2)}</p>
          </div>
          <div className="payment-right">
            <p><strong>TOTAL:</strong> {subTotal.toFixed(2)}</p>
            <p><strong>Dis (Rs) :</strong> {discount.toFixed(2)}</p>
            <p><strong>MRP TOTAL:</strong> {subTotal.toFixed(2)}</p>
            <p><strong>TOTAL DIS:</strong> {discount.toFixed(2)}</p>
            <p className="grand-total"><strong>G.TOTAL:</strong> <span className="total-amount">{grandTotal.toFixed(2)}</span></p>
          </div>
        </div>

        {/* Terms / Footer */}
        <div className="terms-section">
          <div className="terms-left">
            {termsConditions && termsConditions.length > 0 ? (
              termsConditions.map((term, idx) => (
                <p key={idx}>{idx + 1}. {term}</p>
              ))
            ) : footerText ? (
              <p style={{ whiteSpace: 'pre-line' }}>{footerText}</p>
            ) : (
              <>
                <p>1. GOODS ONCE SOLD WILL NOT BE TAKEN BACK.</p>
                <p>2. NO EXCHANGE WITHOUT BARCODE & BILL.</p>
                <p>3. EXCHANGE TIME : 01:00 TO 04:00 PM.</p>
                <p>4. THANK YOU !!! VISIT AGAIN . . .</p>
              </>
            )}
            {displayShowBankDetails && bankDetails && (
              <div style={{ marginTop: '12px', fontSize: '10px', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
                <p><strong>Bank Details:</strong></p>
                <p>Bank: {bankDetails.bank_name}</p>
                <p>A/c Holder: {bankDetails.account_holder}</p>
                <p>A/c No: {bankDetails.account_number}</p>
                <p>IFSC: {bankDetails.ifsc_code}</p>
              </div>
            )}
          </div>
          <div className="terms-right">
            {qrCodeUrl && (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) ? (
              <div className="upi-qr-section">
                <img src={qrCodeUrl} alt="UPI QR Code" className="upi-qr-code" />
                <p className="upi-text">Scan to Pay</p>
                <p className="upi-id">{(props.isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id) ? settings.bill_barcode_settings.dc_upi_id : settings.bill_barcode_settings.upi_id}</p>
              </div>
            ) : (
              <div className="barcode-image">
                <svg viewBox="0 0 100 40">
                  <rect x="2" y="0" width="2" height="40" fill="black"/>
                  <rect x="6" y="0" width="1" height="40" fill="black"/>
                  <rect x="9" y="0" width="3" height="40" fill="black"/>
                  <rect x="14" y="0" width="1" height="40" fill="black"/>
                  <rect x="17" y="0" width="2" height="40" fill="black"/>
                  <rect x="21" y="0" width="1" height="40" fill="black"/>
                  <rect x="24" y="0" width="3" height="40" fill="black"/>
                  <rect x="29" y="0" width="2" height="40" fill="black"/>
                  <rect x="33" y="0" width="1" height="40" fill="black"/>
                  <rect x="36" y="0" width="2" height="40" fill="black"/>
                  <rect x="40" y="0" width="3" height="40" fill="black"/>
                  <rect x="45" y="0" width="1" height="40" fill="black"/>
                  <rect x="48" y="0" width="2" height="40" fill="black"/>
                  <rect x="52" y="0" width="1" height="40" fill="black"/>
                  <rect x="55" y="0" width="3" height="40" fill="black"/>
                  <rect x="60" y="0" width="2" height="40" fill="black"/>
                  <rect x="64" y="0" width="1" height="40" fill="black"/>
                  <rect x="67" y="0" width="2" height="40" fill="black"/>
                  <rect x="71" y="0" width="3" height="40" fill="black"/>
                  <rect x="76" y="0" width="1" height="40" fill="black"/>
                  <rect x="79" y="0" width="2" height="40" fill="black"/>
                  <rect x="83" y="0" width="1" height="40" fill="black"/>
                  <rect x="86" y="0" width="3" height="40" fill="black"/>
                  <rect x="91" y="0" width="2" height="40" fill="black"/>
                  <rect x="95" y="0" width="3" height="40" fill="black"/>
                </svg>
                <p className="barcode-number">1</p>
              </div>
            )}
            <p className="signatory">Authorised Signatory</p>
          </div>
        </div>

      </div>
    );
  }
);

InvoicePrint.displayName = 'InvoicePrint';
