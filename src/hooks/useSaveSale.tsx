import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useCustomerPoints } from "@/hooks/useCustomerPoints";
import { useDashboardInvalidation } from "@/hooks/useDashboardInvalidation";
import { useShopName } from "@/hooks/useShopName";
import { useSettings } from "@/hooks/useSettings";
import { generateAndUploadInvoicePDF, InvoicePdfData, generateInvoicePdfBase64 } from "@/utils/invoicePdfUploader";
import { insertLedgerDebit, insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  color?: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
}

interface SaleData {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  items: CartItem[];
  grossAmount: number;
  discountAmount: number;
  flatDiscountPercent: number;
  flatDiscountAmount: number;
  saleReturnAdjust: number;
  roundOff: number;
  netAmount: number;
  refundAmount?: number;
  salesman?: string | null;
  notes?: string | null;
  pointsRedeemedAmount?: number;
}

export const useSaveSale = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const savingLockRef = useRef(false); // Synchronous lock to prevent duplicate saves
  const { awardPoints, isPointsEnabled, calculatePoints } = useCustomerPoints();
  const { invalidateSales } = useDashboardInvalidation();
  const shopName = useShopName();
  // Centralized cached org settings (5 min) — used by save handlers below
  const { data: orgSettings } = useSettings();

  /**
   * Auto-correct FY year in literal formats like "INV/25-26/1" → "INV/26-27/1"
   * so stale settings don't produce wrong-year invoices after April 1.
   */
  const autoCorrectFY = (fmt: string): string => {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const m = ist.getMonth() + 1;
    const y = ist.getFullYear();
    const fyStart = m >= 4 ? y : y - 1;
    const currentFY = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
    // Match patterns like /25-26/ or /24-25/ in the format string
    return fmt.replace(/\/(\d{2})-(\d{2})\//, `/${currentFY}/`);
  };

  const generateInvoiceNumber = async (
    format: string,
    seriesStart?: string,
    kind: 'sale' | 'pos' = 'sale'
  ) => {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Auto-correct stale FY in literal formats
    const correctedFormat = autoCorrectFY(format);
    const correctedStart = seriesStart ? autoCorrectFY(seriesStart) : seriesStart;

    // Determine minimum sequence from seriesStart trailing digits
    let minSequence = 1;
    if (correctedStart && correctedStart.trim()) {
      const startMatches = correctedStart.match(/(\d+)$/);
      if (startMatches) {
        minSequence = parseInt(startMatches[1]);
      }
    }

    const rpcName =
      kind === 'pos' ? 'generate_custom_pos_number' : 'generate_custom_sale_number';

    const { data, error } = await supabase.rpc(rpcName as any, {
      p_organization_id: currentOrganization!.id,
      p_format: correctedFormat,
      p_year: year,
      p_month: month,
      p_min_sequence: minSequence,
    } as any);

    if (error) throw error;
    return data as string;
  };

  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

  const getExchangeAmounts = (saleData: SaleData, refundAmt: number) => {
    const saleReturnTotal = roundMoney(saleData.saleReturnAdjust || 0);
    const billAmount = Math.max(0, roundMoney((saleData.netAmount || 0) + saleReturnTotal));
    const isExchangeRefund = saleReturnTotal > 0 && (saleData.netAmount || 0) <= 0 && billAmount > 0;
    const refundDue = isExchangeRefund ? Math.max(0, roundMoney(saleReturnTotal - billAmount)) : 0;
    const cashRefund = Math.min(Math.max(0, roundMoney(refundAmt || 0)), refundDue);
    const roundOffRemainder = Math.max(0, roundMoney(refundDue - cashRefund));

    return { isExchangeRefund, billAmount, cashRefund, roundOffRemainder };
  };

  const writeExchangePaymentVouchers = async (params: {
    saleNumber: string;
    customerId: string;
    txnDate: string;
    cashRefund: number;
    roundOffRemainder: number;
  }) => {
    const writePaymentVoucher = async (
      amount: number,
      method: 'cash' | 'round_off',
      description: string
    ) => {
      if (amount <= 0 || !currentOrganization?.id) return;
      const { data: voucherNumber, error: numberError } = await supabase.rpc('generate_voucher_number' as any, {
        p_type: 'payment',
        p_date: params.txnDate,
      } as any);
      if (numberError) throw numberError;

      const { error } = await supabase.from('voucher_entries').insert({
        organization_id: currentOrganization.id,
        voucher_number: voucherNumber as string,
        voucher_type: 'payment',
        voucher_date: params.txnDate,
        reference_type: 'customer',
        reference_id: params.customerId,
        description,
        total_amount: amount,
        payment_method: method,
      } as any);
      if (error) throw error;

      await insertLedgerDebit({
        organizationId: currentOrganization.id,
        customerId: params.customerId,
        voucherType: 'PAYMENT',
        voucherNo: voucherNumber as string,
        particulars: description,
        transactionDate: params.txnDate,
        amount,
      });
    };

    await writePaymentVoucher(params.cashRefund, 'cash', `Refund paid for POS exchange ${params.saleNumber}`);
    await writePaymentVoucher(params.roundOffRemainder, 'round_off', `Round off adjustment for POS exchange ${params.saleNumber}`);
  };

  const saveSale = async (
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    },
    saleType: 'pos' | 'sale_invoice' = 'pos'
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to save sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    // Safety net: reject items with 0 or negative quantity
    const invalidItems = saleData.items.filter(item => !item.quantity || item.quantity <= 0);
    if (invalidItems.length > 0) {
      savingLockRef.current = false;
      toast({
        title: "Invalid Quantity",
        description: `Cannot save: ${invalidItems.length} item(s) have zero or invalid quantity`,
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot save sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Read cached settings (no extra round-trip)
      let saleNumber: string;
      const saleSettings = (orgSettings as any)?.sale_settings as Record<string, any> | null;
      
      // Use POS format for POS sales, Invoice format for regular sales
      if (saleType === 'pos') {
        // Check for custom POS format first
        if (saleSettings?.pos_numbering_format) {
          saleNumber = await generateInvoiceNumber(saleSettings.pos_numbering_format, saleSettings?.pos_series_start, 'pos');
        } else if (saleSettings?.pos_series_start) {
          // No custom format but has series start — use it as literal format
          saleNumber = await generateInvoiceNumber(saleSettings.pos_series_start, saleSettings.pos_series_start, 'pos');
        } else {
          // Use default POS format: POS/YY-YY/N
          const { data: defaultNumber, error: numberError } = await supabase
            .rpc('generate_pos_number_atomic', { p_organization_id: currentOrganization.id });
          if (numberError) throw numberError;
          saleNumber = defaultNumber;
        }
      } else {
        // Sale Invoice format
        if (saleSettings?.invoice_numbering_format) {
          saleNumber = await generateInvoiceNumber(saleSettings.invoice_numbering_format, saleSettings?.invoice_series_start);
        } else if (saleSettings?.invoice_series_start) {
          saleNumber = await generateInvoiceNumber(saleSettings.invoice_series_start, saleSettings.invoice_series_start);
        } else {
          // Use default INV format: INV/YY-YY/N
          const { data: defaultNumber, error: numberError } = await supabase
            .rpc('generate_sale_number_atomic', { p_organization_id: currentOrganization.id });
          if (numberError) throw numberError;
          saleNumber = defaultNumber;
        }
      }

      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        // Mix payment or refund
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        
        // Use 'multiple' as payment method for refunds or mixed payments
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        // Single payment method
        paidAmt = paymentMethod === 'pay_later' ? 0 : saleData.netAmount;
        payStatus = paymentMethod === 'pay_later' ? 'pending' : 'completed';
        
        if (paymentMethod === 'cash') {
          cashAmt = saleData.netAmount;
        } else if (paymentMethod === 'card') {
          cardAmt = saleData.netAmount;
        } else if (paymentMethod === 'upi') {
          upiAmt = saleData.netAmount;
        }
      }

      // Store refund amount from saleData if provided
      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // ── POS Exchange Fix ────────────────────────────────────────────────
      // When a Sale Return is applied to a new bill and SR > items value,
      // the bill is fully covered by the SR (no money received from customer).
      // Treat paid_amount as the items value so the sale row balances cleanly,
      // and do NOT write a RECEIPT — the SR credit is already in the ledger.
      // The cash refund (if any) and round-off remainder are written below as
      // PAYMENT vouchers (debits) which exactly cancel out the SR credit.
      const isExchangeRefund =
        (saleData.saleReturnAdjust || 0) > 0 &&
        saleData.netAmount < (saleData.saleReturnAdjust || 0);
      const itemsValueForExchange = isExchangeRefund
        ? Math.max(0, Math.round((saleData.netAmount + (saleData.saleReturnAdjust || 0)) * 100) / 100)
        : 0;
      if (isExchangeRefund) {
        paidAmt = itemsValueForExchange;
        payStatus = 'completed';
      }

      // Insert sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: saleType,
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          points_redeemed_amount: saleData.pointsRedeemedAmount || 0,
          salesman: saleData.salesman || null,
          notes: saleData.notes || null,
          created_by: user.id,
          organization_id: currentOrganization.id,
          shop_name: shopName || null,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items with proportional bill discount + round-off distribution
      const subTotal = saleData.grossAmount;
      const flatDiscount = saleData.flatDiscountAmount || 0;
      const roundOffAmount = saleData.roundOff || 0;
      const saleItems = saleData.items.map((item) => {
        const itemGross = item.netAmount; // line_total (unit_price * qty after line discount)
        const discountShare = subTotal > 0 ? (itemGross / subTotal) * flatDiscount : 0;
        const roundOffShare = subTotal > 0 ? (itemGross / subTotal) * roundOffAmount : 0;
        const netAfterDiscount = itemGross - discountShare + roundOffShare;
        const perQtyNetAmount = item.quantity > 0 ? netAfterDiscount / item.quantity : 0;
        return {
          sale_id: sale.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.unitCost,
          mrp: item.mrp,
          gst_percent: item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
          is_dc_item: (item as any).isDcProduct === true,
        };
      });

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Customer Account Statement — write double-entry ledger (fire-and-forget)
      if (saleData.customerId) {
        const txnDate = new Date().toISOString().slice(0, 10);
        // For exchange-with-refund, debit the items value (positive) — the SR
        // credit (already written when SR was created) will offset it. For
        // normal sales, debit the net amount.
        const saleDebitAmount = isExchangeRefund ? itemsValueForExchange : saleData.netAmount;
        if (saleDebitAmount > 0) {
          insertLedgerDebit({
            organizationId: currentOrganization.id,
            customerId: saleData.customerId,
            voucherType: 'SALE',
            voucherNo: saleNumber,
            particulars: `Sales Invoice ${saleNumber}`,
            transactionDate: txnDate,
            amount: saleDebitAmount,
          });
        }
        // Only write a RECEIPT credit for actual cash received (not exchange).
        if (!isExchangeRefund && paidAmt > 0) {
          insertLedgerCredit({
            organizationId: currentOrganization.id,
            customerId: saleData.customerId,
            voucherType: 'RECEIPT',
            voucherNo: saleNumber,
            particulars: `Payment at Sale ${saleNumber}`,
            transactionDate: txnDate,
            amount: paidAmt,
          });
        }
      }

      // ── POS Exchange Fix — write PAYMENT vouchers for refund + round-off ──
      // The SR credit (e.g. ₹1990) is already in the customer ledger. The new
      // sale debit (e.g. ₹1599) covers part of it. The remaining ₹391 is paid
      // back to the customer as: (a) cash refund (e.g. ₹300) and (b) any
      // un-refunded remainder treated as a round-off write-off (e.g. ₹91).
      if (isExchangeRefund && saleData.customerId) {
        try {
          const txnDate = new Date().toISOString().slice(0, 10);
          const cashRefund = Math.max(0, Math.round((refundAmt || 0) * 100) / 100);
          const totalToReturn = Math.max(
            0,
            Math.round(((saleData.saleReturnAdjust || 0) - itemsValueForExchange) * 100) / 100
          );
          const roundOffRemainder = Math.max(
            0,
            Math.round((totalToReturn - cashRefund) * 100) / 100
          );

          const writePaymentVoucher = async (
            amount: number,
            method: 'cash' | 'round_off',
            description: string
          ) => {
            if (amount <= 0) return;
            const { data: lastV } = await supabase
              .from('voucher_entries')
              .select('voucher_number')
              .eq('organization_id', currentOrganization.id)
              .eq('voucher_type', 'payment')
              .order('created_at', { ascending: false })
              .limit(1);
            const lastNum =
              (lastV as any)?.[0]?.voucher_number?.match(/\d+$/)?.[0] || '0';
            const voucherNumber = `PAY-${String(parseInt(lastNum) + 1).padStart(5, '0')}`;
            await supabase.from('voucher_entries').insert({
              organization_id: currentOrganization.id,
              voucher_number: voucherNumber,
              voucher_type: 'payment',
              voucher_date: txnDate,
              reference_type: 'customer',
              reference_id: saleData.customerId,
              description,
              total_amount: amount,
              payment_method: method,
            } as any);
            // Mirror as PAYMENT debit in customer_ledger_entries so the
            // Customer Account Statement balances cleanly.
            insertLedgerDebit({
              organizationId: currentOrganization.id,
              customerId: saleData.customerId!,
              voucherType: 'PAYMENT',
              voucherNo: voucherNumber,
              particulars: description,
              transactionDate: txnDate,
              amount,
            });
          };

          await writePaymentVoucher(
            cashRefund,
            'cash',
            `Refund paid for POS exchange ${saleNumber}`
          );
          await writePaymentVoucher(
            roundOffRemainder,
            'round_off',
            `Round off adjustment for POS exchange ${saleNumber}`
          );
        } catch (exErr) {
          console.error('Exchange refund voucher write failed:', exErr);
        }
      }

      // Mark consumed sale_return(s) as adjusted and link to this sale.
      // When sale_return_adjust > 0, FIFO-consume pending SRs for this customer
      // so the customer balance formula recognizes them as already absorbed
      // into this sale's net_amount (prevents double-counting credit).
      if (saleData.saleReturnAdjust > 0 && saleData.customerId) {
        try {
          const { data: pendingSRs } = await supabase
            .from('sale_returns')
            .select('id, net_amount, credit_status, linked_sale_id')
            .eq('customer_id', saleData.customerId)
            .eq('organization_id', currentOrganization.id)
            .or('credit_status.eq.pending,and(credit_status.eq.adjusted,linked_sale_id.is.null)')
            .is('deleted_at', null)
            .order('return_date', { ascending: true });

          let remaining = saleData.saleReturnAdjust;
          for (const sr of (pendingSRs || [])) {
            if (remaining <= 0) break;
            const srAmt = Number(sr.net_amount) || 0;
            if (remaining >= srAmt - 1) {
              await supabase
                .from('sale_returns')
                .update({
                  credit_status: 'adjusted',
                  linked_sale_id: sale.id,
                })
                .eq('id', sr.id);
              remaining -= srAmt;
            } else {
              console.warn(`Partial SR consumption not supported for SR ${sr.id}`);
              break;
            }
          }
        } catch (srErr) {
          console.error('Failed to mark SR as adjusted:', srErr);
        }
      }

      // Award loyalty points if enabled and customer exists
      let pointsAwarded = 0;
      if (isPointsEnabled && saleData.customerId && paymentMethod !== 'pay_later') {
        const result = await awardPoints(
          saleData.customerId,
          sale.id,
          saleData.netAmount,
          saleNumber
        );
        pointsAwarded = result.pointsAwarded;
      }

      // Auto-send WhatsApp invoice notification - FIRE AND FORGET (non-blocking)
      // This runs in the background so it doesn't delay the print dialog
      if (saleData.customerPhone && currentOrganization?.id) {
        const whatsAppPromise = (async () => { try {
          // Check WhatsApp settings
          const { data: whatsappSettings } = await supabase
            .from('whatsapp_api_settings')
            .select('is_active, auto_send_invoice, invoice_template_name, auto_send_invoice_link, invoice_link_message, social_links, send_invoice_pdf, invoice_pdf_template, use_document_header_template, invoice_document_template_name, pdf_min_amount')
            .eq('organization_id', currentOrganization.id)
            .maybeSingle();

          if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
            // Read cached org settings (centralized)
            const companySettings = orgSettings as any;
            const logoUrl = (companySettings?.bill_barcode_settings as Record<string, any> | null)?.logo_url as string | undefined;
            const companyName = companySettings?.business_name || currentOrganization.name || 'Our Company';
            
            // Build invoice message for template parameters
            const formattedDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
            const formattedAmount = `${Number(saleData.netAmount).toLocaleString('en-IN')}`;

            // Build message text (used as fallback if no template)
            const messageText = `Hello ${saleData.customerName},\n\nYour invoice ${saleNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\n\nThank you for your business!\n${companyName}`;

            // Build saleData object for dynamic parameter building in edge function
            const saleDataForWhatsApp = {
              sale_id: sale.id,
              org_slug: currentOrganization.slug,
              customer_name: saleData.customerName,
              sale_number: saleNumber,
              sale_date: sale.sale_date,
              net_amount: saleData.netAmount,
              gross_amount: saleData.grossAmount,
              discount_amount: saleData.discountAmount,
              payment_status: sale.payment_status,
              items_count: saleData.items.reduce((sum, item) => sum + item.quantity, 0),
              salesman: saleData.salesman,
              organization_name: companyName,
              pos_bill_format: (saleSettings as any)?.pos_bill_format || '',
              // Include social links from settings
              website: (whatsappSettings.social_links as Record<string, string> | null)?.website || '',
              instagram: (whatsappSettings.social_links as Record<string, string> | null)?.instagram || '',
              facebook: (whatsappSettings.social_links as Record<string, string> | null)?.facebook || '',
              google_review_link: (whatsappSettings.social_links as Record<string, string> | null)?.google_review || '',
            };

            // ============================================
            // FLOW A: Utility/Text Template (TEXT or NONE header)
            // Always send when a utility template is configured
            // This template MUST have TEXT or NONE header type
            // ============================================
            const hasUtilityTemplate = !!whatsappSettings.invoice_template_name;

            if (hasUtilityTemplate) {
              try {
                await supabase.functions.invoke('send-whatsapp', {
                  body: {
                    organizationId: currentOrganization.id,
                    phone: saleData.customerPhone,
                    message: messageText,
                    templateType: 'sales_invoice',
                    templateName: whatsappSettings.invoice_template_name,
                    saleData: saleDataForWhatsApp,
                    referenceId: sale.id,
                    referenceType: 'sale',
                    // Flow A: No PDF attachment
                    documentUrl: undefined,
                    documentFilename: undefined,
                    documentCaption: undefined,
                    useDocumentHeaderTemplate: false,
                    documentHeaderTemplateName: null,
                    pdfBlob: null,
                    imageUrl: logoUrl,
                    imageCaption: logoUrl ? companyName : undefined,
                  }
                });
              } catch (flowAError) {
                // Log Flow A failure but continue to Flow B if enabled
                console.error('WhatsApp Flow A (utility template) failed:', flowAError);
              }
            }

            // ============================================
            // FLOW B: Document Header Template with PDF
            // Only if "Direct PDF Delivery" is enabled AND document template is set
            // This uses DOCUMENT header template (bypasses 24h window)
            // ============================================
            const shouldSendPdfFlow = whatsappSettings.use_document_header_template && 
              !!whatsappSettings.invoice_document_template_name &&
              (saleData.netAmount ?? 0) >= (whatsappSettings.pdf_min_amount ?? 0);

            if (shouldSendPdfFlow) {
              try {
                // Calculate tax amount for PDF
                const taxAmount = saleData.items.reduce((sum, item) => {
                  const taxableAmount = item.netAmount / (1 + item.gstPer / 100);
                  return sum + (item.netAmount - taxableAmount);
                }, 0);

                const pdfData: InvoicePdfData = {
                  billNo: saleNumber,
                  billDate: new Date(sale.sale_date || sale.created_at || Date.now()),
                  customerName: saleData.customerName,
                  customerPhone: saleData.customerPhone || undefined,
                  items: saleData.items.map(item => ({
                    particulars: item.productName,
                    size: item.size,
                    quantity: item.quantity,
                    rate: item.unitCost,
                    mrp: item.mrp,
                    discount: item.discountPercent,
                    gstPercent: item.gstPer,
                    total: item.netAmount,
                    hsnCode: item.hsnCode,
                    color: item.color,
                  })),
                  grossAmount: saleData.grossAmount,
                  discountAmount: saleData.discountAmount,
                  taxAmount: taxAmount,
                  netAmount: saleData.netAmount,
                  paymentMethod: finalPaymentMethod,
                  paidAmount: paidAmt,
                  companyName: companyName,
                  companyAddress: companySettings?.address || undefined,
                  companyPhone: companySettings?.mobile_number || undefined,
                  companyGst: companySettings?.gst_number || undefined,
                };

                const documentFilename = `Invoice_${saleNumber.replace(/\//g, '-')}.pdf`;
                
                // Generate base64 PDF for Meta upload
                const pdfBase64 = generateInvoicePdfBase64(pdfData);

                if (pdfBase64) {
                  await supabase.functions.invoke('send-whatsapp', {
                    body: {
                      organizationId: currentOrganization.id,
                      phone: saleData.customerPhone,
                      message: `Invoice ${saleNumber} PDF attached`,
                      templateType: 'sales_invoice_pdf',
                      templateName: null, // Don't use regular template for PDF flow
                      saleData: saleDataForWhatsApp,
                      referenceId: sale.id,
                      referenceType: 'sale',
                      // Flow B: PDF embedded in document header template
                      useDocumentHeaderTemplate: true,
                      documentHeaderTemplateName: whatsappSettings.invoice_document_template_name,
                      pdfBlob: pdfBase64,
                      documentFilename: documentFilename,
                      imageUrl: logoUrl,
                      imageCaption: logoUrl ? companyName : undefined,
                    }
                  });
                }
              } catch (flowBError) {
                // Flow B failure should NOT block the sale
                console.error('WhatsApp Flow B (PDF delivery) failed:', flowBError);
              }
            }
          }
        } catch (whatsappError) {
          // Don't fail the sale if WhatsApp notification fails
          console.error('WhatsApp auto-send failed:', whatsappError);
        }
        })();
        // Fire and forget - don't await
      }

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      // Auto-generate E-Invoice for B2B sales (fire and forget)
      if (currentOrganization?.id && saleData.customerId) {
        (async () => {
          try {
            const einvoiceSettings = (saleSettings as any)?.einvoice_settings;
            if (!einvoiceSettings?.enabled || !einvoiceSettings?.auto_generate) return;

            // Check if customer has GSTIN
            const { data: customer } = await supabase
              .from('customers')
              .select('gst_number')
              .eq('id', saleData.customerId!)
              .maybeSingle();

            if (!customer?.gst_number) return;

            const testMode = einvoiceSettings?.test_mode ?? true;
            await supabase.functions.invoke('generate-einvoice', {
              body: {
                saleId: sale.id,
                organizationId: currentOrganization.id,
                testMode,
              },
            });
            console.log('Auto e-Invoice generation triggered for', saleNumber);
          } catch (err) {
            console.error('Auto e-Invoice generation failed (non-blocking):', err);
          }
        })();
      }

      return { ...sale, pointsAwarded };
    } catch (error: any) {
      console.error('Error saving sale:', error);
      const isDuplicate = error?.code === '23505' || 
                          error?.message?.includes('duplicate key');
      toast({
        title: isDuplicate ? "Bill number conflict" : "Error saving sale",
        description: isDuplicate 
          ? "Another user saved a bill at the same time. Please try again."
          : error.message || "An error occurred while saving the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Update an existing sale (for edit mode)
  // Stock is automatically handled by database triggers when sale_items are deleted/inserted
  const updateSale = async (
    saleId: string,
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    }
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to update sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot save sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Fetch current paid_amount to preserve partial payments during edit
      const { data: existingSale } = await supabase
        .from('sales')
        .select('paid_amount, payment_status, sale_return_adjust')
        .eq('id', saleId)
        .single();
      const existingPaidAmount = existingSale?.paid_amount || 0;

      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        if (paymentMethod === 'pay_later') {
          // Pay later: preserve existing paid amount (could be partial payment received later)
          paidAmt = existingPaidAmount;
          payStatus = paidAmt >= saleData.netAmount ? 'completed' : paidAmt > 0 ? 'partial' : 'pending';
        } else {
          // Full payment method (cash/card/upi): only set to full if it was already completed
          // or if no prior payment existed
          if (existingPaidAmount === 0 || existingSale?.payment_status === 'completed') {
            paidAmt = saleData.netAmount;
            payStatus = 'completed';
          } else {
            // Preserve existing partial payment
            paidAmt = existingPaidAmount;
            payStatus = paidAmt >= saleData.netAmount ? 'completed' : 'partial';
          }

          if (paymentMethod === 'cash') cashAmt = paidAmt;
          else if (paymentMethod === 'card') cardAmt = paidAmt;
          else if (paymentMethod === 'upi') upiAmt = paidAmt;
        }
      }

      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // Step 1: Delete existing sale_items (triggers stock restoration via handle_sale_item_delete)
      const { error: deleteError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', saleId);

      if (deleteError) throw deleteError;

      // Step 2: Insert new sale_items with proportional bill discount + round-off distribution
      const subTotal = saleData.grossAmount;
      const flatDiscount = saleData.flatDiscountAmount || 0;
      const roundOffAmount = saleData.roundOff || 0;
      const saleItems = saleData.items.map((item) => {
        const itemGross = item.netAmount;
        const discountShare = subTotal > 0 ? (itemGross / subTotal) * flatDiscount : 0;
        const roundOffShare = subTotal > 0 ? (itemGross / subTotal) * roundOffAmount : 0;
        const netAfterDiscount = itemGross - discountShare + roundOffShare;
        const perQtyNetAmount = item.quantity > 0 ? netAfterDiscount / item.quantity : 0;
        return {
          sale_id: saleId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.unitCost,
          mrp: item.mrp,
          gst_percent: item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
        };
      });

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Step 3: Update the sales record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .update({
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          points_redeemed_amount: saleData.pointsRedeemedAmount || 0,
          salesman: saleData.salesman || null,
          notes: saleData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', saleId)
        .select()
        .single();

      if (saleError) throw saleError;

      // Customer Account Statement — refresh ledger entries (delete + re-insert)
      if (sale?.sale_number && currentOrganization?.id) {
        await deleteLedgerEntries({
          organizationId: currentOrganization.id,
          voucherNo: sale.sale_number,
          voucherTypes: ['SALE', 'RECEIPT'],
        });
        if (saleData.customerId) {
          const txnDate = new Date().toISOString().slice(0, 10);
          insertLedgerDebit({
            organizationId: currentOrganization.id,
            customerId: saleData.customerId,
            voucherType: 'SALE',
            voucherNo: sale.sale_number,
            particulars: `Sales Invoice ${sale.sale_number}`,
            transactionDate: txnDate,
            amount: saleData.netAmount,
          });
          if (paidAmt > 0) {
            insertLedgerCredit({
              organizationId: currentOrganization.id,
              customerId: saleData.customerId,
              voucherType: 'RECEIPT',
              voucherNo: sale.sale_number,
              particulars: `Payment at Sale ${sale.sale_number}`,
              transactionDate: txnDate,
              amount: paidAmt,
            });
          }
        }
      }

      if (saleData.saleReturnAdjust > 0 && saleData.customerId) {
        try {
          const { data: pendingSRs } = await supabase
            .from('sale_returns')
            .select('id, net_amount, credit_status, linked_sale_id')
            .eq('customer_id', saleData.customerId)
            .eq('organization_id', currentOrganization.id)
            .or(`credit_status.eq.pending,and(credit_status.eq.adjusted,linked_sale_id.is.null),and(credit_status.eq.adjusted,linked_sale_id.eq.${sale.id})`)
            .is('deleted_at', null)
            .order('return_date', { ascending: true });

          let remaining = saleData.saleReturnAdjust;
          for (const sr of (pendingSRs || [])) {
            if (remaining <= 0) break;
            const srAmt = Number(sr.net_amount) || 0;
            // Skip already-linked-to-this-sale rows in remaining count
            if (sr.linked_sale_id === sale.id && sr.credit_status === 'adjusted') {
              remaining -= srAmt;
              continue;
            }
            if (remaining >= srAmt - 1) {
              await supabase
                .from('sale_returns')
                .update({
                  credit_status: 'adjusted',
                  linked_sale_id: sale.id,
                })
                .eq('id', sr.id);
              remaining -= srAmt;
            } else {
              console.warn(`Partial SR consumption not supported for SR ${sr.id}`);
              break;
            }
          }
        } catch (srErr) {
          console.error('Failed to mark SR as adjusted:', srErr);
        }
      }

      toast({
        title: "Sale updated successfully",
        description: `Sale ${sale.sale_number} has been updated`,
      });

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      return sale;
    } catch (error: any) {
      console.error('Error updating sale:', error);
      toast({
        title: "Error updating sale",
        description: error.message || "An error occurred while updating the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Hold a sale (save without affecting stock - items stored in notes as JSON)
  const holdSale = async (saleData: SaleData) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to hold sales",
        variant: "destructive",
      });
      return null;
    }

    if (!currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive",
      });
      return null;
    }

    if (saleData.items.length === 0) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "Cannot hold sale with no items",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Generate Hold series number: Hold/YY-YY/N
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fyStr = `${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}`;
      const holdPrefix = `Hold/${fyStr}/`;

      // Find the last hold number in this FY
      const { data: lastHold } = await supabase
        .from('sales')
        .select('sale_number')
        .eq('organization_id', currentOrganization.id)
        .eq('payment_status', 'hold')
        .is('deleted_at', null)
        .like('sale_number', `${holdPrefix}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let holdSeq = 1;
      if (lastHold?.sale_number) {
        const seqMatch = lastHold.sale_number.match(/(\d+)$/);
        if (seqMatch) holdSeq = parseInt(seqMatch[1]) + 1;
      }
      const saleNumber = `${holdPrefix}${holdSeq}`;

      // Store items as JSON in dedicated held_cart_data column (notes preserved for real customer notes)
      const holdData = {
        items: saleData.items,
        flatDiscountPercent: saleData.flatDiscountPercent,
        saleReturnAdjust: saleData.saleReturnAdjust,
        roundOff: saleData.roundOff,
      };

      // Insert sale record with hold status (NO sale_items - no stock impact)
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: 'pos',
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: 'pay_later',
          payment_status: 'hold',
          paid_amount: 0,
          cash_amount: 0,
          card_amount: 0,
          upi_amount: 0,
          refund_amount: 0,
          salesman: saleData.salesman || null,
          held_cart_data: holdData as any,
          notes: saleData.notes || null,
          created_by: user.id,
          organization_id: currentOrganization.id,
          shop_name: shopName || null,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      toast({
        title: "Bill on Hold",
        description: `Bill ${saleNumber} has been put on hold`,
      });

      return sale;
    } catch (error: any) {
      console.error('Error holding sale:', error);
      const isDuplicate = error?.code === '23505' || 
                          error?.message?.includes('duplicate key');
      toast({
        title: isDuplicate ? "Bill number conflict" : "Error holding sale",
        description: isDuplicate 
          ? "Another user saved a bill at the same time. Please try again."
          : error.message || "An error occurred while holding the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  // Resume a held sale - convert to actual sale with stock deduction
  const resumeHeldSale = async (
    heldSaleId: string,
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      totalPaid: number;
      refundAmount: number;
    }
  ) => {
    // Synchronous lock check - prevents duplicate saves from rapid clicks/keyboard
    if (savingLockRef.current) {
      return null;
    }
    savingLockRef.current = true;

    if (!user || !currentOrganization?.id) {
      savingLockRef.current = false;
      toast({
        title: "Error",
        description: "You must be logged in to complete sales",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      // Generate a NEW running POS number for the resumed sale (cached settings)
      const saleSettings = (orgSettings as any)?.sale_settings as Record<string, any> | null;
      let newSaleNumber: string;

      if (saleSettings?.pos_numbering_format) {
        newSaleNumber = await generateInvoiceNumber(saleSettings.pos_numbering_format, saleSettings?.pos_series_start, 'pos');
      } else if (saleSettings?.pos_series_start) {
        newSaleNumber = await generateInvoiceNumber(saleSettings.pos_series_start, saleSettings.pos_series_start, 'pos');
      } else {
        const { data: defaultNumber, error: numberError } = await supabase
          .rpc('generate_pos_number_atomic', { p_organization_id: currentOrganization.id });
        if (numberError) throw numberError;
        newSaleNumber = defaultNumber;
      }

      // Calculate payment status and amounts
      let cashAmt = 0;
      let cardAmt = 0;
      let upiAmt = 0;
      let paidAmt = 0;
      let refundAmt = 0;
      let payStatus = 'completed';
      let finalPaymentMethod = paymentMethod;

      if (paymentBreakdown) {
        cashAmt = paymentBreakdown.cashAmount;
        cardAmt = paymentBreakdown.cardAmount;
        upiAmt = paymentBreakdown.upiAmount;
        paidAmt = paymentBreakdown.totalPaid;
        refundAmt = paymentBreakdown.refundAmount;
        finalPaymentMethod = 'multiple';
        
        if (paidAmt >= saleData.netAmount) {
          payStatus = 'completed';
        } else if (paidAmt > 0) {
          payStatus = 'partial';
        } else {
          payStatus = 'pending';
        }
      } else {
        paidAmt = paymentMethod === 'pay_later' ? 0 : saleData.netAmount;
        payStatus = paymentMethod === 'pay_later' ? 'pending' : 'completed';
        
        if (paymentMethod === 'cash') {
          cashAmt = saleData.netAmount;
        } else if (paymentMethod === 'card') {
          cardAmt = saleData.netAmount;
        } else if (paymentMethod === 'upi') {
          upiAmt = saleData.netAmount;
        }
      }

      if (saleData.refundAmount) {
        refundAmt = saleData.refundAmount;
      }

      // Insert sale items with proportional bill discount + round-off distribution (NOW affects stock via triggers)
      const subTotal = saleData.grossAmount;
      const flatDiscount = saleData.flatDiscountAmount || 0;
      const roundOffAmount = saleData.roundOff || 0;
      const saleItems = saleData.items.map((item) => {
        const itemGross = item.netAmount;
        const discountShare = subTotal > 0 ? (itemGross / subTotal) * flatDiscount : 0;
        const roundOffShare = subTotal > 0 ? (itemGross / subTotal) * roundOffAmount : 0;
        const netAfterDiscount = itemGross - discountShare + roundOffShare;
        const perQtyNetAmount = item.quantity > 0 ? netAfterDiscount / item.quantity : 0;
        return {
          sale_id: heldSaleId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.unitCost,
          mrp: item.mrp,
          gst_percent: item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
        };
      });

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update the held sale: assign NEW POS number + current date + completed status
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .update({
          sale_number: newSaleNumber,
          sale_date: new Date().toISOString(),
          customer_id: saleData.customerId || null,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone || null,
          gross_amount: saleData.grossAmount,
          discount_amount: saleData.discountAmount,
          flat_discount_percent: saleData.flatDiscountPercent,
          flat_discount_amount: saleData.flatDiscountAmount,
          sale_return_adjust: saleData.saleReturnAdjust,
          round_off: saleData.roundOff,
          net_amount: saleData.netAmount,
          payment_method: finalPaymentMethod,
          payment_status: payStatus,
          paid_amount: paidAmt,
          cash_amount: cashAmt,
          card_amount: cardAmt,
          upi_amount: upiAmt,
          refund_amount: refundAmt,
          salesman: saleData.salesman || null,
          notes: saleData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', heldSaleId)
        .select()
        .single();

      if (saleError) throw saleError;

      // Mark consumed sale_return(s) as adjusted and link to this sale (resume-held path)
      if (saleData.saleReturnAdjust > 0 && saleData.customerId) {
        try {
          const { data: pendingSRs } = await supabase
            .from('sale_returns')
            .select('id, net_amount, credit_status, linked_sale_id')
            .eq('customer_id', saleData.customerId)
            .eq('organization_id', currentOrganization.id)
            .or('credit_status.eq.pending,and(credit_status.eq.adjusted,linked_sale_id.is.null)')
            .is('deleted_at', null)
            .order('return_date', { ascending: true });

          let remaining = saleData.saleReturnAdjust;
          for (const sr of (pendingSRs || [])) {
            if (remaining <= 0) break;
            const srAmt = Number(sr.net_amount) || 0;
            if (remaining >= srAmt - 1) {
              await supabase
                .from('sale_returns')
                .update({
                  credit_status: 'adjusted',
                  linked_sale_id: sale.id,
                })
                .eq('id', sr.id);
              remaining -= srAmt;
            } else {
              console.warn(`Partial SR consumption not supported for SR ${sr.id}`);
              break;
            }
          }
        } catch (srErr) {
          console.error('Failed to mark SR as adjusted:', srErr);
        }
      }

      toast({
        title: "Sale completed",
        description: `Sale ${sale.sale_number} has been completed`,
      });

      // Invalidate dashboard queries for immediate UI refresh
      invalidateSales();

      return sale;
    } catch (error: any) {
      console.error('Error resuming held sale:', error);
      toast({
        title: "Error completing sale",
        description: error.message || "An error occurred while completing the sale",
        variant: "destructive",
      });
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  return { saveSale, updateSale, holdSale, resumeHeldSale, isSaving };
};
