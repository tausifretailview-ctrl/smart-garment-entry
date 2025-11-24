import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ProfessionalTemplate } from './invoice-templates/ProfessionalTemplate';
import QRCode from 'qrcode';

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
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface InvoiceWrapperProps {
  // Invoice Details
  billNo: string;
  date: Date;
  
  // Customer Details
  customerName: string;
  customerAddress?: string;
  customerMobile?: string;
  customerGSTIN?: string;
  
  // Items
  items: InvoiceItem[];
  
  // Amounts
  subTotal: number;
  discount: number;
  grandTotal: number;
  
  // Payment
  tenderAmount?: number;
  cashPaid?: number;
  refundCash?: number;
  upiPaid?: number;
  paymentMethod?: string;
  
  // Optional overrides
  template?: string;
  colorScheme?: string;
  format?: string;
}

export const InvoiceWrapper = React.forwardRef<HTMLDivElement, InvoiceWrapperProps>(
  (props, ref) => {
    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    useEffect(() => {
      fetchSettings();
    }, [currentOrganization?.id]);

    useEffect(() => {
      if (settings?.bill_barcode_settings?.upi_id) {
        generateUpiQrCode();
      }
    }, [settings, props.grandTotal]);

    const fetchSettings = async () => {
      if (!currentOrganization?.id) return;
      
      try {
        const { data, error } = await supabase
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
        
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${props.grandTotal.toFixed(2)}&cu=INR`;
        
        const qrUrl = await QRCode.toDataURL(upiString, {
          width: 120,
          margin: 1,
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

    if (!settings) {
      return <div ref={ref}>Loading...</div>;
    }

    // Get settings
    const template = props.template || settings?.sale_settings?.invoice_template || 'professional';
    const colorScheme = props.colorScheme || settings?.sale_settings?.invoice_color_scheme || 'blue';
    const format = props.format || settings?.sale_settings?.invoice_paper_format || 'a5-vertical';
    
    // Get display settings
    const showHSN = settings?.sale_settings?.show_hsn_code ?? true;
    const showBarcode = settings?.sale_settings?.show_barcode ?? true;
    const showGSTBreakdown = settings?.sale_settings?.show_gst_breakdown ?? true;
    const showBankDetails = settings?.sale_settings?.show_bank_details ?? false;
    
    // Calculate tax amounts (simplified - you may need more complex logic)
    const taxableAmount = props.subTotal - props.discount;
    const gstRate = settings?.sale_settings?.sales_tax_rate || 0;
    const totalTax = (taxableAmount * gstRate) / 100;
    const cgstAmount = totalTax / 2;
    const sgstAmount = totalTax / 2;
    const roundOff = props.grandTotal - (taxableAmount + totalTax);

    // Common props for all templates
    const commonProps = {
      businessName: settings?.business_name || '',
      address: settings?.address || '',
      mobile: settings?.mobile_number || '',
      email: settings?.email_id,
      gstNumber: settings?.gst_number,
      logoUrl: settings?.bill_barcode_settings?.logo_url,
      
      invoiceNumber: props.billNo,
      invoiceDate: props.date,
      invoiceTime: props.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      
      customerName: props.customerName,
      customerAddress: props.customerAddress,
      customerMobile: props.customerMobile,
      customerGSTIN: props.customerGSTIN,
      
      items: props.items,
      
      subtotal: props.subTotal,
      discount: props.discount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      totalTax,
      roundOff,
      grandTotal: props.grandTotal,
      
      paymentMethod: props.paymentMethod,
      amountPaid: props.cashPaid || props.upiPaid,
      balanceDue: props.grandTotal - (props.cashPaid || 0) - (props.upiPaid || 0),
      
      qrCodeUrl,
      upiId: settings?.bill_barcode_settings?.upi_id,
      bankDetails: settings?.sale_settings?.bank_details,
      declarationText: settings?.sale_settings?.declaration_text || 'Certified that the particulars given above are true and correct',
      termsConditions: settings?.sale_settings?.terms_list || [
        'Goods once sold will not be taken back',
        'No exchange without bill',
        'Subject to jurisdiction'
      ],
      
      showHSN,
      showBarcode,
      showGSTBreakdown,
      showBankDetails,
      format: format as 'a5-vertical' | 'a5-horizontal' | 'a4',
      colorScheme
    };

    // Select template component based on settings
    const renderTemplate = () => {
      // For now, only use ProfessionalTemplate as it supports all the new features
      // Classic and Modern templates can be updated later if needed
      return <ProfessionalTemplate {...commonProps} />;
    };

    return <div ref={ref}>{renderTemplate()}</div>;
  }
);

InvoiceWrapper.displayName = 'InvoiceWrapper';
