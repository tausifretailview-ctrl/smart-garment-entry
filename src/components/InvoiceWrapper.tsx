import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSettings } from '@/hooks/useSettings';
import { ProfessionalTemplate } from './invoice-templates/ProfessionalTemplate';
import { ClassicTemplate } from './invoice-templates/ClassicTemplate';
import { ModernTemplate } from './invoice-templates/ModernTemplate';
import { ModernWholesaleTemplate } from './invoice-templates/ModernWholesaleTemplate';
import { MinimalTemplate } from './invoice-templates/MinimalTemplate';
import { CompactTemplate } from './invoice-templates/CompactTemplate';
import { DetailedTemplate } from './invoice-templates/DetailedTemplate';
import { TaxInvoiceTemplate } from './invoice-templates/TaxInvoiceTemplate';
import { TallyTaxInvoiceTemplate } from './invoice-templates/TallyTaxInvoiceTemplate';
import { RetailTemplate } from './invoice-templates/RetailTemplate';
import { RetailERPTemplate } from './invoice-templates/RetailERPTemplate';
import { WholesaleA5Template } from './invoice-templates/WholesaleA5Template';
import { A5HorizontalBillFormat } from './A5HorizontalBillFormat';
import { ThermalPrint80mm } from './ThermalPrint80mm';
import { ThermalReceiptCompact } from './ThermalReceiptCompact';
import { ModernThermalReceipt80mm } from './ModernThermalReceipt80mm';
import QRCode from 'qrcode';

interface InvoiceItem {
  sr: number;
  particulars: string;
  size: string;
  barcode: string;
  hsn: string;
  sp: number;
  mrp?: number;
  qty: number;
  rate: number;
  total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
  gstPercent?: number;
  discountPercent?: number;
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
  customerTransportDetails?: string;
  
  // Items
  items: InvoiceItem[];
  
  // Amounts
  subTotal: number;
  discount: number;
  saleReturnAdjust?: number;
  grandTotal: number;
  
  // Payment
  tenderAmount?: number;
  cashPaid?: number;
  refundCash?: number;
  upiPaid?: number;
  paymentMethod?: string;
  cashAmount?: number;
  cardAmount?: number;
  upiAmount?: number;
  creditAmount?: number;
  paidAmount?: number;
  previousBalance?: number;
  
  // Points
  pointsRedeemed?: number;
  pointsRedemptionValue?: number;
  pointsBalance?: number;
  
  // Round-off (pass directly from POS for accuracy)
  roundOff?: number;
  
  // Optional overrides
  template?: string;
  colorScheme?: string;
  format?: string;
  
  // Display option overrides (for live preview)
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  minItemRows?: number;
  showTotalQuantity?: boolean;
  amountWithDecimal?: boolean;
  showReceivedAmount?: boolean;
  showBalanceAmount?: boolean;
  showPartyBalance?: boolean;
  showTaxDetails?: boolean;
  showYouSaved?: boolean;
  amountWithGrouping?: boolean;
  
  // Wholesale mode overrides
  enableWholesaleMode?: boolean;
  sizeDisplayFormat?: 'size/qty' | 'size×qty';
  showProductColor?: boolean;
  showProductBrand?: boolean;
  showProductStyle?: boolean;
  
  // Customization overrides (for live preview)
  customHeaderText?: string;
  customFooterText?: string;
  logoPlacement?: string;
  fontFamily?: string;
  declarationText?: string;
  termsConditions?: string[];
  salesman?: string;
  notes?: string;
  isDcInvoice?: boolean;
  financerDetails?: {
    financer_name: string;
    loan_number?: string;
    emi_amount?: number;
    tenure?: number;
    down_payment?: number;
  } | null;
}

export const InvoiceWrapper = React.forwardRef<HTMLDivElement, InvoiceWrapperProps>(
  (props, ref) => {
    const { currentOrganization } = useOrganization();
    const [settings, setSettings] = useState<any>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    const { data: orgSettings } = useSettings();
    useEffect(() => {
      if (orgSettings) setSettings(orgSettings);
    }, [orgSettings]);

    useEffect(() => {
      if (settings?.bill_barcode_settings?.upi_id || settings?.bill_barcode_settings?.dc_upi_id) {
        generateUpiQrCode();
      }
    }, [settings, props.grandTotal]);


    const generateUpiQrCode = async () => {
      try {
        const upiId = (props.isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id)
          ? settings.bill_barcode_settings.dc_upi_id
          : settings?.bill_barcode_settings?.upi_id;
        if (!upiId) return;
        const businessName = settings?.business_name || 'Store';
        
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${props.grandTotal.toFixed(2)}&cu=INR`;
        
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

    if (!settings) {
      return (
        <div ref={ref} data-invoice-loading="true" style={{ padding: '20px', textAlign: 'center' }}>
          Loading...
        </div>
      );
    }

    // Get settings - use prop overrides if provided, otherwise use database settings
    const template = props.template || settings?.sale_settings?.invoice_template || 'professional';
    const colorScheme = props.colorScheme || settings?.sale_settings?.invoice_color_scheme || 'blue';
    const rawFormat = props.format || settings?.sale_settings?.invoice_paper_format || 
      (() => {
        // Fallback: derive from sales_bill_format if invoice_paper_format not set
        const sbf = (settings?.sale_settings as any)?.sales_bill_format;
        if (sbf === 'a5') return 'a5-vertical';
        if (sbf === 'a5-horizontal') return 'a5-horizontal';
        return undefined;
      })() || 'a4';
    const format = rawFormat === 'a5' ? 'a5-vertical' : rawFormat;
    
    // Get display settings - use prop overrides if provided for live preview
    const showHSN = props.showHSN ?? settings?.sale_settings?.show_hsn_code ?? true;
    const showBarcode = props.showBarcode ?? settings?.sale_settings?.show_barcode ?? true;
    const showGSTBreakdown = props.showGSTBreakdown ?? settings?.sale_settings?.show_gst_breakdown ?? true;
    const showBankDetails = props.showBankDetails ?? settings?.sale_settings?.show_bank_details ?? false;
    const showMRP = props.showMRP ?? (settings?.sale_settings as any)?.show_mrp_column ?? false;
    const minItemRows = props.minItemRows ?? (settings?.sale_settings as any)?.min_item_rows ?? 12;
    const showTotalQuantity = props.showTotalQuantity ?? (settings?.sale_settings as any)?.show_total_quantity ?? true;
    const amountWithDecimal = props.amountWithDecimal ?? (settings?.sale_settings as any)?.amount_with_decimal ?? true;
    const showReceivedAmount = props.showReceivedAmount ?? (settings?.sale_settings as any)?.show_received_amount ?? false;
    const showBalanceAmount = props.showBalanceAmount ?? (settings?.sale_settings as any)?.show_balance_amount ?? false;
    const showPartyBalance = props.showPartyBalance ?? (settings?.sale_settings as any)?.show_party_balance ?? false;
    const showTaxDetails = props.showTaxDetails ?? (settings?.sale_settings as any)?.show_tax_details ?? true;
    const showYouSaved = props.showYouSaved ?? (settings?.sale_settings as any)?.show_you_saved ?? false;
    const amountWithGrouping = props.amountWithGrouping ?? (settings?.sale_settings as any)?.amount_with_grouping ?? true;
    
    // Get wholesale mode settings - use prop overrides if provided for live preview
    // Auto-enable wholesale mode when using modern-wholesale template
    const enableWholesaleMode = props.enableWholesaleMode ?? (settings?.sale_settings as any)?.enable_wholesale_mode ?? (template === 'modern-wholesale');
    const sizeDisplayFormat = props.sizeDisplayFormat ?? (settings?.sale_settings as any)?.size_display_format ?? 'size/qty';
    const showProductColor = props.showProductColor ?? (settings?.sale_settings as any)?.show_product_color ?? true;
    const showProductBrand = props.showProductBrand ?? (settings?.sale_settings as any)?.show_product_brand ?? false;
    const showProductStyle = props.showProductStyle ?? (settings?.sale_settings as any)?.show_product_style ?? false;
    
    // Get customization settings - use prop overrides if provided for live preview
    const customHeaderText = props.customHeaderText ?? settings?.sale_settings?.invoice_header_text;
    const customFooterText = props.customFooterText ?? settings?.sale_settings?.invoice_footer_text;
    const logoPlacement = props.logoPlacement ?? settings?.sale_settings?.logo_placement ?? 'left';
    const fontFamily = props.fontFamily ?? settings?.sale_settings?.font_family ?? 'inter';
    const declarationText = props.declarationText ?? settings?.sale_settings?.declaration_text ?? 'Certified that the particulars given above are true and correct';
    const rawTerms = props.termsConditions ?? settings?.sale_settings?.terms_list ?? [
      'Goods once sold will not be taken back',
      'No exchange without bill',
      'Subject to jurisdiction'
    ];
    // Filter blank terms so empty slots don't render as blank lines/bullets
    const filteredTerms = rawTerms?.filter((t: string) => t && t.trim()) ?? [];
    
    // Calculate tax amounts - GST is INCLUSIVE in item totals
    // For each item: GST amount = (item.total * gstPercent) / (100 + gstPercent)
    // IMPORTANT: item.total is already AFTER discount, so we extract GST from post-discount amounts
    const totalLineAmount = props.items.reduce((sum, item) => sum + item.total, 0);
    const totalGstFromItems = props.items.reduce((sum, item) => {
      const gstPct = item.gstPercent || 0;
      if (gstPct <= 0) return sum;
      // GST is included in total, so extract it
      const gstAmt = (item.total * gstPct) / (100 + gstPct);
      return sum + gstAmt;
    }, 0);
    
    // Taxable amount = Total line items - GST (GST is extracted from already-discounted line totals)
    // Do NOT subtract discount again since item.total already reflects the discount
    const taxableAmount = totalLineAmount - totalGstFromItems;
    const totalTax = totalGstFromItems;
    
    // CGST and SGST are each exactly half of total GST
    const cgstAmount = totalTax / 2;
    const sgstAmount = totalTax / 2;
    // Use direct prop if available, otherwise calculate as fallback
    // Fallback accounts for discount, sale return, and points redemption to avoid double-counting
    const roundOff = props.roundOff ?? 
      (props.grandTotal - (props.subTotal - props.discount - (props.saleReturnAdjust || 0) + totalTax - (props.pointsRedemptionValue || 0)));

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
      customerTransportDetails: props.customerTransportDetails,
      
      items: props.items,
      
      subtotal: props.subTotal,
      discount: props.discount,
      saleReturnAdjust: props.saleReturnAdjust || 0,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      totalTax,
      roundOff,
      grandTotal: props.grandTotal,
      
      paymentMethod: props.paymentMethod,
      amountPaid: props.paidAmount || props.cashPaid || props.upiPaid,
      balanceDue: props.grandTotal - (props.paidAmount || props.cashPaid || 0) - (props.upiPaid || 0) - (props.saleReturnAdjust || 0),
      cashAmount: props.cashAmount,
      cardAmount: props.cardAmount,
      upiAmount: props.upiAmount,
      creditAmount: props.creditAmount,
      paidAmount: props.paidAmount,
      previousBalance: props.previousBalance || 0,
      
      qrCodeUrl,
      upiId: (props.isDcInvoice && settings?.bill_barcode_settings?.dc_upi_id)
        ? settings.bill_barcode_settings.dc_upi_id
        : settings?.bill_barcode_settings?.upi_id,
      bankDetails: settings?.sale_settings?.bank_details,
      declarationText,
      termsConditions: filteredTerms,
      
      showHSN,
      showBarcode,
      showGSTBreakdown,
      showBankDetails,
      showMRP,
      minItemRows,
      showTotalQuantity,
      amountWithDecimal,
      showReceivedAmount,
      showBalanceAmount,
      showPartyBalance,
      showTaxDetails,
      showYouSaved,
      amountWithGrouping,
      format: format as 'a5-vertical' | 'a5-horizontal' | 'a4',
      colorScheme,
      
      // Customization settings
      customHeaderText,
      customFooterText,
      logoPlacement,
      fontFamily,
      
      // Salesman and Notes
      salesman: props.salesman,
      notes: props.notes,
      
      // Wholesale mode settings
      enableWholesaleGrouping: enableWholesaleMode,
      sizeDisplayFormat,
      showProductColor,
      showProductBrand,
      showProductStyle,
      
      // Points information
      pointsRedeemed: props.pointsRedeemed || 0,
      pointsRedemptionValue: props.pointsRedemptionValue || 0,
      pointsBalance: props.pointsBalance || 0,
      
      // Financer details
      financerDetails: props.financerDetails || null,
      
      // Stamp / Signature
      stampImageBase64: (settings?.bill_barcode_settings as any)?.stamp_show_sale !== false
        ? (settings?.bill_barcode_settings as any)?.stamp_image_base64 || undefined
        : undefined,
      stampPosition: (settings?.bill_barcode_settings as any)?.stamp_position || 'bottom-right',
      stampSize: (settings?.bill_barcode_settings as any)?.stamp_size || 'medium',
      instagramLink: (settings?.bill_barcode_settings as any)?.instagram_link || undefined,
    };

    // Select template component based on settings
    const renderTemplate = () => {
      // Use thermal format (handles both 'thermal' and 'thermal-receipt')
      if (format === 'thermal-receipt' || format === 'thermal') {
        const thermalStyle = (settings?.sale_settings as any)?.thermal_receipt_style || 'classic';
        const ThermalComponent = thermalStyle === 'modern' ? ModernThermalReceipt80mm : thermalStyle === 'compact' ? ThermalReceiptCompact : ThermalPrint80mm;
        // Compute rate-wise GST breakdown for thermal receipt
        const rateMap = new Map<number, { taxable: number; tax: number }>();
        props.items.forEach(item => {
          const gstPct = item.gstPercent || 0;
          if (gstPct <= 0) return;
          const gstAmt = (item.total * gstPct) / (100 + gstPct);
          const taxable = item.total - gstAmt;
          const existing = rateMap.get(gstPct) || { taxable: 0, tax: 0 };
          rateMap.set(gstPct, { taxable: existing.taxable + taxable, tax: existing.tax + gstAmt });
        });
        const gstRateBreakdown = Array.from(rateMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([rate, { taxable, tax }]) => ({
            rate,
            taxableAmount: taxable,
            cgst: tax / 2,
            sgst: tax / 2,
            totalTax: tax,
          }));

        return (
          <ThermalComponent
            billNo={props.billNo}
            date={props.date}
            customerName={props.customerName}
            customerPhone={props.customerMobile}
            customerAddress={props.customerAddress}
            items={props.items.map((item, idx) => ({
              sr: idx + 1,
              particulars: item.particulars,
              barcode: item.barcode,
              qty: item.qty,
              rate: item.rate,
              total: item.total,
            }))}
            subTotal={props.subTotal}
            discount={props.discount}
            saleReturnAdjust={props.saleReturnAdjust}
            roundOff={props.roundOff}
            grandTotal={props.grandTotal}
            gstBreakdown={{
              cgst: cgstAmount,
              sgst: sgstAmount,
            }}
            gstRateBreakdown={gstRateBreakdown.length > 0 ? gstRateBreakdown : undefined}
            paymentMethod={props.paymentMethod}
            cashPaid={props.cashPaid || props.cashAmount}
            upiPaid={props.upiPaid || props.upiAmount}
            cardPaid={props.cardAmount}
            creditPaid={props.creditAmount}
            paidAmount={props.paidAmount}
            refundCash={props.refundCash}
            documentType="invoice"
            termsConditions={filteredTerms.join('\n')}
            notes={props.notes}
            pointsRedeemed={props.pointsRedeemed}
            pointsRedemptionValue={props.pointsRedemptionValue}
            pointsBalance={props.pointsBalance}
            salesman={props.salesman}
            isDcInvoice={props.isDcInvoice}
          />
        );
      }
      
      // Use A5HorizontalBillFormat for a5-horizontal format
      if (format === 'a5-horizontal') {
        const paymentMethodLabel = (() => {
          if (props.paymentMethod === 'refund_cash') return 'Refund (Cash)';
          if (props.paymentMethod === 'refund_upi') return 'Refund (UPI)';
          if (props.paymentMethod === 'refund_bank_transfer') return 'Refund (Bank)';
          return props.paymentMethod;
        })();
        const a5HorizontalData = {
          invoiceNo: props.billNo,
          date: props.date.toLocaleDateString('en-IN'),
          customerName: props.customerName || 'Walk-in Customer',
          customerPhone: props.customerMobile,
          items: props.items.map(item => ({
            name: item.particulars,
            variant: item.size,
            barcode: item.barcode,
            quantity: item.qty,
            price: item.rate,
            total: item.total,
          })),
          subtotal: props.subTotal,
          tax: totalTax,
          discount: props.discount,
          grandTotal: props.grandTotal,
          paymentMethod: paymentMethodLabel,
          cashAmount: props.cashAmount,
          cardAmount: props.cardAmount,
          upiAmount: props.upiAmount,
          creditAmount: props.creditAmount,
          paidAmount: props.paidAmount,
          refundCash: props.refundCash,
          organization: {
            name: settings?.business_name || '',
            address: settings?.address || '',
            phone: settings?.mobile_number || '',
            email: settings?.email_id,
            upiId: settings?.bill_barcode_settings?.upi_id,
            terms: settings?.sale_settings?.declaration_text,
            logo: settings?.bill_barcode_settings?.logo_url,
          },
        };
        return <A5HorizontalBillFormat data={a5HorizontalData} />;
      }
      
      // Select template based on settings
      switch (template) {
        case 'classic':
          return <ClassicTemplate {...commonProps} />;
        case 'modern':
          return <ModernTemplate {...commonProps} />;
        case 'modern-wholesale':
          return <ModernWholesaleTemplate {...commonProps} />;
        case 'minimal':
          return <MinimalTemplate {...commonProps} />;
        case 'compact':
          return <CompactTemplate {...commonProps} />;
        case 'detailed':
          return <DetailedTemplate {...commonProps} />;
        case 'tax-invoice':
          return <TaxInvoiceTemplate {...commonProps} />;
        case 'tally-tax-invoice':
          return <TallyTaxInvoiceTemplate {...commonProps} />;
        case 'retail':
          return <RetailTemplate {...commonProps} />;
        case 'retail-erp':
          return <RetailERPTemplate {...commonProps} />;
        case 'wholesale-a5':
          return <WholesaleA5Template {...commonProps} />;
        case 'professional':
        default:
          return <ProfessionalTemplate {...commonProps} />;
      }
    };

    return (
      <div ref={ref} className="invoice-print-root">
        {renderTemplate()}
      </div>
    );
  }
);

InvoiceWrapper.displayName = 'InvoiceWrapper';
