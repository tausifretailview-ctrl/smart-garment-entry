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
import { deleteJournalEntryByReference, recordSaleJournalEntry } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

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
  const accountingEngineOn = isAccountingEngineEnabled(orgSettings as { accounting_engine_enabled?: boolean } | null);

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

  const consumeSaleReturnAdjustments = async (params: {
    customerId: string;
    saleId: string;
    adjustmentAmount: number;
  }) => {
    if (!currentOrganization?.id || !params.customerId || params.adjustmentAmount <= 0) return;

    const { data: pendingSRs } = await supabase
      .from('sale_returns')
      .select('id, net_amount, gross_amount, gst_amount, credit_status, linked_sale_id, customer_id, customer_name, organization_id, refund_type, return_date, return_number, original_sale_number, notes, credit_note_id')
      .eq('customer_id', params.customerId)
      .eq('organization_id', currentOrganization.id)
      .or('credit_status.eq.pending,and(credit_status.eq.adjusted,linked_sale_id.is.null)')
      .is('deleted_at', null)
      .order('return_date', { ascending: true });

    const targetAmount = roundMoney(params.adjustmentAmount);
    const sortedSRs = [...(pendingSRs || [])].sort((a: any, b: any) => {
      const aAmt = roundMoney(Number(a.net_amount) || 0);
      const bAmt = roundMoney(Number(b.net_amount) || 0);
      const aExact = Math.abs(aAmt - targetAmount) < 0.01 ? 1 : 0;
      const bExact = Math.abs(bAmt - targetAmount) < 0.01 ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return 0;
    });

    let remaining = targetAmount;
    for (const sr of sortedSRs) {
      if (remaining <= 0) break;
      const srAmt = roundMoney(Number(sr.net_amount) || 0);
      if (srAmt <= 0) continue;

      // Full consume
      if (remaining >= srAmt - 0.01) {
        await supabase
          .from('sale_returns')
          .update({
            credit_status: 'adjusted',
            linked_sale_id: params.saleId,
          })
          .eq('id', sr.id);
        remaining = roundMoney(remaining - srAmt);
        continue;
      }

      // Mamta/Vasim reconciliation: allow partial consume by splitting row.
      const consumeAmt = roundMoney(remaining);
      const leftoverAmt = roundMoney(srAmt - consumeAmt);
      const srGross = roundMoney(Number(sr.gross_amount) || srAmt);
      const srGst = roundMoney(Number(sr.gst_amount) || 0);
      const ratio = srAmt > 0 ? consumeAmt / srAmt : 0;
      const consumedGross = roundMoney(srGross * ratio);
      const consumedGst = roundMoney(srGst * ratio);
      const leftoverGross = roundMoney(srGross - consumedGross);
      const leftoverGst = roundMoney(srGst - consumedGst);

      await supabase
        .from('sale_returns')
        .update({
          net_amount: consumeAmt,
          gross_amount: consumedGross,
          gst_amount: consumedGst,
          credit_status: 'adjusted',
          linked_sale_id: params.saleId,
          notes: `${sr.notes || ''}${sr.notes ? ' | ' : ''}Partially adjusted in POS sale`,
        })
        .eq('id', sr.id);

      if (leftoverAmt > 0.01) {
        await supabase.from('sale_returns').insert({
          organization_id: sr.organization_id,
          customer_id: sr.customer_id,
          customer_name: sr.customer_name,
          refund_type: sr.refund_type || 'credit_note',
          payment_method: (sr as { payment_method?: string | null }).payment_method ?? null,
          return_date: sr.return_date,
          return_number: null,
          original_sale_number: sr.original_sale_number || null,
          credit_note_id: sr.credit_note_id || null,
          credit_status: 'pending',
          linked_sale_id: null,
          gross_amount: leftoverGross,
          gst_amount: leftoverGst,
          net_amount: leftoverAmt,
          notes: `${sr.notes || ''}${sr.notes ? ' | ' : ''}Pending balance after partial POS adjustment`,
        } as any);
      }

      remaining = 0;
      break;
    }
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

      const exchange = getExchangeAmounts(saleData, refundAmt);
      const { isExchangeRefund } = exchange;
      if (isExchangeRefund) {
        // Bill fully settled by Sale Return credit (S/R Adjust).
        // Net amount is the TRUE net (≈0); no actual cash/card/upi was collected.
        // Paid amount equals net so the bill shows as fully settled, not outstanding.
        paidAmt = Math.max(0, saleData.netAmount || 0);
        payStatus = 'completed';
        cashAmt = 0;
        cardAmt = 0;
        upiAmt = 0;
        refundAmt = 0;
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

      // Accounting Phase 1 rollout-safe gate: auto-journal only for enabled orgs
      if (accountingEngineOn) {
        try {
          const saleJournalDate =
            sale.sale_date != null
              ? String(sale.sale_date).slice(0, 10)
              : new Date().toISOString().slice(0, 10);
          await recordSaleJournalEntry(
            sale.id,
            currentOrganization.id,
            Number(saleData.netAmount || 0),
            Number(paidAmt || 0),
            String(finalPaymentMethod || ""),
            supabase,
            saleJournalDate
          );
          await (supabase as any)
            .from("sales")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", sale.id);
        } catch (journalErr) {
          console.error("Auto-journal (sale) failed:", journalErr);
          await (supabase as any)
            .from("sales")
            .update({
              journal_status: "failed",
              journal_error: journalErr instanceof Error ? journalErr.message : "Failed to post journal",
            })
            .eq("id", sale.id);
        }
      }

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
        const saleDebitAmount = isExchangeRefund ? exchange.billAmount : saleData.netAmount;
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

      if (isExchangeRefund && saleData.customerId) {
        try {
          const txnDate = new Date().toISOString().slice(0, 10);
          await writeExchangePaymentVouchers({
            saleNumber,
            customerId: saleData.customerId,
            txnDate,
            cashRefund: exchange.cashRefund,
            roundOffRemainder: exchange.roundOffRemainder,
          });
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
          await consumeSaleReturnAdjustments({
            customerId: saleData.customerId,
            saleId: sale.id,
            adjustmentAmount: saleData.saleReturnAdjust,
          });
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

      const exchange = getExchangeAmounts(saleData, refundAmt);
      const { isExchangeRefund } = exchange;
      if (isExchangeRefund) {
        // Bill fully settled by Sale Return credit (S/R Adjust).
        // Keep net_amount as the TRUE net; no real cash collected.
        paidAmt = Math.max(0, saleData.netAmount || 0);
        payStatus = 'completed';
        cashAmt = 0;
        cardAmt = 0;
        upiAmt = 0;
        refundAmt = 0;
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

      // Accounting Phase 1 rollout-safe gate: auto-journal only for enabled orgs
      if (accountingEngineOn) {
        try {
          await deleteJournalEntryByReference(currentOrganization.id, "Sale", saleId, supabase);
          const saleJournalDate =
            sale.sale_date != null
              ? String(sale.sale_date).slice(0, 10)
              : new Date().toISOString().slice(0, 10);
          await recordSaleJournalEntry(
            sale.id,
            currentOrganization.id,
            Number(saleData.netAmount || 0),
            Number(paidAmt || 0),
            String(finalPaymentMethod || ""),
            supabase,
            saleJournalDate
          );
          await (supabase as any)
            .from("sales")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", sale.id);
        } catch (journalErr) {
          console.error("Auto-journal (sale update) failed:", journalErr);
          await (supabase as any)
            .from("sales")
            .update({
              journal_status: "failed",
              journal_error: journalErr instanceof Error ? journalErr.message : "Failed to post journal",
            })
            .eq("id", sale.id);
        }
      }

      // Customer Account Statement — refresh ledger entries (delete + re-insert)
      if (sale?.sale_number && currentOrganization?.id) {
        await deleteLedgerEntries({
          organizationId: currentOrganization.id,
          voucherNo: sale.sale_number,
          voucherTypes: ['SALE', 'RECEIPT'],
        });
        if (saleData.customerId) {
          const txnDate = new Date().toISOString().slice(0, 10);
          const saleDebitAmount = isExchangeRefund ? exchange.billAmount : saleData.netAmount;
          insertLedgerDebit({
            organizationId: currentOrganization.id,
            customerId: saleData.customerId,
            voucherType: 'SALE',
            voucherNo: sale.sale_number,
            particulars: `Sales Invoice ${sale.sale_number}`,
            transactionDate: txnDate,
            amount: saleDebitAmount,
          });
          if (!isExchangeRefund && paidAmt > 0) {
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

      if (isExchangeRefund && saleData.customerId && sale?.sale_number) {
        try {
          const txnDate = new Date().toISOString().slice(0, 10);
          await (supabase as any)
            .from('voucher_entries')
            .delete()
            .eq('organization_id', currentOrganization.id)
            .eq('voucher_type', 'payment')
            .eq('reference_type', 'customer')
            .eq('reference_id', saleData.customerId)
            .ilike('description', `%POS exchange ${sale.sale_number}%`);
          await (supabase as any)
            .from('customer_ledger_entries')
            .delete()
            .eq('organization_id', currentOrganization.id)
            .eq('customer_id', saleData.customerId)
            .eq('voucher_type', 'PAYMENT')
            .ilike('particulars', `%POS exchange ${sale.sale_number}%`);
          await writeExchangePaymentVouchers({
            saleNumber: sale.sale_number,
            customerId: saleData.customerId,
            txnDate,
            cashRefund: exchange.cashRefund,
            roundOffRemainder: exchange.roundOffRemainder,
          });
        } catch (exErr) {
          console.error('Exchange refund voucher refresh failed:', exErr);
        }
      }

      if (saleData.saleReturnAdjust > 0 && saleData.customerId) {
        try {
          await consumeSaleReturnAdjustments({
            customerId: saleData.customerId,
            saleId: sale.id,
            adjustmentAmount: saleData.saleReturnAdjust,
          });
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
      // Store items as JSON in dedicated held_cart_data column (notes preserved for real customer notes)
      const holdData = {
        items: saleData.items,
        flatDiscountPercent: saleData.flatDiscountPercent,
        saleReturnAdjust: saleData.saleReturnAdjust,
        roundOff: saleData.roundOff,
      };

      const isMissingRpcError = (err: any) =>
        (err?.message || '').toLowerCase().includes('could not find the function') ||
        (err?.message || '').toLowerCase().includes('schema cache');

      const getFallbackHoldNumber = async () => {
        const now = new Date();
        const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fyStr = `${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}`;
        const holdPrefix = `Hold/${fyStr}/`;

        // Read in pages to avoid 1000-row API caps and compute true max sequence.
        let maxSeq = 0;
        const pageSize = 1000;
        let from = 0;

        while (true) {
          const to = from + pageSize - 1;
          const { data: chunk, error } = await supabase
            .from('sales')
            .select('sale_number')
            .eq('organization_id', currentOrganization.id)
            .eq('payment_status', 'hold')
            .like('sale_number', `${holdPrefix}%`)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;
          if (!chunk || chunk.length === 0) break;

          for (const row of chunk) {
            const seqMatch = row.sale_number?.match(/(\d+)$/);
            if (!seqMatch) continue;
            maxSeq = Math.max(maxSeq, parseInt(seqMatch[1], 10));
          }

          if (chunk.length < pageSize) break;
          from += pageSize;
        }

        return `${holdPrefix}${maxSeq + 1}`;
      };

      const buildSaleInsertPayload = (saleNumber: string) => ({
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
      });

      let sale: any = null;
      let lastError: any = null;

      const { data: holdNumber, error: holdNoError } = await supabase
        .rpc('generate_hold_number_atomic' as any, {
          p_organization_id: currentOrganization.id,
        } as any);

      if (!holdNoError && holdNumber) {
        const { data: inserted, error: insertError } = await supabase
          .from('sales')
          .insert(buildSaleInsertPayload(holdNumber))
          .select()
          .single();
        if (insertError) throw insertError;
        sale = inserted;
      } else {
        // Fallback path for envs where migration is not yet applied.
        if (holdNoError && !isMissingRpcError(holdNoError)) throw holdNoError;

        const fallbackBaseNumber = await getFallbackHoldNumber();
        const baseMatch = fallbackBaseNumber.match(/^(.*\/)(\d+)$/);
        const basePrefix = baseMatch?.[1] || '';
        const baseSeq = baseMatch ? parseInt(baseMatch[2], 10) : 1;

        for (let attempt = 0; attempt < 8; attempt++) {
          const fallbackNumber = basePrefix ? `${basePrefix}${baseSeq + attempt}` : fallbackBaseNumber;
          const { data: inserted, error: insertError } = await supabase
            .from('sales')
            .insert(buildSaleInsertPayload(fallbackNumber))
            .select()
            .single();

          if (!insertError) {
            sale = inserted;
            break;
          }

          lastError = insertError;
          const isDuplicate = insertError?.code === '23505' || insertError?.message?.includes('duplicate key');
          if (!isDuplicate) throw insertError;
        }
      }

      if (!sale) throw lastError || new Error('Failed to hold bill');

      toast({
        title: "Bill on Hold",
        description: `Bill ${sale.sale_number} has been put on hold`,
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

      if (accountingEngineOn) {
        try {
          await deleteJournalEntryByReference(currentOrganization.id, "Sale", sale.id, supabase);
          const saleJournalDate =
            sale.sale_date != null
              ? String(sale.sale_date).slice(0, 10)
              : new Date().toISOString().slice(0, 10);
          await recordSaleJournalEntry(
            sale.id,
            currentOrganization.id,
            Number(saleData.netAmount || 0),
            Number(paidAmt || 0),
            String(finalPaymentMethod || ""),
            supabase,
            saleJournalDate
          );
          await (supabase as any)
            .from("sales")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", sale.id);
        } catch (journalErr) {
          console.error("Auto-journal (resume held sale) failed:", journalErr);
          await (supabase as any)
            .from("sales")
            .update({
              journal_status: "failed",
              journal_error: journalErr instanceof Error ? journalErr.message : "Failed to post journal",
            })
            .eq("id", sale.id);
        }
      }

      // Mark consumed sale_return(s) as adjusted and link to this sale (resume-held path)
      if (saleData.saleReturnAdjust > 0 && saleData.customerId) {
        try {
          await consumeSaleReturnAdjustments({
            customerId: saleData.customerId,
            saleId: sale.id,
            adjustmentAmount: saleData.saleReturnAdjust,
          });
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
