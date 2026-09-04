import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { useCustomerPoints } from "@/hooks/useCustomerPoints";
import type { SaveSaleRuntimeOptions, PosWhatsAppPdfCaptureMeta } from "@/utils/saveSaleRuntimeOptions";
import { useShopName } from "@/hooks/useShopName";
import { useSettings } from "@/hooks/useSettings";
import { generateAndUploadInvoicePDF, InvoicePdfData, generateInvoicePdfBase64 } from "@/utils/invoicePdfUploader";
import { uploadWappConnectInvoicePdfFromBase64 } from "@/utils/wappConnectPdfUrl";
import { deleteJournalEntryByReference, postSaleJournalInBackground } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import {
  computeExchangeRefundDue,
  derivePaidAndStatus,
  getAvailableCN,
  normalizeDiscountsAgainstGross,
  normalizeSaleReturnAdjustAgainstBill,
  preSaveInvariants,
  warnSettlementPathMismatch,
} from "@/utils/saleSettlement";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { posTenderDueAfterAdvance } from "@/utils/posApplyAdvance";
import { ensureCreditNoteForSaleReturn } from "@/utils/ensureCreditNoteForSaleReturn";
import { isSaleReturnConsumedAtBilling } from "@/utils/saleReturnCnBalance";
import { allocateMixPaymentToBill } from "@/utils/mixPaymentAllocation";
import { generateOrgSaleNumber } from "@/utils/saleNumber";
import {
  posBillHasExchangeRefundDue,
  shouldPromoteHoldNumberToPos,
} from "@/utils/posHoldBill";
import {
  insertSaleItemsInChunks,
  isStatementTimeoutError,
  saleSaveTimeoutMessage,
} from "@/utils/insertSaleItemsInChunks";
import { invalidateAfterSaleSave } from "@/utils/invalidateDashboardQueries";
import type { PosDashboardSaleSeed } from "@/utils/posDashboardSales";
import { istCalendarYmd, saleDateIsoIst } from "@/lib/localDayBounds";
import { buildSalesInvoiceWhatsAppCaption } from "@/utils/whatsappInvoiceCaption";
import { ensureFreshSupabaseSession, isJwtExpiredError } from "@/lib/jwtRetry";
import {
  resolvePosCustomerName,
  resolveWhatsAppCustomerName,
} from "@/lib/posBilling/buildSaleData";
import { decidePosSaveAutoRollback } from "@/utils/posSaleDeleteGuard";

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
  itemNotes?: string | null;
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
  creditApplied?: number;
  /**
   * Existing advance booking to consume after save via consumeAdvanceFIFO.
   * Reduces cashier tender only — do not subtract from persisted net_amount
   * and do not pass into derivePaidAndStatus.advanceApplied (that slot is CN).
   */
  advanceApplied?: number;
  refundAmount?: number;
  salesman?: string | null;
  notes?: string | null;
  pointsRedeemedAmount?: number;
  taxType?: "inclusive" | "exclusive" | "no_gst";
  /**
   * Optional caller-supplied sale_date (timestamptz ISO, +05:30 shape).
   * When provided (e.g. POS "allow date change" is ON and the cashier picked a
   * date), it overrides the default today-in-IST stamp. Omit to keep the
   * standard behavior. Format must match `saleDateIsoIst()`.
   */
  saleDate?: string;
}

function buildPosWhatsAppCaptureMeta(
  saleNumber: string,
  saleId: string,
  saleDate: Date,
  saleData: SaleData,
  finalPaymentMethod: string,
  paidAmt: number,
): PosWhatsAppPdfCaptureMeta {
  return {
    saleNumber,
    saleId,
    saleDate,
    snapshot: {
      customerName: saleData.customerName,
      customerPhone: saleData.customerPhone || "",
      customerId: saleData.customerId,
      items: saleData.items,
      subTotal: saleData.grossAmount,
      discount: saleData.discountAmount + saleData.flatDiscountAmount,
      saleReturnAdjust: saleData.saleReturnAdjust,
      grandTotal: saleData.netAmount,
      paymentMethod: finalPaymentMethod,
      paidAmount: paidAmt,
      previousBalance: 0,
      roundOff: saleData.roundOff,
      salesman: saleData.salesman || "",
      taxType: saleData.taxType || "inclusive",
      notes: saleData.notes,
      enableMrp: true,
    },
  };
}

export const useSaveSale = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const savingLockRef = useRef(false); // Synchronous lock to prevent duplicate saves
  const { awardPoints, isPointsEnabled, calculatePoints } = useCustomerPoints();
  const queryClient = useQueryClient();

  const applyPostSaleInvalidation = (
    organizationId: string | undefined,
    runtimeOptions?: SaveSaleRuntimeOptions,
    saleMeta?: {
      saleDate?: string;
      saleNumber?: string;
      saleSnapshot?: PosDashboardSaleSeed | null;
    },
  ) => {
    invalidateAfterSaleSave(queryClient, organizationId, {
      deferDashboardInvalidation: runtimeOptions?.deferDashboardInvalidation,
      saleDate: saleMeta?.saleDate,
      saleNumber: saleMeta?.saleNumber,
      saleSnapshot: saleMeta?.saleSnapshot ?? null,
    });
  };

  const toPosDashboardSaleSeed = (
    sale: Record<string, unknown>,
    totalQty?: number,
  ): PosDashboardSaleSeed => ({
    id: String(sale.id),
    sale_number: (sale.sale_number as string) || null,
    sale_date: (sale.sale_date as string) || null,
    sale_type: (sale.sale_type as string) || null,
    customer_id: (sale.customer_id as string) || null,
    customer_name: (sale.customer_name as string) || null,
    customer_phone: (sale.customer_phone as string) || null,
    gross_amount: Number(sale.gross_amount || 0),
    discount_amount: Number(sale.discount_amount || 0),
    flat_discount_amount: Number(sale.flat_discount_amount || 0),
    flat_discount_percent: Number(sale.flat_discount_percent || 0),
    sale_return_adjust: Number(sale.sale_return_adjust || 0),
    round_off: Number(sale.round_off || 0),
    net_amount: Number(sale.net_amount || 0),
    payment_method: (sale.payment_method as string) || null,
    payment_status: (sale.payment_status as string) || null,
    paid_amount: Number(sale.paid_amount || 0),
    cash_amount: Number(sale.cash_amount || 0),
    card_amount: Number(sale.card_amount || 0),
    upi_amount: Number(sale.upi_amount || 0),
    refund_amount: Number(sale.refund_amount || 0),
    points_redeemed_amount: Number(sale.points_redeemed_amount || 0),
    salesman: (sale.salesman as string) || null,
    notes: (sale.notes as string) || null,
    tax_type: (sale.tax_type as string) || null,
    created_at: (sale.created_at as string) || null,
    created_by: (sale.created_by as string) || null,
    organization_id: (sale.organization_id as string) || null,
    total_qty: totalQty ?? Number(sale.total_qty || 0),
    is_cancelled: Boolean(sale.is_cancelled),
    status: (sale.status as string) || null,
  });
  const shopName = useShopName();
  // Centralized cached org settings (5 min) — used by save handlers below
  const { data: orgSettings } = useSettings();
  const accountingEngineOn = isAccountingEngineEnabled(orgSettings as { accounting_engine_enabled?: boolean } | null);

  /**
   * Auto-correct FY year in literal formats like "INV/25-26/1" → "INV/26-27/1"
   * so stale settings don't produce wrong-year invoices after April 1.
   */
  const generateInvoiceNumber = async (
    format: string,
    seriesStart?: string,
    kind: 'sale' | 'pos' = 'sale'
  ) => {
    const saleSettings =
      kind === 'pos'
        ? { pos_numbering_format: format, pos_series_start: seriesStart }
        : { invoice_numbering_format: format, invoice_series_start: seriesStart };
    return generateOrgSaleNumber(currentOrganization!.id, saleSettings, kind);
  };

  const allocatePosSaleNumber = async () => {
    const saleSettings = (orgSettings as any)?.sale_settings as Record<string, any> | null;
    if (saleSettings?.pos_numbering_format) {
      return generateInvoiceNumber(
        saleSettings.pos_numbering_format,
        saleSettings?.pos_series_start,
        "pos",
      );
    }
    if (saleSettings?.pos_series_start) {
      return generateInvoiceNumber(
        saleSettings.pos_series_start,
        saleSettings.pos_series_start,
        "pos",
      );
    }
    const { data: defaultNumber, error: numberError } = await supabase.rpc(
      "generate_pos_number_atomic",
      { p_organization_id: currentOrganization!.id },
    );
    if (numberError) throw numberError;
    return defaultNumber as string;
  };

  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

  /** Cap line+flat discount to gross (before S/R); toast excess instead of silent drop. */
  const applyDiscountGrossCap = (saleData: SaleData): SaleData => {
    const normalized = normalizeDiscountsAgainstGross({
      grossAmount: saleData.grossAmount,
      discountAmount: saleData.discountAmount || 0,
      flatDiscountAmount: saleData.flatDiscountAmount || 0,
      netAmount: saleData.netAmount,
    });
    if (!normalized.wasCapped) return saleData;
    toast({
      title: "Discount capped to bill",
      description: `Only ₹${normalized.maxApply.toLocaleString("en-IN")} discount can be applied to this bill. ₹${normalized.excess.toLocaleString("en-IN")} was not applied.`,
    });
    return {
      ...saleData,
      discountAmount: normalized.discountAmount,
      flatDiscountAmount: normalized.flatDiscountAmount,
      netAmount: normalized.netAmount,
    };
  };

  /**
   * Cap S/R so persisted net_amount cannot go negative.
   * When Mix settles the excess (cash refund / CN), skip the "future bill" toast —
   * that leftover is intentional same-bill exchange overflow, not silent absorb.
   */
  const applySaleReturnBillCap = (
    saleData: SaleData,
    opts?: { settleExcess?: boolean },
  ): SaleData => {
    const normalized = normalizeSaleReturnAdjustAgainstBill({
      netAmount: saleData.netAmount,
      saleReturnAdjust: saleData.saleReturnAdjust || 0,
    });
    if (!normalized.wasCapped) return saleData;
    if (!opts?.settleExcess) {
      toast({
        title: "S/R adjust capped to bill",
        description: `Only ₹${normalized.maxApply.toLocaleString("en-IN")} of credit can be applied to this bill. ₹${normalized.excess.toLocaleString("en-IN")} remains for a future bill.`,
      });
    }
    return {
      ...saleData,
      netAmount: normalized.netAmount,
      saleReturnAdjust: normalized.saleReturnAdjust,
    };
  };

  const applyBillCaps = (saleData: SaleData, opts?: { settleExcess?: boolean }): SaleData =>
    applySaleReturnBillCap(applyDiscountGrossCap(saleData), opts);

  const getExchangeAmounts = (
    saleData: SaleData,
    refundAmt: number,
    opts?: { issueCreditNote?: boolean },
  ) => {
    const computed = computeExchangeRefundDue({
      netAmount: saleData.netAmount,
      saleReturnAdjust: saleData.saleReturnAdjust || 0,
      explicitRefundAmount: refundAmt,
    });
    const sra = roundMoney(saleData.saleReturnAdjust || 0);
    // CN path: settle excess as credit note (no cash payment voucher).
    if (opts?.issueCreditNote) {
      return {
        isExchangeRefund: false,
        billAmount: computed.billAmount,
        cashRefund: 0,
        roundOffRemainder: 0,
        refundDue: computed.refundDue,
        // Consume applied S/R + excess so leftover pending SR does not double the new CN.
        consumeSrAmount: roundMoney(computed.appliedSr + computed.refundDue),
      };
    }
    const cashRefund = Math.min(Math.max(0, roundMoney(refundAmt || 0)), computed.refundDue);
    const roundOffRemainder = Math.max(0, roundMoney(computed.refundDue - cashRefund));
    return {
      isExchangeRefund: computed.isExchangeRefund && cashRefund > 0.005,
      billAmount: computed.billAmount,
      cashRefund,
      roundOffRemainder,
      refundDue: computed.refundDue,
      // Cash refund of excess must also clear that SR credit (not leave it pending).
      consumeSrAmount: computed.isExchangeRefund
        ? roundMoney(computed.appliedSr + computed.refundDue)
        : sra,
    };
  };

  const writeExchangePaymentVouchers = async (params: {
    saleNumber: string;
    customerId: string;
    txnDate: string;
    cashRefund: number;
    roundOffRemainder: number;
    /** Mix Payment Refund Mode selector — default cash. */
    refundMode?: "cash" | "upi" | "bank_transfer";
  }) => {
    const refundMethod =
      params.refundMode === "upi"
        ? "upi"
        : params.refundMode === "bank_transfer"
          ? "bank_transfer"
          : "cash";

    const writePaymentVoucher = async (
      amount: number,
      method: string,
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
    };

    await writePaymentVoucher(
      params.cashRefund,
      refundMethod,
      `Refund paid for POS exchange ${params.saleNumber}`,
    );
    await writePaymentVoucher(
      params.roundOffRemainder,
      "round_off",
      `Round off adjustment for POS exchange ${params.saleNumber}`,
    );
  };

  const deletePosExchangeVouchersForSaleNumber = async (
    saleNumber: string,
    customerId: string,
  ) => {
    if (!currentOrganization?.id || !saleNumber || !customerId) return;
    await (supabase as any)
      .from("voucher_entries")
      .delete()
      .eq("organization_id", currentOrganization.id)
      .eq("voucher_type", "payment")
      .eq("reference_type", "customer")
      .eq("reference_id", customerId)
      .ilike("description", `%POS exchange ${saleNumber}%`);
    await (supabase as any)
      .from("customer_ledger_entries")
      .delete()
      .eq("organization_id", currentOrganization.id)
      .eq("customer_id", customerId)
      .eq("voucher_type", "PAYMENT")
      .ilike("particulars", `%POS exchange ${saleNumber}%`);
  };

  const markCreditNoteFullyUsedForSrAdjust = async (cnId: string) => {
    if (!currentOrganization?.id) return;
    const { data: note } = await supabase
      .from("credit_notes")
      .select("credit_amount, used_amount")
      .eq("id", cnId)
      .eq("organization_id", currentOrganization.id)
      .maybeSingle();
    if (!note) return;
    const ca = Number((note as { credit_amount?: number }).credit_amount) || 0;
    await supabase
      .from("credit_notes")
      .update({
        used_amount: ca,
        status: "fully_used",
      } as never)
      .eq("id", cnId)
      .eq("organization_id", currentOrganization.id);
  };

  /** After POS S/R adjust, shrink CN face value to remaining credit (return − absorbed on bill). */
  const setLinkedCreditNoteAmount = async (cnId: string, newCreditAmount: number) => {
    if (!currentOrganization?.id || newCreditAmount < 0) return;
    const rounded = roundMoney(newCreditAmount);
    const { data: note } = await supabase
      .from("credit_notes")
      .select("used_amount")
      .eq("id", cnId)
      .eq("organization_id", currentOrganization.id)
      .maybeSingle();
    const ua = Number((note as { used_amount?: number } | null)?.used_amount) || 0;
    const creditAmount = Math.max(rounded, ua);
    if (creditAmount <= 0.01) {
      await markCreditNoteFullyUsedForSrAdjust(cnId);
      return;
    }
    await supabase
      .from("credit_notes")
      .update({
        credit_amount: creditAmount,
        status: "active",
      } as never)
      .eq("id", cnId)
      .eq("organization_id", currentOrganization.id);
  };

  const consumeSaleReturnAdjustments = async (params: {
    customerId: string;
    saleId: string;
    adjustmentAmount: number;
  }) => {
    if (!currentOrganization?.id || !params.customerId || params.adjustmentAmount <= 0) return;

    const { returns: cnPool } = await getAvailableCN(
      supabase,
      params.customerId,
      currentOrganization.id,
      { includeUnlinkedAdjusted: true },
    );
    if (!cnPool.length) {
      throw new Error(
        `Cannot apply sale-return adjust of ₹${roundMoney(params.adjustmentAmount).toLocaleString("en-IN")}: no available credit notes for this customer. Remove the S/R adjust or create/apply a pending return first.`,
      );
    }

    const availableById = new Map(cnPool.map((r) => [r.id, r.available]));

    const { data: pendingSRs } = await supabase
      .from('sale_returns')
      .select(
        'id, net_amount, gross_amount, gst_amount, credit_status, linked_sale_id, credit_available_balance, customer_id, customer_name, organization_id, refund_type, return_date, return_number, original_sale_number, notes, credit_note_id'
      )
      .in(
        'id',
        cnPool.map((r) => r.id),
      )
      .order('return_date', { ascending: true });

    const targetAmount = roundMoney(params.adjustmentAmount);
    const availableSrAmt = (sr: { id: string; credit_status?: string | null; credit_available_balance?: number | null; net_amount?: number | null; linked_sale_id?: string | null }) => {
      if (isSaleReturnConsumedAtBilling(sr)) return 0;
      const fromPool = availableById.get(sr.id);
      if (fromPool != null) return roundMoney(fromPool);
      return roundMoney(
        sr.credit_status === 'partially_adjusted' && sr.credit_available_balance != null
          ? Number(sr.credit_available_balance)
          : Number(sr.net_amount) || 0
      );
    };

    const sortedSRs = [...(pendingSRs || [])].sort((a: any, b: any) => {
      const aAmt = availableSrAmt(a);
      const bAmt = availableSrAmt(b);
      const aExact = Math.abs(aAmt - targetAmount) < 0.01 ? 1 : 0;
      const bExact = Math.abs(bAmt - targetAmount) < 0.01 ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return 0;
    });

    let remaining = targetAmount;
    for (const sr of sortedSRs) {
      if (remaining <= 0) break;
      const srAmt = availableSrAmt(sr);
      if (srAmt <= 0) continue;

      // Ensure a credit_notes row exists so later Sales/Sale-Return Adjust cannot
      // re-spend this return (used_amount must move with billing absorption).
      const ensuredCnId = await ensureCreditNoteForSaleReturn(supabase, {
        organizationId: currentOrganization.id,
        saleReturnId: sr.id,
        creditNoteIdHint: String((sr as { credit_note_id?: string | null }).credit_note_id || "").trim() || null,
        customerNameFallback: (sr as { customer_name?: string | null }).customer_name || undefined,
        returnNumberFallback: (sr as { return_number?: string | null }).return_number || undefined,
        creditAmountFallback: Number(sr.net_amount) || srAmt,
      });

      // Full consume
      if (remaining >= srAmt - 0.01) {
        const updateRow: Record<string, unknown> = {
          credit_status: 'adjusted',
          linked_sale_id: params.saleId,
          credit_available_balance: 0,
        };
        if (ensuredCnId) updateRow.credit_note_id = ensuredCnId;
        await supabase.from('sale_returns').update(updateRow as never).eq('id', sr.id);
        if (ensuredCnId) {
          await markCreditNoteFullyUsedForSrAdjust(ensuredCnId);
        }
        remaining = roundMoney(remaining - srAmt);
        continue;
      }

      // Mamta/Vasim reconciliation: allow partial consume by splitting row.
      // Skip physical split for partially_adjusted rows (Adjust CN dialog already
      // tracks remainder in credit_available_balance); reduce available only.
      if (sr.credit_status === 'partially_adjusted') {
        const consumeAmt = roundMoney(remaining);
        const newAvail = roundMoney(srAmt - consumeAmt);
        await supabase
          .from('sale_returns')
          .update({
            credit_available_balance: newAvail,
            credit_status: newAvail <= 0.01 ? 'adjusted' : 'partially_adjusted',
            linked_sale_id: newAvail <= 0.01 ? params.saleId : (sr as { linked_sale_id?: string | null }).linked_sale_id,
            ...(ensuredCnId ? { credit_note_id: ensuredCnId } : {}),
          })
          .eq('id', sr.id);
        if (ensuredCnId) {
          if (newAvail <= 0.01) {
            await markCreditNoteFullyUsedForSrAdjust(ensuredCnId);
          } else {
            await setLinkedCreditNoteAmount(ensuredCnId, newAvail);
          }
        }
        remaining = 0;
        break;
      }

      const consumeAmt = roundMoney(remaining);
      const leftoverAmt = roundMoney(srAmt - consumeAmt);
      const srGross = roundMoney(Number(sr.gross_amount) || srAmt);
      const srGst = roundMoney(Number(sr.gst_amount) || 0);
      const ratio = srAmt > 0 ? consumeAmt / srAmt : 0;
      const consumedGross = roundMoney(srGross * ratio);
      const consumedGst = roundMoney(srGst * ratio);
      const leftoverGross = roundMoney(srGross - consumedGross);
      const leftoverGst = roundMoney(srGst - consumedGst);

      const cnIdSplit = ensuredCnId || String((sr as { credit_note_id?: string | null }).credit_note_id || "").trim();
      const clearCnFromConsumedRow = Boolean(cnIdSplit && leftoverAmt > 0.01);

      await supabase
        .from('sale_returns')
        .update({
          net_amount: consumeAmt,
          gross_amount: consumedGross,
          gst_amount: consumedGst,
          credit_status: 'adjusted',
          linked_sale_id: params.saleId,
          credit_available_balance: 0,
          notes: `${sr.notes || ''}${sr.notes ? ' | ' : ''}Partially adjusted in POS sale`,
          ...(clearCnFromConsumedRow ? { credit_note_id: null } : cnIdSplit ? { credit_note_id: cnIdSplit } : {}),
        } as never)
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
          credit_note_id: cnIdSplit || null,
          credit_status: 'pending',
          linked_sale_id: null,
          gross_amount: leftoverGross,
          gst_amount: leftoverGst,
          net_amount: leftoverAmt,
          credit_available_balance: leftoverAmt,
          notes: `${sr.notes || ''}${sr.notes ? ' | ' : ''}Pending balance after partial POS adjustment`,
        } as any);
        if (cnIdSplit) {
          await setLinkedCreditNoteAmount(cnIdSplit, leftoverAmt);
        }
      } else if (cnIdSplit) {
        await markCreditNoteFullyUsedForSrAdjust(cnIdSplit);
      }

      remaining = 0;
      break;
    }

    if (remaining > 0.01) {
      throw new Error(
        `Could only absorb ₹${roundMoney(targetAmount - remaining).toLocaleString("en-IN")} of ₹${targetAmount.toLocaleString("en-IN")} sale-return adjust. Reduce S/R adjust or free credit-note balance first.`,
      );
    }
  };

  type SavePaymentMethod = 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later';

  const resolveSalePaymentFields = (
    saleData: SaleData,
    paymentMethod: SavePaymentMethod,
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      bankAmount?: number;
      financeAmount?: number;
      totalPaid: number;
      refundAmount: number;
      issueCreditNote?: boolean;
      refundMode?: "cash" | "upi" | "bank_transfer";
    },
    options?: {
      existingPaidAmount?: number;
      existingPaymentStatus?: string;
      isUpdate?: boolean;
    },
  ) => {
    let cashAmt = 0;
    let cardAmt = 0;
    let upiAmt = 0;
    let paidAmt = 0;
    let refundAmt = saleData.refundAmount || 0;
    let finalPaymentMethod: string = paymentMethod;
    const tenderDue = posTenderDueAfterAdvance(
      saleData.netAmount,
      saleData.advanceApplied || 0,
    );

    if (paymentBreakdown) {
      // Mix Payment may include cash tender above the bill (change). Persist only
      // amounts applied to the bill — storing tender (e.g. ₹8000 on a ₹4500 bill)
      // inflated POS Dashboard Cash / cash tally while Paid stayed capped at net.
      // Tender due excludes advance (consumed after save); Mix UI uses the same figure.
      const applied = allocateMixPaymentToBill({
        billAmount: tenderDue,
        cashAmount: paymentBreakdown.cashAmount,
        cardAmount: paymentBreakdown.cardAmount,
        upiAmount: paymentBreakdown.upiAmount,
        bankAmount: paymentBreakdown.bankAmount,
        financeAmount: paymentBreakdown.financeAmount,
      });
      cashAmt = applied.cash;
      cardAmt = applied.card;
      upiAmt = applied.upi;
      paidAmt = applied.totalApplied;
      refundAmt = paymentBreakdown.refundAmount;
      finalPaymentMethod = 'multiple';
    } else if (options?.isUpdate) {
      if (paymentMethod === 'pay_later') {
        paidAmt = options.existingPaidAmount || 0;
      } else if (
        (options.existingPaidAmount || 0) === 0 ||
        options.existingPaymentStatus === 'completed'
      ) {
        paidAmt = tenderDue;
        if (paymentMethod === 'cash') cashAmt = paidAmt;
        else if (paymentMethod === 'card') cardAmt = paidAmt;
        else if (paymentMethod === 'upi') upiAmt = paidAmt;
      } else {
        paidAmt = options.existingPaidAmount || 0;
        if (paymentMethod === 'cash') cashAmt = paidAmt;
        else if (paymentMethod === 'card') cardAmt = paidAmt;
        else if (paymentMethod === 'upi') upiAmt = paidAmt;
      }
    } else {
      paidAmt = paymentMethod === 'pay_later' ? 0 : tenderDue;
      if (paymentMethod === 'cash') cashAmt = tenderDue;
      else if (paymentMethod === 'card') cardAmt = tenderDue;
      else if (paymentMethod === 'upi') upiAmt = tenderDue;
    }

    const exchange = getExchangeAmounts(saleData, refundAmt, {
      issueCreditNote: !!paymentBreakdown?.issueCreditNote,
    });
    if (exchange.isExchangeRefund) {
      paidAmt = Math.max(0, saleData.netAmount || 0);
      cashAmt = 0;
      cardAmt = 0;
      upiAmt = 0;
      // Persist cash refund on sales.refund_amount (carrier for dashboard / ledger).
      refundAmt = exchange.cashRefund;
    } else if (paymentBreakdown?.issueCreditNote) {
      refundAmt = 0;
    }

    const cashReceived = paidAmt;
    const legacyStatus =
      paidAmt >= saleData.netAmount
        ? 'completed'
        : paidAmt > 0
          ? 'partial'
          : paymentMethod === 'pay_later'
            ? 'pending'
            : 'pending';

    const { paidAmount, paymentStatus } = derivePaidAndStatus({
      netAmount: saleData.netAmount,
      saleReturnAdjust: saleData.saleReturnAdjust || 0,
      cashReceived,
      advanceApplied: saleData.creditApplied || 0,
      cnApplied: 0,
      discountGiven: saleData.pointsRedeemedAmount || 0,
      paymentMethod,
    });

    warnSettlementPathMismatch(
      options?.isUpdate ? 'useSaveSale.updateSale' : 'useSaveSale.saveSale',
      legacyStatus,
      paymentStatus,
    );

    return {
      cashAmt,
      cardAmt,
      upiAmt,
      paidAmt: paidAmount,
      refundAmt,
      payStatus: paymentStatus,
      finalPaymentMethod,
      isExchangeRefund: exchange.isExchangeRefund,
      exchange,
      consumeSrAmount: exchange.consumeSrAmount,
    };
  };

  const saveSale = async (
    saleData: SaleData,
    paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later',
    paymentBreakdown?: {
      cashAmount: number;
      cardAmount: number;
      upiAmount: number;
      bankAmount?: number;
      financeAmount?: number;
      totalPaid: number;
      refundAmount: number;
      issueCreditNote?: boolean;
      refundMode?: "cash" | "upi" | "bank_transfer";
    },
    saleType: 'pos' | 'sale_invoice' = 'pos',
    runtimeOptions?: SaveSaleRuntimeOptions,
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

    const hasNamedCustomer = () =>
      !!saleData.customerName?.trim() &&
      saleData.customerName.trim().toLowerCase() !== "walk-in customer";

    // Server-side safety net: Pay Later (credit) bills MUST have a named customer.
    if (paymentMethod === "pay_later") {
      const phoneOk = !!saleData.customerPhone?.trim();
      if (!hasNamedCustomer() && !phoneOk) {
        savingLockRef.current = false;
        toast({
          title: "Customer Required for Credit Bill",
          description: "Please add customer name or mobile number before saving a Pay Later invoice.",
          variant: "destructive",
        });
        return null;
      }
    }

    // Mix payment with unpaid credit balance must have a named customer.
    // Remainder covered by advance (consumed after save) is not Mix credit.
    if (paymentMethod === "multiple" && paymentBreakdown) {
      const mixCreditAmount = Math.max(
        0,
        posTenderDueAfterAdvance(saleData.netAmount, saleData.advanceApplied || 0) -
          paymentBreakdown.totalPaid,
      );
      if (mixCreditAmount > 0.01 && !hasNamedCustomer()) {
        savingLockRef.current = false;
        toast({
          title: "Customer Name Required",
          description: "Please add customer name when mix payment includes a credit balance.",
          variant: "destructive",
        });
        return null;
      }
    }

    const settleExcess =
      (paymentBreakdown?.refundAmount || 0) > 0.005 ||
      !!paymentBreakdown?.issueCreditNote ||
      (saleData.refundAmount || 0) > 0.005;
    saleData = applyBillCaps(saleData, { settleExcess });

    try {
      preSaveInvariants({
        netAmount: saleData.netAmount,
        items: saleData.items,
        customerId: saleData.customerId,
        paymentMethod,
        saleReturnAdjust: saleData.saleReturnAdjust,
        grossAmount: saleData.grossAmount,
        discountAmount: saleData.discountAmount,
        flatDiscountAmount: saleData.flatDiscountAmount,
        paidAmount:
          paymentBreakdown?.totalPaid ??
          (paymentMethod === 'pay_later' ? 0 : saleData.netAmount),
      });
    } catch (invErr) {
      savingLockRef.current = false;
      toast({
        title: 'Cannot save sale',
        description: invErr instanceof Error ? invErr.message : 'Validation failed',
        variant: 'destructive',
      });
      return null;
    }

    setIsSaving(true);

    let insertedSaleIdForRollback: string | null = null;
    try {
      // Refresh access token proactively if it's near expiry — POS terminals
      // often stay visible for hours and can miss auto-refresh, causing "JWT
      // expired" mid-save.
      await ensureFreshSupabaseSession();
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

      const {
        cashAmt,
        cardAmt,
        upiAmt,
        paidAmt,
        refundAmt,
        payStatus,
        finalPaymentMethod,
        isExchangeRefund,
        exchange,
        consumeSrAmount,
      } = resolveSalePaymentFields(saleData, paymentMethod, paymentBreakdown);

      // Insert sale record — IST business date (not UTC day after midnight IST).
      // Honor a caller-supplied backdated sale_date (POS date-change) when present.
      const saleDateIso = saleData.saleDate || saleDateIsoIst();

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          sale_type: saleType,
          sale_date: saleDateIso,
          customer_id: saleData.customerId || null,
          customer_name: resolvePosCustomerName(saleData.customerName),
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
          tax_type: saleData.taxType || "inclusive",
          created_by: user.id,
          organization_id: currentOrganization.id,
          shop_name: shopName || null,
        })
        .select()
        .single();

      if (saleError) throw saleError;
      insertedSaleIdForRollback = sale.id;

      if (accountingEngineOn) {
        postSaleJournalInBackground(
          sale.id,
          currentOrganization.id,
          Number(saleData.netAmount || 0),
          Number(paidAmt || 0),
          String(finalPaymentMethod || ""),
          sale.sale_date,
          supabase,
        );
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
          gst_percent: saleData.taxType === "no_gst" ? 0 : item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
          is_dc_item: (item as any).isDcProduct === true,
          item_notes: (item as any).itemNotes || null,
        };
      });

      await insertSaleItemsInChunks(supabase, saleItems);
      insertedSaleIdForRollback = null;

      if (isExchangeRefund && saleData.customerId) {
        try {
          const txnDate = istCalendarYmd();
          await writeExchangePaymentVouchers({
            saleNumber,
            customerId: saleData.customerId,
            txnDate,
            cashRefund: exchange.cashRefund,
            roundOffRemainder: exchange.roundOffRemainder,
            refundMode: paymentBreakdown?.refundMode,
          });
        } catch (exErr) {
          console.error('Exchange refund voucher write failed:', exErr);
        }
      }

      // Mark consumed sale_return(s) as adjusted and link to this sale.
      // Exchange excess (cash refund / CN): consume applied + excess so leftover
      // pending SR credit does not remain after the overflow was settled.
      const srConsumeAmount = Math.max(saleData.saleReturnAdjust || 0, consumeSrAmount || 0);
      if (srConsumeAmount > 0 && saleData.customerId) {
        const runSrConsume = () =>
          consumeSaleReturnAdjustments({
            customerId: saleData.customerId!,
            saleId: sale.id,
            adjustmentAmount: srConsumeAmount,
          });
        if (runtimeOptions?.nonBlockingSaleReturnConsume) {
          void runSrConsume().catch((srErr) => console.error('Failed to mark SR as adjusted:', srErr));
        } else {
          await runSrConsume();
        }
      }

      try {
        const recomputed = await applyRecomputedSalePaymentState(
          sale.id,
          currentOrganization.id,
          supabase,
        );
        if (!recomputed.skipped) {
          sale.paid_amount = recomputed.paidAmount;
          sale.payment_status = recomputed.paymentStatus;
        }
      } catch (recomputeErr) {
        console.error("applyRecomputedSalePaymentState failed after save:", recomputeErr);
      }

      let pointsAwarded = 0;
      // No points earn on bills that redeem points (pending stays 0).
      const redeemedOnBill = (saleData.pointsRedeemedAmount || 0) > 0;
      if (
        isPointsEnabled &&
        saleData.customerId &&
        paymentMethod !== "pay_later" &&
        !redeemedOnBill
      ) {
        pointsAwarded = calculatePoints(saleData.netAmount);
        void awardPoints(saleData.customerId, sale.id, saleData.netAmount, saleNumber).catch((err) =>
          console.error("Award points failed (non-blocking):", err),
        );
      }

      // Auto-send WhatsApp invoice notification - FIRE AND FORGET (non-blocking)
      // This runs in the background so it doesn't delay the print dialog
      if (saleData.customerPhone && currentOrganization?.id && !runtimeOptions?.skipWhatsAppAutoSend) {
        const whatsAppPromise = (async () => { try {
          // Check WhatsApp settings
          const { data: whatsappSettings } = await supabase
            .from('whatsapp_api_settings')
            .select('is_active, auto_send_invoice, send_provider, invoice_template_name, auto_send_invoice_link, invoice_link_message, social_links, send_invoice_pdf, invoice_pdf_template, use_document_header_template, invoice_document_template_name, pdf_min_amount')
            .eq('organization_id', currentOrganization.id)
            .maybeSingle();

          if (whatsappSettings?.is_active && whatsappSettings?.auto_send_invoice) {
            // Read cached org settings (centralized)
            const companySettings = orgSettings as any;
            const companyName = companySettings?.business_name || currentOrganization.name || 'Our Company';
            
            // Build invoice message for template parameters
            const formattedDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
            const formattedAmount = `${Number(saleData.netAmount).toLocaleString('en-IN')}`;

            // Build message text (used as fallback if no template)
            const messageText = `Hello ${resolveWhatsAppCustomerName(saleData.customerName)},\n\nYour invoice ${saleNumber} has been created.\nAmount: ₹${formattedAmount}\nDate: ${formattedDate}\n\nThank you for your business!\n${companyName}`;

            // Build saleData object for dynamic parameter building in edge function
            const saleDataForWhatsApp = {
              sale_id: sale.id,
              org_slug: currentOrganization.slug,
              customer_name: resolveWhatsAppCustomerName(saleData.customerName),
              sale_number: saleNumber,
              sale_date: sale.sale_date,
              net_amount: saleData.netAmount,
              gross_amount: saleData.grossAmount,
              discount_amount: saleData.discountAmount,
              payment_status: sale.payment_status,
              items_count: saleData.items.reduce((sum, item) => sum + item.quantity, 0),
              salesman: saleData.salesman,
              organization_name: companyName,
              bill_context: 'pos',
              invoice_paper_format: (saleSettings as any)?.invoice_paper_format || '',
              sales_bill_format: (saleSettings as any)?.sales_bill_format || '',
              pos_bill_format: (saleSettings as any)?.pos_bill_format || '',
              invoice_template:
                (saleSettings as any)?.pos_invoice_template ||
                (saleSettings as any)?.invoice_template ||
                '',
              sale_source: 'pos',
              website: (whatsappSettings.social_links as Record<string, string> | null)?.website || '',
              instagram: (whatsappSettings.social_links as Record<string, string> | null)?.instagram || '',
              facebook: (whatsappSettings.social_links as Record<string, string> | null)?.facebook || '',
              google_review_link: (whatsappSettings.social_links as Record<string, string> | null)?.google_review || '',
            };

            const isWappConnect = whatsappSettings.send_provider === 'wappconnect';

            if (isWappConnect) {
              try {
                if (whatsappSettings.send_invoice_pdf === false) return;

                const documentFilename = `Invoice_${saleNumber.replace(/\//g, '-')}.pdf`;
                let pdfBase64: string | null = null;
                const shouldAttachPdf =
                  (saleData.netAmount ?? 0) >= (whatsappSettings.pdf_min_amount ?? 0);

                if (shouldAttachPdf) {
                  const taxAmount = saleData.items.reduce((sum, item) => {
                    const taxableAmount = item.netAmount / (1 + item.gstPer / 100);
                    return sum + (item.netAmount - taxableAmount);
                  }, 0);

                  const pdfData: InvoicePdfData = {
                    billNo: saleNumber,
                    billDate: new Date(sale.sale_date || sale.created_at || Date.now()),
                    customerName: resolvePosCustomerName(saleData.customerName),
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
                  try {
                    pdfBase64 = runtimeOptions?.capturePdfBase64
                      ? await runtimeOptions.capturePdfBase64(
                          buildPosWhatsAppCaptureMeta(
                            saleNumber,
                            sale.id,
                            new Date(sale.sale_date || sale.created_at || Date.now()),
                            saleData,
                            finalPaymentMethod,
                            paidAmt,
                          ),
                        )
                      : await generateInvoicePdfBase64(pdfData);
                  } catch (captureErr) {
                    console.error('WhatsApp invoice PDF capture failed, falling back to basic PDF:', captureErr);
                    pdfBase64 = await generateInvoicePdfBase64(pdfData);
                  }
                }

                if (shouldAttachPdf && !pdfBase64) {
                  console.error('WhatsApp WappConnect invoice PDF was enabled but PDF generation failed; skipping text-only send.');
                  return;
                }

                const invoiceCaption = await buildSalesInvoiceWhatsAppCaption(
                  currentOrganization.id,
                  saleDataForWhatsApp,
                  companyName,
                );

                let wappConnectDocumentUrl: string | undefined;
                if (pdfBase64) {
                  wappConnectDocumentUrl = await uploadWappConnectInvoicePdfFromBase64(
                    pdfBase64,
                    currentOrganization.id,
                    documentFilename,
                  );
                }

                await supabase.functions.invoke('send-whatsapp', {
                  body: {
                    organizationId: currentOrganization.id,
                    phone: saleData.customerPhone,
                    message: invoiceCaption,
                    templateType: 'sales_invoice',
                    saleData: saleDataForWhatsApp,
                    referenceId: sale.id,
                    referenceType: 'sale',
                    documentUrl: wappConnectDocumentUrl,
                    documentFilename,
                    useWappConnect: true,
                  },
                });
              } catch (wappConnectError) {
                console.error('WhatsApp WappConnect invoice send failed:', wappConnectError);
              }
            } else {
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
                    documentUrl: undefined,
                    documentFilename: undefined,
                    documentCaption: undefined,
                    useDocumentHeaderTemplate: false,
                    documentHeaderTemplateName: null,
                    pdfBlob: null,
                  }
                });
              } catch (flowAError) {
                console.error('WhatsApp Flow A (utility template) failed:', flowAError);
              }
            }

            // ============================================
            // FLOW B: Document Header Template with PDF
            // Only if "Direct PDF Delivery" is enabled AND document template is set
            // ============================================
            const shouldSendPdfFlow = whatsappSettings.use_document_header_template && 
              !!whatsappSettings.invoice_document_template_name &&
              (saleData.netAmount ?? 0) >= (whatsappSettings.pdf_min_amount ?? 0);

            if (shouldSendPdfFlow) {
              try {
                const taxAmount = saleData.items.reduce((sum, item) => {
                  const taxableAmount = item.netAmount / (1 + item.gstPer / 100);
                  return sum + (item.netAmount - taxableAmount);
                }, 0);

                const pdfData: InvoicePdfData = {
                  billNo: saleNumber,
                  billDate: new Date(sale.sale_date || sale.created_at || Date.now()),
                  customerName: resolvePosCustomerName(saleData.customerName),
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
                let pdfBase64: string | null = null;
                try {
                  pdfBase64 = runtimeOptions?.capturePdfBase64
                    ? await runtimeOptions.capturePdfBase64(
                        buildPosWhatsAppCaptureMeta(
                          saleNumber,
                          sale.id,
                          new Date(sale.sale_date || sale.created_at || Date.now()),
                          saleData,
                          finalPaymentMethod,
                          paidAmt,
                        ),
                      )
                    : await generateInvoicePdfBase64(pdfData);
                } catch (captureErr) {
                  console.error('WhatsApp invoice PDF capture failed, falling back to basic PDF:', captureErr);
                  pdfBase64 = await generateInvoicePdfBase64(pdfData);
                }

                if (pdfBase64) {
                  await supabase.functions.invoke('send-whatsapp', {
                    body: {
                      organizationId: currentOrganization.id,
                      phone: saleData.customerPhone,
                      message: `Invoice ${saleNumber} PDF attached`,
                      templateType: 'sales_invoice_pdf',
                      templateName: null,
                      saleData: saleDataForWhatsApp,
                      referenceId: sale.id,
                      referenceType: 'sale',
                      useDocumentHeaderTemplate: true,
                      documentHeaderTemplateName: whatsappSettings.invoice_document_template_name,
                      pdfBlob: pdfBase64,
                      documentFilename: documentFilename,
                    }
                  });
                }
              } catch (flowBError) {
                console.error('WhatsApp Flow B (PDF delivery) failed:', flowBError);
              }
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

      const totalQty = saleData.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      applyPostSaleInvalidation(currentOrganization.id, runtimeOptions, {
        saleDate: sale.sale_date,
        saleNumber: sale.sale_number,
        saleSnapshot: toPosDashboardSaleSeed(sale as Record<string, unknown>, totalQty),
      });

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
      if (insertedSaleIdForRollback) {
        const saleId = insertedSaleIdForRollback;
        try {
          const [{ count: itemCount }, { data: header }] = await Promise.all([
            supabase
              .from("sale_items")
              .select("id", { count: "exact", head: true })
              .eq("sale_id", saleId)
              .is("deleted_at", null),
            supabase
              .from("sales")
              .select("sale_type, payment_status")
              .eq("id", saleId)
              .maybeSingle(),
          ]);
          const decision = decidePosSaveAutoRollback({
            saleType: header?.sale_type,
            paymentStatus: header?.payment_status,
            itemCount: itemCount ?? 0,
          });
          if (decision.action === "keep_sale") {
            console.error("[useSaveSale] skipped auto-rollback", decision.reason, saleId);
            toast({
              title: "Sale was saved",
              description:
                "A follow-up step failed, but the bill was kept and was not auto-deleted. Check POS Dashboard / Last Bill.",
            });
          } else {
            const rollbackAt = new Date().toISOString();
            await supabase.from("sale_items").delete().eq("sale_id", saleId);
            await supabase
              .from("sales")
              .update({
                deleted_at: rollbackAt,
                deleted_by: user?.id ?? null,
                is_cancelled: true,
                cancelled_at: rollbackAt,
                cancelled_by: user?.id ?? null,
                cancelled_reason: "auto-rollback: sale_items insert failed during save",
                payment_status: "cancelled",
              })
              .eq("id", saleId);
          }
        } catch (rollbackErr) {
          console.error("[useSaveSale] auto-rollback guard failed — sale left in place", rollbackErr);
        }
      }
      console.error('Error saving sale:', error);
      const isDuplicate = error?.code === '23505' || 
                          error?.message?.includes('duplicate key');
      const isTaxTypeCheck =
        error?.code === "23514" &&
        (error?.message?.includes("sales_tax_type_check") ||
          error?.message?.includes("tax_type"));
      toast({
        title: isDuplicate ? "Bill number conflict" : "Error saving sale",
        description: isDuplicate
          ? "Another user saved a bill at the same time. Please try again."
          : isTaxTypeCheck
            ? "Without GST is not enabled on the database yet. Apply migration sales_tax_type_allow_no_gst, then retry."
          : isJwtExpiredError(error)
            ? "Session expired — refreshing. Please click Save again."
            : isStatementTimeoutError(error)
              ? saleSaveTimeoutMessage()
              : error.message || "An error occurred while saving the sale",
        variant: "destructive",
      });
      if (isJwtExpiredError(error)) {
        void supabase.auth.refreshSession();
      }
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
      bankAmount?: number;
      financeAmount?: number;
      totalPaid: number;
      refundAmount: number;
      issueCreditNote?: boolean;
      refundMode?: "cash" | "upi" | "bank_transfer";
    },
    runtimeOptions?: SaveSaleRuntimeOptions,
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

    const hasNamedCustomer = () =>
      !!saleData.customerName?.trim() &&
      saleData.customerName.trim().toLowerCase() !== "walk-in customer";

    // Server-side safety net: Pay Later (credit) bills MUST have a named customer.
    if (paymentMethod === "pay_later") {
      const phoneOk = !!saleData.customerPhone?.trim();
      if (!hasNamedCustomer() && !phoneOk) {
        savingLockRef.current = false;
        toast({
          title: "Customer Required for Credit Bill",
          description: "Please add customer name or mobile number before saving a Pay Later invoice.",
          variant: "destructive",
        });
        return null;
      }
    }

    if (paymentMethod === "multiple" && paymentBreakdown) {
      const mixCreditAmount = Math.max(
        0,
        posTenderDueAfterAdvance(saleData.netAmount, saleData.advanceApplied || 0) -
          paymentBreakdown.totalPaid,
      );
      if (mixCreditAmount > 0.01 && !hasNamedCustomer()) {
        savingLockRef.current = false;
        toast({
          title: "Customer Name Required",
          description: "Please add customer name when mix payment includes a credit balance.",
          variant: "destructive",
        });
        return null;
      }
    }

    const settleExcessUpdate =
      (paymentBreakdown?.refundAmount || 0) > 0.005 ||
      !!paymentBreakdown?.issueCreditNote ||
      (saleData.refundAmount || 0) > 0.005;
    saleData = applyBillCaps(saleData, { settleExcess: settleExcessUpdate });

    try {
      preSaveInvariants({
        netAmount: saleData.netAmount,
        items: saleData.items,
        customerId: saleData.customerId,
        paymentMethod,
        saleReturnAdjust: saleData.saleReturnAdjust,
        grossAmount: saleData.grossAmount,
        discountAmount: saleData.discountAmount,
        flatDiscountAmount: saleData.flatDiscountAmount,
      });
    } catch (invErr) {
      savingLockRef.current = false;
      toast({
        title: 'Cannot update sale',
        description: invErr instanceof Error ? invErr.message : 'Validation failed',
        variant: 'destructive',
      });
      return null;
    }

    setIsSaving(true);

    try {
      await ensureFreshSupabaseSession();
      // Fetch current paid_amount to preserve partial payments during edit
      const { data: existingSale } = await supabase
        .from('sales')
        .select('paid_amount, payment_status, sale_return_adjust, sale_number, sale_date, customer_id, customer_name, net_amount')
        .eq('id', saleId)
        .single();
      const existingPaidAmount = existingSale?.paid_amount || 0;
      const priorStatus = existingSale?.payment_status;

      // Safety guard: surface destructive edits to an existing bill.
      // Catches the "accidentally Modified the wrong invoice" case where one user
      // opens another user's recent bill from the dashboard and unknowingly
      // replaces its customer / amount.
      try {
        const prevCustId = (existingSale as { customer_id?: string | null } | null)?.customer_id ?? null;
        const prevCustName = ((existingSale as { customer_name?: string | null } | null)?.customer_name ?? '').trim().toUpperCase();
        const newCustId = saleData.customerId ?? null;
        const newCustName = (saleData.customerName ?? '').trim().toUpperCase();
        const prevAmt = Number((existingSale as { net_amount?: number | null } | null)?.net_amount ?? 0);
        const newAmt = Number(saleData.netAmount ?? 0);

        const customerChanged =
          (prevCustId && newCustId && prevCustId !== newCustId) ||
          (prevCustName && newCustName && prevCustName !== newCustName);
        const amountChangedBig =
          prevAmt > 0 && Math.abs(newAmt - prevAmt) / prevAmt > 0.5;

        if ((customerChanged || amountChangedBig) && typeof window !== 'undefined') {
          const billNo = (existingSale as { sale_number?: string | null } | null)?.sale_number || saleId.slice(0, 8);
          const lines = [
            `You are editing bill ${billNo}.`,
            '',
          ];
          if (customerChanged) {
            lines.push(`Customer will change from "${prevCustName || '—'}" to "${newCustName || '—'}".`);
          }
          if (amountChangedBig) {
            lines.push(`Amount will change from ₹${prevAmt.toLocaleString('en-IN')} to ₹${newAmt.toLocaleString('en-IN')}.`);
          }
          lines.push('', 'This will overwrite the original bill. Continue?');

          const ok = window.confirm(lines.join('\n'));
          if (!ok) {
            setIsSaving(false);
            savingLockRef.current = false;
            return null;
          }
        }
      } catch {
        // never block save on guard errors
      }

      // Guard: if sale_return_adjust is being reduced, restore the linked SR(s)
      const oldSRA = Number(existingSale?.sale_return_adjust || 0);
      const newSRA = roundMoney(Number(saleData.saleReturnAdjust || 0));

      if (oldSRA > 0 && newSRA < oldSRA - 0.01) {
        const { data: linkedSRs } = await supabase
          .from('sale_returns')
          .select(
            'id, net_amount, gross_amount, gst_amount, credit_status, customer_id, customer_name, organization_id, refund_type, return_date, return_number, original_sale_number, notes, credit_note_id'
          )
          .eq('linked_sale_id', saleId)
          .in('credit_status', ['adjusted', 'partially_adjusted'])
          .is('deleted_at', null);

        if (linkedSRs && linkedSRs.length > 0) {
          if (newSRA <= 0.01) {
            for (const sr of linkedSRs) {
              await supabase
                .from('sale_returns')
                .update({
                  credit_status: 'pending',
                  linked_sale_id: null,
                  credit_available_balance: null,
                })
                .eq('id', sr.id);
            }
          } else {
            const sr = linkedSRs[0];
            const srAmt = roundMoney(Number(sr.net_amount) || 0);

            if (srAmt > newSRA + 0.01) {
              const ratio = srAmt > 0 ? newSRA / srAmt : 0;
              const consumedGross = roundMoney((Number(sr.gross_amount) || srAmt) * ratio);
              const consumedGst = roundMoney((Number(sr.gst_amount) || 0) * ratio);
              const leftoverAmt = roundMoney(srAmt - newSRA);
              const leftoverGross = roundMoney((Number(sr.gross_amount) || srAmt) - consumedGross);
              const leftoverGst = roundMoney((Number(sr.gst_amount) || 0) - consumedGst);

              await supabase
                .from('sale_returns')
                .update({
                  net_amount: newSRA,
                  gross_amount: consumedGross,
                  gst_amount: consumedGst,
                  credit_available_balance: 0,
                  notes: `${sr.notes || ''}${sr.notes ? ' | ' : ''}Reduced after invoice edit (was ${srAmt})`,
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
                  notes: `Pending balance after invoice ${existingSale?.sale_number || saleId} edit`,
                } as any);
              }
            }
          }
        }
      }

      const {
        cashAmt,
        cardAmt,
        upiAmt,
        paidAmt,
        refundAmt,
        payStatus,
        finalPaymentMethod,
        isExchangeRefund,
        exchange,
        consumeSrAmount,
      } = resolveSalePaymentFields(saleData, paymentMethod, paymentBreakdown, {
        existingPaidAmount,
        existingPaymentStatus: existingSale?.payment_status,
        isUpdate: true,
      });

      const previousSaleNumber = String(existingSale?.sale_number || "");
      const promoteHoldNumber = shouldPromoteHoldNumberToPos(
        previousSaleNumber,
        payStatus,
      );
      const promotedSaleNumber = promoteHoldNumber
        ? await allocatePosSaleNumber()
        : null;

      // First-time completion of hold/pending: stamp sale_date only if the bill never had one.
      // Do not re-date invoices that already have sale_date (e.g. old pending bills edited later).
      const hadPriorSaleDate = !!existingSale?.sale_date;
      const completingOpenBill =
        (priorStatus === "hold" || priorStatus === "pending") &&
        payStatus !== "pending";
      // A caller-supplied backdate (POS date-change ON) always wins; otherwise
      // keep the existing rule: only stamp when first-completing an open bill.
      const saleDatePatch =
        saleData.saleDate
          ? { sale_date: saleData.saleDate }
          : completingOpenBill && !hadPriorSaleDate
          ? { sale_date: saleDateIsoIst() }
          : {};

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
          gst_percent: saleData.taxType === "no_gst" ? 0 : item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
          item_notes: (item as any).itemNotes || null,
        };
      });

      await insertSaleItemsInChunks(supabase, saleItems);

      // Step 3: Update the sales record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .update({
          ...(promotedSaleNumber
            ? { sale_number: promotedSaleNumber, held_cart_data: null }
            : {}),
          customer_id: saleData.customerId || null,
          customer_name: resolvePosCustomerName(saleData.customerName),
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
          tax_type: saleData.taxType || "inclusive",
          updated_at: new Date().toISOString(),
          ...saleDatePatch,
        })
        .eq('id', saleId)
        .select()
        .single();

      if (saleError) throw saleError;

      if (accountingEngineOn) {
        void (async () => {
          try {
            await deleteJournalEntryByReference(currentOrganization.id, "Sale", saleId, supabase);
            postSaleJournalInBackground(
              sale.id,
              currentOrganization.id,
              Number(saleData.netAmount || 0),
              Number(paidAmt || 0),
              String(finalPaymentMethod || ""),
              sale.sale_date,
              supabase,
            );
          } catch (journalErr) {
            console.error("Auto-journal (sale update) failed:", journalErr);
          }
        })();
      }

      if (isExchangeRefund && saleData.customerId && sale?.sale_number) {
        try {
          const txnDate = istCalendarYmd();
          if (previousSaleNumber && previousSaleNumber !== sale.sale_number) {
            await deletePosExchangeVouchersForSaleNumber(
              previousSaleNumber,
              saleData.customerId,
            );
          }
          await deletePosExchangeVouchersForSaleNumber(
            sale.sale_number,
            saleData.customerId,
          );
          await writeExchangePaymentVouchers({
            saleNumber: sale.sale_number,
            customerId: saleData.customerId,
            txnDate,
            cashRefund: exchange.cashRefund,
            roundOffRemainder: exchange.roundOffRemainder,
            refundMode: paymentBreakdown?.refundMode,
          });
        } catch (exErr) {
          console.error('Exchange refund voucher refresh failed:', exErr);
        }
      }

      const srConsumeAmountUpdate = Math.max(saleData.saleReturnAdjust || 0, consumeSrAmount || 0);
      if (srConsumeAmountUpdate > 0 && saleData.customerId) {
        const runSrConsume = () =>
          consumeSaleReturnAdjustments({
            customerId: saleData.customerId!,
            saleId: sale.id,
            adjustmentAmount: srConsumeAmountUpdate,
          });
        if (runtimeOptions?.nonBlockingSaleReturnConsume) {
          void runSrConsume().catch((srErr) => console.error('Failed to mark SR as adjusted:', srErr));
        } else {
          await runSrConsume();
        }
      }

      try {
        const recomputed = await applyRecomputedSalePaymentState(
          sale.id,
          currentOrganization.id,
          supabase,
        );
        if (!recomputed.skipped) {
          sale.paid_amount = recomputed.paidAmount;
          sale.payment_status = recomputed.paymentStatus;
        }
      } catch (recomputeErr) {
        console.error("applyRecomputedSalePaymentState failed after update:", recomputeErr);
      }

      toast({
        title: "Sale updated successfully",
        description: `Sale ${sale.sale_number} has been updated`,
      });

      const totalQty = saleData.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      applyPostSaleInvalidation(currentOrganization.id, runtimeOptions, {
        saleDate: sale.sale_date,
        saleNumber: sale.sale_number,
        saleSnapshot: toPosDashboardSaleSeed(sale as Record<string, unknown>, totalQty),
      });

      return sale;
    } catch (error: any) {
      console.error('Error updating sale:', error);
      toast({
        title: "Error updating sale",
        description: isJwtExpiredError(error)
          ? "Session expired — refreshing. Please click Save again."
          : isStatementTimeoutError(error)
            ? saleSaveTimeoutMessage()
            : error.message || "An error occurred while updating the sale",
        variant: "destructive",
      });
      if (isJwtExpiredError(error)) void supabase.auth.refreshSession();
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

    if (posBillHasExchangeRefundDue(saleData.netAmount)) {
      savingLockRef.current = false;
      toast({
        title: "Refund due — use Mix Payment",
        description:
          "S/R is more than the new bill. Use Mix Payment (F6) to refund cash or issue a C/Note. Hold is not allowed on a refund.",
        variant: "destructive",
      });
      return null;
    }

    setIsSaving(true);

    try {
      await ensureFreshSupabaseSession();
      // Store items as JSON in dedicated held_cart_data column (notes preserved for real customer notes)
      const holdData = {
        items: saleData.items,
        flatDiscountPercent: saleData.flatDiscountPercent,
        saleReturnAdjust: saleData.saleReturnAdjust,
        roundOff: saleData.roundOff,
        taxType: saleData.taxType || "inclusive",
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
        customer_name: resolvePosCustomerName(saleData.customerName),
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
        tax_type: saleData.taxType || "inclusive",
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
          : isJwtExpiredError(error)
            ? "Session expired — refreshing. Please click Hold again."
            : error.message || "An error occurred while holding the sale",
        variant: "destructive",
      });
      if (isJwtExpiredError(error)) void supabase.auth.refreshSession();
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
      bankAmount?: number;
      financeAmount?: number;
      totalPaid: number;
      refundAmount: number;
      issueCreditNote?: boolean;
      refundMode?: "cash" | "upi" | "bank_transfer";
    },
    runtimeOptions?: SaveSaleRuntimeOptions,
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

    const settleExcessResume =
      (paymentBreakdown?.refundAmount || 0) > 0.005 ||
      !!paymentBreakdown?.issueCreditNote ||
      (saleData.refundAmount || 0) > 0.005;
    saleData = applyBillCaps(saleData, { settleExcess: settleExcessResume });

    try {
      preSaveInvariants({
        netAmount: saleData.netAmount,
        items: saleData.items,
        customerId: saleData.customerId,
        paymentMethod,
        saleReturnAdjust: saleData.saleReturnAdjust,
        grossAmount: saleData.grossAmount,
        discountAmount: saleData.discountAmount,
        flatDiscountAmount: saleData.flatDiscountAmount,
        paidAmount:
          paymentBreakdown?.totalPaid ??
          (paymentMethod === 'pay_later' ? 0 : saleData.netAmount),
      });
    } catch (invErr) {
      savingLockRef.current = false;
      toast({
        title: 'Cannot complete sale',
        description: invErr instanceof Error ? invErr.message : 'Validation failed',
        variant: 'destructive',
      });
      return null;
    }

    setIsSaving(true);

    try {
      await ensureFreshSupabaseSession();
      const { data: heldRow } = await supabase
        .from("sales")
        .select("sale_number")
        .eq("id", heldSaleId)
        .maybeSingle();
      const previousHoldNumber = String(heldRow?.sale_number || "");
      const newSaleNumber = await allocatePosSaleNumber();

      const {
        cashAmt,
        cardAmt,
        upiAmt,
        paidAmt,
        refundAmt,
        payStatus,
        finalPaymentMethod,
        isExchangeRefund,
        exchange,
        consumeSrAmount,
      } = resolveSalePaymentFields(saleData, paymentMethod, paymentBreakdown);

      const { error: deleteHeldItemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", heldSaleId);
      if (deleteHeldItemsError) throw deleteHeldItemsError;

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
          gst_percent: saleData.taxType === "no_gst" ? 0 : item.gstPer,
          discount_percent: item.discountPercent,
          line_total: item.netAmount,
          hsn_code: item.hsnCode || null,
          discount_share: Math.round(discountShare * 100) / 100,
          round_off_share: Math.round(roundOffShare * 100) / 100,
          net_after_discount: Math.round(netAfterDiscount * 100) / 100,
          per_qty_net_amount: Math.round(perQtyNetAmount * 100) / 100,
          item_notes: (item as any).itemNotes || null,
        };
      });

      await insertSaleItemsInChunks(supabase, saleItems);

      // Update the held sale: assign NEW POS number + current date + completed status
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .update({
          sale_number: newSaleNumber,
          sale_date: saleData.saleDate || saleDateIsoIst(),
          customer_id: saleData.customerId || null,
          customer_name: resolvePosCustomerName(saleData.customerName),
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
          tax_type: saleData.taxType || "inclusive",
          held_cart_data: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', heldSaleId)
        .select()
        .single();

      if (saleError) throw saleError;

      if (accountingEngineOn) {
        void deleteJournalEntryByReference(currentOrganization.id, "Sale", sale.id, supabase).catch(
          (err) => console.error("Delete journal before resume failed:", err),
        );
        postSaleJournalInBackground(
          sale.id,
          currentOrganization.id,
          Number(saleData.netAmount || 0),
          Number(paidAmt || 0),
          String(finalPaymentMethod || ""),
          sale.sale_date,
          supabase,
        );
      }

      if (isExchangeRefund && saleData.customerId && sale?.sale_number) {
        try {
          const txnDate = istCalendarYmd();
          if (previousHoldNumber && previousHoldNumber !== sale.sale_number) {
            await deletePosExchangeVouchersForSaleNumber(
              previousHoldNumber,
              saleData.customerId,
            );
          }
          await writeExchangePaymentVouchers({
            saleNumber: sale.sale_number,
            customerId: saleData.customerId,
            txnDate,
            cashRefund: exchange.cashRefund,
            roundOffRemainder: exchange.roundOffRemainder,
            refundMode: paymentBreakdown?.refundMode,
          });
        } catch (exErr) {
          console.error('Exchange refund voucher write failed (resume):', exErr);
        }
      }

      // Mark consumed sale_return(s) as adjusted and link to this sale (resume-held path)
      const srConsumeAmountResume = Math.max(saleData.saleReturnAdjust || 0, consumeSrAmount || 0);
      if (srConsumeAmountResume > 0 && saleData.customerId) {
        const runSrConsume = () =>
          consumeSaleReturnAdjustments({
            customerId: saleData.customerId!,
            saleId: sale.id,
            adjustmentAmount: srConsumeAmountResume,
          });
        if (runtimeOptions?.nonBlockingSaleReturnConsume) {
          void runSrConsume().catch((srErr) => console.error('Failed to mark SR as adjusted:', srErr));
        } else {
          await runSrConsume();
        }
      }

      try {
        const recomputed = await applyRecomputedSalePaymentState(
          sale.id,
          currentOrganization.id,
          supabase,
        );
        if (!recomputed.skipped) {
          sale.paid_amount = recomputed.paidAmount;
          sale.payment_status = recomputed.paymentStatus;
        }
      } catch (recomputeErr) {
        console.error("applyRecomputedSalePaymentState failed after resume:", recomputeErr);
      }

      toast({
        title: "Sale completed",
        description: `Sale ${sale.sale_number} has been completed`,
      });

      const totalQty = saleData.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      applyPostSaleInvalidation(currentOrganization.id, runtimeOptions, {
        saleDate: sale.sale_date,
        saleNumber: sale.sale_number,
        saleSnapshot: toPosDashboardSaleSeed(sale as Record<string, unknown>, totalQty),
      });

      return sale;
    } catch (error: any) {
      console.error('Error resuming held sale:', error);
      toast({
        title: "Error completing sale",
        description: isJwtExpiredError(error)
          ? "Session expired — refreshing. Please click Save again."
          : isStatementTimeoutError(error)
            ? saleSaveTimeoutMessage()
            : error.message || "An error occurred while completing the sale",
        variant: "destructive",
      });
      if (isJwtExpiredError(error)) void supabase.auth.refreshSession();
      return null;
    } finally {
      savingLockRef.current = false;
      setIsSaving(false);
    }
  };

  return { saveSale, updateSale, holdSale, resumeHeldSale, isSaving };
};
