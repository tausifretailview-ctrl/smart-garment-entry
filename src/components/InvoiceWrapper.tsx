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
import { RetailTaxEzzyTemplate } from './invoice-templates/RetailTaxEzzyTemplate';
import { WholesaleA5Template } from './invoice-templates/WholesaleA5Template';
import { A4ElectronicTemplate } from './invoice-templates/A4ElectronicTemplate';
import { A5HorizontalBillFormat } from './A5HorizontalBillFormat';
import { ThermalPrint80mm } from './ThermalPrint80mm';
import { ThermalReceiptCompact } from './ThermalReceiptCompact';
import { ModernThermalReceipt80mm } from './ModernThermalReceipt80mm';
import { KidsThermalReceipt80mm } from './KidsThermalReceipt80mm';
import QRCode from 'qrcode';
import {
  calculateGSTBreakup,
  getGstInclusiveNetBase,
  normalizeGstTaxType,
  type GstTaxType,
} from '@/utils/gstRegisterUtils';
import { resolvePosThermalPaper, type PosThermalPaper } from '@/utils/invoicePrintFormat';

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
  itemNotes?: string;
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
  /** POS thermal roll width (58mm / 80mm) — used by kids-80mm and other thermal templates. */
  thermalPaper?: PosThermalPaper;
  
  // Display option overrides (for live preview)
  showHSN?: boolean;
  showBarcode?: boolean;
  showGSTBreakdown?: boolean;
  showBankDetails?: boolean;
  showMRP?: boolean;
  /** When false, hides -X% under Rate on invoice print (sale_settings.show_discount_on_rate). */
  showDiscountOnRate?: boolean;
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
  /** GST inclusive = prices include tax; exclusive = taxable amounts with GST added at bottom (Tally tax invoice). */
  taxType?: GstTaxType | string;
  notes?: string;
  /** Freight / alteration / other charges added on top of line items (sale invoice). */
  otherCharges?: number;
  isDcInvoice?: boolean;
  documentType?: 'invoice' | 'quotation' | 'sale-order' | 'pos';
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
    const templateForFormat = props.template || settings?.sale_settings?.invoice_template || 'professional';
    let format = rawFormat === 'a5' ? 'a5-vertical' : rawFormat;
    // A5-only templates must not be routed through the thermal receipt path.
    if (templateForFormat === 'retail-tax-ezzy' || templateForFormat === 'wholesale-a5') {
      format = 'a5-vertical';
    }
    // Kids 80mm is thermal-only — always use roll receipt layout.
    if (templateForFormat === 'kids-80mm') {
      format = 'thermal';
    }
    // Real Tast is A4 Bill of Supply only.
    if (templateForFormat === 'real-tast') {
      format = 'a4';
    }
    
    // Get display settings - use prop overrides if provided for live preview
    const showHSN = props.showHSN ?? settings?.sale_settings?.show_hsn_code ?? true;
    const showBarcode = props.showBarcode ?? settings?.sale_settings?.show_barcode ?? true;
    const showGSTBreakdown = props.showGSTBreakdown ?? settings?.sale_settings?.show_gst_breakdown ?? true;
    const showBankDetails = props.showBankDetails ?? settings?.sale_settings?.show_bank_details ?? false;
    const showMRP = props.showMRP ?? (settings?.sale_settings as any)?.show_mrp_column ?? false;
    const showDiscountOnRate =
      props.showDiscountOnRate ?? (settings?.sale_settings as any)?.show_discount_on_rate !== false;
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
    
    const taxType = normalizeGstTaxType(
      props.taxType ?? (settings?.sale_settings as { default_tax_type?: string })?.default_tax_type
    );
    const thermalPaper =
      props.thermalPaper ??
      resolvePosThermalPaper((settings?.bill_barcode_settings as { direct_print_pos_paper?: string })?.direct_print_pos_paper);
    const sellerGstin = settings?.gst_number || '';
    const buyerGstin = props.customerGSTIN || '';
    const isInterState =
      !!sellerGstin &&
      !!buyerGstin &&
      sellerGstin.substring(0, 2) !== buyerGstin.substring(0, 2);

    const linesTotal = props.items.reduce((s, item) => s + item.total, 0);
    const gstNetBase = getGstInclusiveNetBase(
      props.items,
      props.discount,
      props.saleReturnAdjust || 0
    );
    const gstNetMultiplier = linesTotal > 0 ? gstNetBase / linesTotal : 0;

    const gstBreakup = calculateGSTBreakup(
      props.items.map((item) => ({
        gst_percent: item.gstPercent || 0,
        line_total: item.total * gstNetMultiplier,
      })),
      taxType,
      isInterState
    );

    const taxableAmount =
      gstBreakup.taxable_0 +
      gstBreakup.taxable_5 +
      gstBreakup.taxable_12 +
      gstBreakup.taxable_18 +
      gstBreakup.taxable_28;
    const totalTax =
      gstBreakup.cgst_2_5 +
      gstBreakup.sgst_2_5 +
      gstBreakup.igst_5 +
      gstBreakup.cgst_6 +
      gstBreakup.sgst_6 +
      gstBreakup.igst_12 +
      gstBreakup.cgst_9 +
      gstBreakup.sgst_9 +
      gstBreakup.igst_18 +
      gstBreakup.cgst_14 +
      gstBreakup.sgst_14 +
      gstBreakup.igst_28;

    const cgstAmount =
      gstBreakup.cgst_2_5 + gstBreakup.cgst_6 + gstBreakup.cgst_9 + gstBreakup.cgst_14;
    const sgstAmount =
      gstBreakup.sgst_2_5 + gstBreakup.sgst_6 + gstBreakup.sgst_9 + gstBreakup.sgst_14;
    const igstAmount =
      gstBreakup.igst_5 + gstBreakup.igst_12 + gstBreakup.igst_18 + gstBreakup.igst_28;
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
      igstAmount,
      totalTax,
      taxType,
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
      showDiscountOnRate,
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
      otherCharges: props.otherCharges ?? 0,
      
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
        if (templateForFormat === 'kids-80mm') {
          return (
            <KidsThermalReceipt80mm
              billNo={props.billNo}
              date={props.date}
              customerName={props.customerName}
              customerPhone={props.customerMobile}
              items={props.items.map((item, idx) => ({
                sr: idx + 1,
                particulars: item.particulars,
                size: item.size,
                mrp: item.mrp ?? item.sp,
                qty: item.qty,
                rate: item.rate,
                total: item.total,
              }))}
              subTotal={props.subTotal}
              discount={props.discount}
              saleReturnAdjust={props.saleReturnAdjust}
              roundOff={props.roundOff}
              grandTotal={props.grandTotal}
              paymentMethod={props.paymentMethod}
              cashPaid={props.cashPaid || props.cashAmount}
              upiPaid={props.upiPaid || props.upiAmount}
              cardPaid={props.cardAmount}
              creditPaid={props.creditAmount}
              paidAmount={props.paidAmount}
              refundCash={props.refundCash}
              documentType={props.documentType || 'pos'}
              salesman={props.salesman}
              thermalPaper={thermalPaper}
            />
          );
        }
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
              itemNotes: item.itemNotes,
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
        case 'a4-electronic':
          return <A4ElectronicTemplate {...commonProps} />;
        case 'retail':
          return <RetailTemplate {...commonProps} />;
        case 'retail-erp':
          return <RetailERPTemplate {...commonProps} />;
        case 'real-tast':
          return <RetailERPTemplate {...commonProps} variant="real-tast" format="a4" />;
        case 'retail-tax-ezzy':
          return <RetailTaxEzzyTemplate {...commonProps} />;
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
